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

/**
 * tool-management.ts has the core logic for managing CLI tools in Headlamp.
 *
 * Provides methods for downloading, installing, updating, listing and uninstalling tools.
 */
import crypto from 'crypto';
import fs from 'fs';
import os from 'os';
import path from 'path';
import stream from 'stream';
import { promisify } from 'util';
import zlib from 'zlib';
import envPaths from './env-paths';
import { download } from './utils/download';
import { exec } from 'child_process';
import { ProgressResp, ToolMetadata } from './types';

const execAsync = promisify(exec);

// Interfaces are imported from ./types

/**
 * Class to manage tools installation and lifecycle
 */
export class ToolManager {
  private toolsDir: string;
  private configFile: string;

  constructor() {
    // Use the same env paths setup as plugins for consistency
    const paths = envPaths('headlamp', { suffix: '' });
    this.toolsDir = path.join(paths.data, 'tools');
    this.configFile = path.join(this.toolsDir, 'tools.json');
    this.ensureDirectories();
  }

  /**
   * Ensure required directories exist
   */
  private ensureDirectories() {
    if (!fs.existsSync(this.toolsDir)) {
      fs.mkdirSync(this.toolsDir, { recursive: true });
    }
    if (!fs.existsSync(this.configFile)) {
      fs.writeFileSync(this.configFile, '{}');
    }
  }

  /**
   * Get the list of installed tools
   */
  async list(): Promise<ToolMetadata[]> {
    const config = JSON.parse(fs.readFileSync(this.configFile, 'utf8'));
    return Object.values(config);
  }

  /**
   * Install a tool from a given URL
   */
  async install(
    toolMetadata: ToolMetadata,
    progressCallback?: (progress: ProgressResp) => void
  ): Promise<void> {
    const { name, version, downloadUrl, sha256, platform, arch } = toolMetadata;

    // Verify platform compatibility
    if (platform !== os.platform() || arch !== os.arch()) {
      throw new Error(`Tool ${name} is not compatible with this system`);
    }

    const toolDir = path.join(this.toolsDir, name);
    const downloadPath = path.join(toolDir, `${name}-${version}`);

    // Create tool directory
    if (!fs.existsSync(toolDir)) {
      fs.mkdirSync(toolDir, { recursive: true });
    }

    // Download the tool
    if (progressCallback) {
      progressCallback({
        type: 'download',
        message: `Downloading ${name} version ${version}...`,
      });
    }

    await download(downloadUrl, downloadPath);

    // Verify checksum if provided
    if (sha256) {
      const fileBuffer = fs.readFileSync(downloadPath);
      const hashSum = crypto.createHash('sha256');
      hashSum.update(fileBuffer);
      const hex = hashSum.digest('hex');

      if (hex !== sha256) {
        fs.unlinkSync(downloadPath);
        throw new Error(`Checksum verification failed for ${name}`);
      }
    }

    // Make binary executable on Unix-like systems
    if (os.platform() !== 'win32') {
      await execAsync(`chmod +x "${downloadPath}"`);
    }

    // Update config
    const config = JSON.parse(fs.readFileSync(this.configFile, 'utf8'));
    config[name] = toolMetadata;
    fs.writeFileSync(this.configFile, JSON.stringify(config, null, 2));

    if (progressCallback) {
      progressCallback({
        type: 'success',
        message: `Successfully installed ${name} version ${version}`,
      });
    }
  }

  /**
   * Uninstall a tool
   */
  async uninstall(name: string): Promise<void> {
    const toolDir = path.join(this.toolsDir, name);
    
    if (fs.existsSync(toolDir)) {
      fs.rmSync(toolDir, { recursive: true, force: true });
    }

    // Update config
    const config = JSON.parse(fs.readFileSync(this.configFile, 'utf8'));
    delete config[name];
    fs.writeFileSync(this.configFile, JSON.stringify(config, null, 2));
  }

  /**
   * Get the path to an installed tool
   */
  getToolPath(name: string): string | null {
    const config = JSON.parse(fs.readFileSync(this.configFile, 'utf8'));
    const tool = config[name];
    
    if (!tool) {
      return null;
    }

    return path.join(this.toolsDir, name, `${name}-${tool.version}`);
  }

  /**
   * Execute an installed tool
   */
  async executeTool(name: string, args: string[] = []): Promise<{stdout: string; stderr: string}> {
    const toolPath = this.getToolPath(name);
    if (!toolPath) {
      throw new Error(`Tool ${name} is not installed`);
    }

    return execAsync(`"${toolPath}" ${args.join(' ')}`);
  }
}