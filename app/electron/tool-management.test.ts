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

import fs from 'fs';
import os from 'os';
import path from 'path';
import { ToolManager } from './tool-management';
import { ToolMetadata } from './types';

jest.mock('./utils/download');
jest.mock('child_process');

describe('ToolManager', () => {
  let toolManager: ToolManager;
  let tempDir: string;

  // Mock envPaths early before any imports
jest.mock('./env-paths', () => {
  return () => ({
    data: '/mock/tools/dir'
  });
});

beforeEach(() => {
    // Create a temp directory for tests
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'headlamp-tools-test-'));
    
    // Update the mock data directory path
    const envPathsMock = jest.requireMock('./env-paths');
    envPathsMock.mockImplementation(() => ({
      data: tempDir
    }));

    toolManager = new ToolManager();
  });

  afterEach(() => {
    // Clean up temp directory after each test
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
    jest.resetModules();
    jest.clearAllMocks();
  });

  describe('initialization', () => {
    it('should create tools directory and config file on instantiation', () => {
      const toolsDir = path.join(tempDir, 'tools');
      const configFile = path.join(toolsDir, 'tools.json');

      expect(fs.existsSync(toolsDir)).toBe(true);
      expect(fs.existsSync(configFile)).toBe(true);
      expect(fs.readFileSync(configFile, 'utf8')).toBe('{}');
    });
  });

  describe('install', () => {
    const testTool: ToolMetadata = {
      name: 'test-tool',
      version: '1.0.0',
      platform: os.platform(),
      arch: os.arch(),
      downloadUrl: 'https://example.com/test-tool',
      sha256: 'test-hash',
      installPath: 'test-path'
    };

    it('should install a tool successfully', async () => {
      // Mock download function to create a dummy file
      const mockDownload = jest.fn().mockImplementation(async (url: string, dest: string) => {
        fs.writeFileSync(dest, 'test content');
      });
      jest.requireMock('./utils/download').download = mockDownload;

      const progressCallback = jest.fn();
      await toolManager.install(testTool, progressCallback);

      // Verify download was called
      expect(mockDownload).toHaveBeenCalledWith(
        'https://example.com/test-tool',
        expect.stringContaining('test-tool-1.0.0')
      );

      // Verify progress callback was called
      expect(progressCallback).toHaveBeenCalledWith({
        type: 'download',
        message: expect.stringContaining('Downloading test-tool')
      });

      expect(progressCallback).toHaveBeenCalledWith({
        type: 'success',
        message: expect.stringContaining('Successfully installed test-tool')
      });

      // Verify tool was added to config
      const config = JSON.parse(fs.readFileSync(path.join(tempDir, 'tools', 'tools.json'), 'utf8'));
      expect(config['test-tool']).toEqual(testTool);
    });

    it('should fail with incompatible platform', async () => {
      const incompatibleTool = {
        ...testTool,
        platform: 'invalid-platform'
      };

      await expect(toolManager.install(incompatibleTool)).rejects.toThrow(
        'Tool test-tool is not compatible with this system'
      );
    });

    it('should fail with invalid checksum', async () => {
      // Mock the download to create a file with known content
      const mockDownload = require('./utils/download').download;
      mockDownload.mockImplementation((url: string, dest: string) => {
        fs.writeFileSync(dest, 'test content');
        return Promise.resolve();
      });

      await expect(toolManager.install(testTool)).rejects.toThrow(
        'Checksum verification failed for test-tool'
      );
    });
  });

  describe('uninstall', () => {
    it('should uninstall a tool successfully', async () => {
      // First install a tool
      const testTool: ToolMetadata = {
        name: 'test-tool',
        version: '1.0.0',
        platform: os.platform(),
        arch: os.arch(),
        downloadUrl: 'https://example.com/test-tool',
        sha256: 'test-hash',
        installPath: 'test-path'
      };

      await toolManager.install(testTool);

      // Then uninstall it
      await toolManager.uninstall('test-tool');

      // Verify tool directory was removed
      expect(fs.existsSync(path.join(tempDir, 'tools', 'test-tool'))).toBe(false);

      // Verify tool was removed from config
      const config = JSON.parse(fs.readFileSync(path.join(tempDir, 'tools', 'tools.json'), 'utf8'));
      expect(config['test-tool']).toBeUndefined();
    });

    it('should not fail when uninstalling non-existent tool', async () => {
      await expect(toolManager.uninstall('non-existent-tool')).resolves.not.toThrow();
    });
  });

  describe('list', () => {
    it('should list installed tools', async () => {
      // Install two tools
      const testTool1: ToolMetadata = {
        name: 'test-tool-1',
        version: '1.0.0',
        platform: os.platform(),
        arch: os.arch(),
        downloadUrl: 'https://example.com/test-tool-1',
        sha256: 'test-hash-1',
        installPath: 'test-path-1'
      };

      const testTool2: ToolMetadata = {
        name: 'test-tool-2',
        version: '2.0.0',
        platform: os.platform(),
        arch: os.arch(),
        downloadUrl: 'https://example.com/test-tool-2',
        sha256: 'test-hash-2',
        installPath: 'test-path-2'
      };

      await toolManager.install(testTool1);
      await toolManager.install(testTool2);

      const tools = await toolManager.list();
      expect(tools).toHaveLength(2);
      expect(tools).toContainEqual(testTool1);
      expect(tools).toContainEqual(testTool2);
    });
  });

  describe('executeTool', () => {
    it('should execute an installed tool', async () => {
      const testTool: ToolMetadata = {
        name: 'test-tool',
        version: '1.0.0',
        platform: os.platform(),
        arch: os.arch(),
        downloadUrl: 'https://example.com/test-tool',
        sha256: 'test-hash',
        installPath: 'test-path'
      };

      // Mock child_process.exec
      const mockExec = require('child_process').exec;
      mockExec.mockImplementation((cmd: string, callback: Function) => {
        callback(null, { stdout: 'test output', stderr: '' });
      });

      await toolManager.install(testTool);
      const result = await toolManager.executeTool('test-tool', ['--version']);

      expect(result).toEqual({
        stdout: 'test output',
        stderr: ''
      });

      expect(mockExec).toHaveBeenCalledWith(
        expect.stringContaining('test-tool-1.0.0" --version'),
        expect.any(Function)
      );
    });

    it('should fail when executing non-existent tool', async () => {
      await expect(toolManager.executeTool('non-existent-tool')).rejects.toThrow(
        'Tool non-existent-tool is not installed'
      );
    });
  });
});
