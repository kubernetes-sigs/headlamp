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

const path = require('path');
const fs = require('fs');
const fsp = require('fs').promises;
const os = require('os');
const MultiPluginManager = require('./multi-plugin-management');

describe('MultiPluginManagement', () => {
  let tempDir;
  let configPath;
  let installer;
  const PLUGIN_DATA = [
    {
      name: 'appcatalog_headlamp_plugin',
      source: 'https://artifacthub.io/packages/headlamp/test-123/appcatalog_headlamp_plugin',
      version: '0.0.3',
    },
    {
      name: 'ai_plugin',
      source: 'https://artifacthub.io/packages/headlamp/test-123/ai_plugin',
      version: '0.0.2',
    },
    {
      name: 'prometheus_headlamp_plugin',
      source: 'https://artifacthub.io/packages/headlamp/test-123/prometheus_headlamp_plugin',
      version: '0.0.3',
    },
  ];
  beforeEach(async () => {
    // Create temporary directory for tests
    tempDir = await fsp.mkdtemp(path.join(os.tmpdir(), 'headlamp-test-'));
    configPath = path.join(tempDir, 'plugins.yaml');

    const mockProgressCallback = data => {
      const { type = 'info', message, raise = true } = data;
      if (type === 'error' && raise) {
        throw new Error(message);
      }
    };
    installer = new MultiPluginManager(tempDir, '', mockProgressCallback);
  });

  afterEach(async () => {
    // Clean up temporary directory
    await fsp.rm(tempDir, { recursive: true, force: true });
  });

  describe('validateConfig', () => {
    it('should validate a valid configuration', async () => {
      const config = `
plugins:
  - name: ${PLUGIN_DATA[1].name}
    source: ${PLUGIN_DATA[1].source}
    version: ${PLUGIN_DATA[1].version}
`;
      await fsp.writeFile(configPath, config);

      const result = await installer.validateConfig(configPath);
      expect(result).toBeDefined();
      expect(result.plugins).toHaveLength(1);
      expect(result.plugins[0].name).toBe(PLUGIN_DATA[1].name);
    });

    it('should reject invalid configuration', async () => {
      const config = `
plugins:
  - source: https://example.com/plugin.tar.gz
`;
      await fsp.writeFile(configPath, config);

      await expect(installer.validateConfig(configPath)).rejects.toThrow(
        'Configuration validation failed'
      );
    });

    it('should reject duplicate plugin names', async () => {
      const config = `
plugins:
  - name: ${PLUGIN_DATA[1].name}
    source: ${PLUGIN_DATA[1].source}
  - name: ${PLUGIN_DATA[1].name}
    source: ${PLUGIN_DATA[1].source}
`;
      await fsp.writeFile(configPath, config);

      await expect(installer.validateConfig(configPath)).rejects.toThrow(
        `Duplicate plugin names found: ${PLUGIN_DATA[1].name}`
      );
    });

    it('should reject duplicate plugin sources', async () => {
      const config = `
plugins:
  - name: ${PLUGIN_DATA[1].name}
    source: ${PLUGIN_DATA[1].source}
  - name: ${PLUGIN_DATA[2].name}
    source: ${PLUGIN_DATA[1].source}
`;
      await fsp.writeFile(configPath, config);

      await expect(installer.validateConfig(configPath)).rejects.toThrow(
        `Duplicate plugin sources found: ${PLUGIN_DATA[1].source}`
      );
    });
  });

  describe('dependency handling', () => {
    it('should detect circular dependencies', async () => {
      const config = `
plugins:
  - name: ${PLUGIN_DATA[1].name}
    source: ${PLUGIN_DATA[1].source}
    dependencies:
      - ${PLUGIN_DATA[2].name}
  - name: ${PLUGIN_DATA[2].name}
    source: ${PLUGIN_DATA[2].source}
    dependencies:
      - ${PLUGIN_DATA[1].name}
`;
      await fsp.writeFile(configPath, config);

      await expect(installer.installFromConfig(configPath)).rejects.toThrow(
        `Circular dependencies found for plugin ${PLUGIN_DATA[1].name}`
      );
    });

    it('should skip plugins with failed dependencies', async () => {
      const config = `
plugins:
  - name: invalid-plugin
    source: https://artifacthub.io/packages/headlamp/test-123/invalid-plugin
  - name: ${PLUGIN_DATA[0].name}
    source: ${PLUGIN_DATA[0].source}
    dependencies:
      - invalid-plugin
installOptions:
  parallel: false
`;
      await fsp.writeFile(configPath, config);

      const result = await installer.installFromConfig(configPath);
      console.log('Result:', result);
      expect(result.failed).toBe(1);
      expect(result.skipped).toBe(1);
      expect(result.successful).toBe(0);
    }, 10000);
  });

  describe('parallel installation', () => {
    it('should respect maxConcurrent setting', async () => {
      const config = `
plugins:
  - name: ${PLUGIN_DATA[0].name}
    source: ${PLUGIN_DATA[0].source}
  - name: ${PLUGIN_DATA[1].name}
    source: ${PLUGIN_DATA[1].source}
  - name: ${PLUGIN_DATA[2].name}
    source: ${PLUGIN_DATA[2].source}
installOptions:
  parallel: true
  maxConcurrent: 2
`;
      await fsp.writeFile(configPath, config);

      // Mock installer._createOptimalChunks to verify chunk sizes
      const createOptimalChunksSpy = jest.spyOn(installer, '_createOptimalChunks');
      await installer.installFromConfig(configPath);

      const chunks = createOptimalChunksSpy.mock.results[0].value;
      expect(chunks.every(chunk => chunk.length <= 2)).toBe(true);
    }, 10000);
    it('should not install dependent plugins in parallel', async () => {
      const config = `
plugins:
  - name: ${PLUGIN_DATA[0].name}
    source: ${PLUGIN_DATA[0].source}
  - name: ${PLUGIN_DATA[1].name}
    source: ${PLUGIN_DATA[1].source}
    dependencies:
      - ${PLUGIN_DATA[0].name}
  - name: ${PLUGIN_DATA[2].name}
    source: ${PLUGIN_DATA[2].source}
installOptions:
  parallel: true
  maxConcurrent: 3
`;
      await fsp.writeFile(configPath, config);

      const createOptimalChunksSpy = jest.spyOn(installer, '_createOptimalChunks');
      await installer.installFromConfig(configPath);

      const chunks = createOptimalChunksSpy.mock.results[0].value;

      // Verify that base-plugin and dependent-plugin are not in the same chunk
      const hasInvalidChunk = chunks.some(
        chunk => chunk.includes(PLUGIN_DATA[0].name) && chunk.includes(PLUGIN_DATA[1].name)
      );
      expect(hasInvalidChunk).toBe(false);

      // Verify that independent-plugin can be installed in parallel with base-plugin
      const hasValidParallelChunk = chunks.some(
        chunk => chunk.length > 1 && chunk.includes(PLUGIN_DATA[2].name)
      );
      expect(hasValidParallelChunk).toBe(true);
    }, 10000); // Increase timeout to 10 seconds
  });

  describe('installFromConfig', () => {
    it('should installs plugins from a configuration file', async () => {
      const config = `
plugins:
  - name: ${PLUGIN_DATA[0].name}
    source: ${PLUGIN_DATA[0].source}
    version: ${PLUGIN_DATA[0].version}
`;
      await fsp.writeFile(configPath, config);

      const result = await installer.installFromConfig(configPath);
      await new Promise(resolve => setTimeout(resolve, 1000)); // Add delay to ensure all logs are processed

      expect(result.successful).toEqual(1);
      expect(result.failed).toEqual(0);
      expect(fs.existsSync(path.join(tempDir, PLUGIN_DATA[0].name))).toBe(true);
    }, 10000);

    it('should handle missing configuration file', async () => {
      await expect(installer.installFromConfig('/nonexistent/config.yaml')).rejects.toThrow(
        'Configuration file not found'
      );
    });

    it('should handle invalid source URLs', async () => {
      const config = `
plugins:
  - name: test-plugin
    source: invalid-url
`;
      await fsp.writeFile(configPath, config);
      await expect(installer.installFromConfig(configPath)).rejects.toThrow(
        'Configuration validation failed'
      );
    });
  });

  describe('installPlugin', () => {
    it('should handle plugin installation errors', async () => {
      const plugin = {
        name: 'test-plugin',
        source: 'https://example.com/nonexistent.tar.gz',
      };

      await expect(installer.installPlugin(plugin)).rejects.toThrow();
    });
  });

  describe('error handling', () => {
    it('should handle YAML parsing errors', async () => {
      const invalidYaml = `
plugins:
  - name: test-plugin
    source: [invalid yaml
`;
      await fsp.writeFile(configPath, invalidYaml);

      await expect(installer.installFromConfig(configPath)).rejects.toThrow();
    });

    it('should handle file system errors', async () => {
      const plugin = {
        name: 'test-plugin',
        source: 'https://example.com/plugin.tar.gz',
      };

      // Make plugins directory read-only
      await fsp.chmod(tempDir, 0o444);

      await expect(installer.installPlugin(plugin)).rejects.toThrow();
    });
  });
});
