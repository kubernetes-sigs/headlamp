/*
 * Copyright 2025 The Kubernetes Authors
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

const fs = require('fs');
const PluginManagement = require('./plugin-management');
const PluginManager = PluginManagement.PluginManager;
const Ajv = require('ajv');
const yaml = require('js-yaml');

// Plugin configuration schema
const pluginConfigSchema = {
  type: 'object',
  required: ['plugins'],
  properties: {
    plugins: {
      type: 'array',
      items: {
        type: 'object',
        required: ['name', 'source'],
        properties: {
          name: {
            type: 'string',
            pattern: '^[a-z0-9][a-z0-9-_]*[a-z0-9-]$', // Only allow lowercase, numbers, hyphens, and underscores (not at start/end)
            minLength: 1,
          },
          source: {
            type: 'string',
            pattern: '^https://artifacthub\\.io/packages/[^\\s]+$',
          },
          version: {
            type: 'string',
            pattern: '^\\d+\\.\\d+\\.\\d+', // Semver format
          },
          dependencies: {
            type: 'array',
            items: { type: 'string', pattern: '^[a-z0-9][a-z0-9-_]*[a-z0-9-]$' },
            uniqueItems: true,
          },
        },
      },
    },
    installOptions: {
      type: 'object',
      properties: {
        parallel: { type: 'boolean' },
        maxConcurrent: { type: 'integer', minimum: 1 },
      },
    },
  },
};

const ajv = new Ajv({ allErrors: true });
const validate = ajv.compile(pluginConfigSchema);

/**
 * Manages multiple plugins from a configuration file.
 */
class MultiPluginManager {
  /**
   * @param {string} [pluginsDir=''] - The directory to install plugins to.
   * @param {string} [headlampVersion=''] - The version of Headlamp for compatibility checking.
   * @param {function} [progressCallback=null] - Optional callback for progress updates.
   * @param {AbortSignal} [signal=null] - Optional signal for cancellation.
   */
  constructor(pluginsDir = '', headlampVersion = '', progressCallback = null, signal = null) {
    this.pluginsDir = pluginsDir;
    this.headlampVersion = headlampVersion;
    this.progressCallback = progressCallback;
    this.signal = signal;
  }

  /**
   * Wraps the progress callback to add context about the current plugin installation
   * @private
   */
  _wrapProgressCallback(pluginName, index, total) {
    return progress => {
      if (this.progressCallback) {
        this.progressCallback({
          ...progress,
          plugin: pluginName,
          current: index + 1,
          total,
          percentage: Math.round(((index + 1) / total) * 100),
        });
      }
    };
  }

  /**
   * Installs plugins from a configuration file.
   * @param {string} configPath - Path to yaml configuration file.
   * @returns {Promise<{ failed: number, successful: number, total: number }>}
   */
  async installFromConfig(configPath) {
    if (!fs.existsSync(configPath)) {
      throw new Error('Configuration file not found');
    }
    if (this.progressCallback) {
      this.progressCallback({ message: `Installing plugins from config: ${configPath}` });
    }
    const config = await this.validateConfig(configPath);
    const { parallel = false, maxConcurrent = 1 } = config.installOptions || {};

    if (this.signal?.aborted) {
      throw new Error('Installation cancelled');
    }
    // Create dependency graph and determine installation order
    const graph = this._createDependencyGraph(config.plugins);
    const pluginsNames = config.plugins.map(p => p.name);
    const failedPlugins = new Set();
    const skippedPlugins = new Set();

    if (parallel) {
      // Create optimal chunks that respect dependencies
      const chunks = this._createOptimalChunks(graph, maxConcurrent);

      // Process each chunk
      for (const chunk of chunks) {
        if (this.signal?.aborted) {
          throw new Error('Installation cancelled');
        }

        const chunkPromises = chunk.map(pluginName => {
          const plugin = config.plugins.find(p => p.name === pluginName);
          const deps = graph.get(pluginName) || [];
          const index = pluginsNames.indexOf(pluginName);
          const progressCallback = this._wrapProgressCallback(
            pluginName,
            index,
            pluginsNames.length
          );

          // Check if any dependencies failed or were skipped
          const hasFailedDeps = deps.some(dep => failedPlugins.has(dep));
          const hasSkippedDeps = deps.some(dep => skippedPlugins.has(dep));

          if (hasFailedDeps || hasSkippedDeps) {
            skippedPlugins.add(pluginName);
            return Promise.resolve(
              progressCallback({
                type: 'error',
                message: `Skipped installation since dependencies were ${
                  hasFailedDeps ? 'failed' : 'skipped'
                }: ${deps
                  .filter(d => (hasFailedDeps ? failedPlugins.has(d) : skippedPlugins.has(d)))
                  .join(', ')}`,
                raise: false,
              })
            );
          }

          return this.installPlugin(plugin, progressCallback).then(
            () =>
              progressCallback({
                name: pluginName,
                type: 'success',
                message: 'Plugin installed successfully',
              }),
            error => {
              failedPlugins.add(pluginName);
              progressCallback({
                name: pluginName,
                type: 'error',
                message: error.message,
                raise: false,
              });
            }
          );
        });

        await Promise.all(chunkPromises);
      }
    } else {
      // Sequential installation
      for (const [index, pluginName] of pluginsNames.entries()) {
        if (this.signal?.aborted) {
          throw new Error('Installation cancelled');
        }

        const plugin = config.plugins.find(p => p.name === pluginName);
        const deps = graph.get(pluginName) || [];
        const hasFailedDeps = deps.some(dep => failedPlugins.has(dep));
        const hasSkippedDeps = deps.some(dep => skippedPlugins.has(dep));

        const progressCallback = this._wrapProgressCallback(pluginName, index, pluginsNames.length);

        if (hasFailedDeps || hasSkippedDeps) {
          skippedPlugins.add(pluginName);
          progressCallback({
            name: pluginName,
            status: 'skipped',
            message: `Skipped installation since dependencies were ${
              hasFailedDeps ? 'failed' : 'skipped'
            }: ${deps
              .filter(d => (hasFailedDeps ? failedPlugins.has(d) : skippedPlugins.has(d)))
              .join(', ')}`,
            raise: false,
          });
          continue;
        }

        try {
          await this.installPlugin(plugin, progressCallback);
          progressCallback({
            name: pluginName,
            status: 'success',
            message: 'Plugin installed successfully',
          });
        } catch (error) {
          failedPlugins.add(pluginName);
          progressCallback({
            name: pluginName,
            status: 'error',
            message: error.message,
            raise: false,
          });
        }
      }
    }

    const result = {
      total: pluginsNames.length,
      failed: failedPlugins.size,
      skipped: skippedPlugins.size,
      successful: pluginsNames.length - failedPlugins.size - skippedPlugins.size,
    };
    if (this.progressCallback) {
      // Log final status
      this.progressCallback({
        message: `Bulk installation completed: ${JSON.stringify(result)}`,
      });
    }
    return result;
  }

  /**
   * Creates a dependency graph from plugin configurations
   * @private
   */
  _createDependencyGraph(plugins) {
    const graph = new Map();

    for (const plugin of plugins) {
      graph.set(plugin.name, plugin.dependencies || []);
    }

    return graph;
  }

  async validateConfig(configPath) {
    try {
      if (!fs.statSync(configPath).isFile()) {
        throw new Error(`Configuration file not found: ${configPath}`);
      }
      const configContent = fs.readFileSync(configPath, 'utf8');
      const config = yaml.load(configContent);
      const valid = validate(config);
      if (!valid) {
        const errors = validate.errors.map(err => `${err.instancePath} ${err.message}`).join('\n');
        throw new Error(`Configuration validation failed:\n${errors}`);
      }
      // Check for duplicate plugin names
      const pluginNames = config.plugins.map(p => p.name);
      const duplicatesNames = pluginNames.filter(
        (name, index) => pluginNames.indexOf(name) !== index
      );
      if (duplicatesNames.length > 0) {
        throw new Error(`Duplicate plugin names found: ${duplicatesNames.join(', ')}`);
      }
      // duplicate sources
      const sources = config.plugins.map(p => p.source);
      const duplicateSources = sources.filter((source, index) => sources.indexOf(source) !== index);
      if (duplicateSources.length > 0) {
        throw new Error(`Duplicate plugin sources found: ${duplicateSources.join(', ')}`);
      }
      this._checkCircularDependencies(config.plugins);
      return config;
    } catch (error) {
      if (error.code === 'ENOENT') {
        throw new Error(`Configuration file not found: ${configPath}`);
      }
      throw error;
    }
  }

  _checkCircularDependencies(plugins) {
    const visited = new Set();
    const recStack = new Set(); // Keeps track of nodes in the recursion stack
    const graph = this._createDependencyGraph(plugins);
    function dfs(node) {
      if (recStack.has(node)) {
        throw new Error(`Circular dependencies found for plugin ${node}`);
      }
      if (visited.has(node)) return; // Already processed, skip

      visited.add(node);
      recStack.add(node);

      for (const neighbor of graph.get(node) || []) {
        dfs(neighbor);
      }

      recStack.delete(node); // Remove from recursion stack after processing
    }

    for (const plugin of plugins) {
      if (!visited.has(plugin.name) && dfs(plugin.name)) {
        throw new Error(`Circular dependencies found for plugin ${plugin.name}`);
      }
    }
  }

  /**
   * Install a single plugin
   * @param {Object} plugin - Plugin configuration
   * @param {function} [progressCallback] - Progress callback for this specific plugin
   * @returns {Promise<void>}
   */
  async installPlugin(plugin, progressCallback) {
    progressCallback({ message: `Installing plugin ${plugin.name}` });

    const params = [
      plugin.source,
      this.pluginsDir || undefined,
      this.headlampVersion || undefined,
      progressCallback,
      this.signal,
      plugin.version || undefined,
    ];

    await PluginManager.install(...params);
  }

  /**
   * Creates optimal chunks for parallel installation that respect dependencies
   * Plugins in the same chunk must not depend on each other
   * @private
   */
  _createOptimalChunks(graph, maxConcurrent) {
    const chunks = [];
    const remaining = new Set(graph.keys());

    while (remaining.size > 0) {
      const chunk = [];
      const chunkDeps = new Set(); // Track all deps of plugins in current chunk

      // Try to add plugins to current chunk
      for (const plugin of remaining) {
        const deps = graph.get(plugin) || [];

        // Plugin can be added if:
        // 1. Chunk size < maxConcurrent
        // 2. None of its deps are in current chunk
        // 3. None of its deps are in remaining plugins to be processed
        if (
          chunk.length < maxConcurrent &&
          !deps.some(dep => chunk.includes(dep) || chunkDeps.has(dep))
        ) {
          chunk.push(plugin);
          // Add this plugin's deps to track for next plugins in chunk
          deps.forEach(dep => chunkDeps.add(dep));
        }
      }

      // Remove processed plugins from remaining
      chunk.forEach(plugin => remaining.delete(plugin));
      chunks.push(chunk);
    }

    return chunks;
  }
}

module.exports = MultiPluginManager;
