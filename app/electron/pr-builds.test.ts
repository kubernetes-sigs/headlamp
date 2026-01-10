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

import { afterEach,beforeEach, describe, expect, it } from '@jest/globals';
import fs from 'fs';
import nock from 'nock';
import os from 'os';
import path from 'path';
import {
  cleanupPRBuild,
  clearActivePRBuild,
  fetchPRsWithArtifacts,
  getActivePRBuildInfo,
  getPRBuildStoragePath,
  isPRBuildActive,
  PRInfo,
  setActivePRBuild,
} from './pr-builds';

const TEST_TEMP_DIR = path.join(os.tmpdir(), 'headlamp-pr-builds-test');
const TEST_CONFIG_PATH = path.join(TEST_TEMP_DIR, 'test-config.json');

describe('pr-builds', () => {
  beforeEach(() => {
    // Clean up any pending nock interceptors
    nock.cleanAll();
    
    // Create test directory
    if (!fs.existsSync(TEST_TEMP_DIR)) {
      fs.mkdirSync(TEST_TEMP_DIR, { recursive: true });
    }
    
    // Clean up any existing test config
    if (fs.existsSync(TEST_CONFIG_PATH)) {
      fs.unlinkSync(TEST_CONFIG_PATH);
    }
  });

  afterEach(() => {
    // Clean up nock
    nock.cleanAll();
    
    // Clean up test directory
    if (fs.existsSync(TEST_TEMP_DIR)) {
      fs.rmSync(TEST_TEMP_DIR, { recursive: true, force: true });
    }
  });

  describe('fetchPRsWithArtifacts', () => {
    it('should fetch PRs with available artifacts for current platform', async () => {
      const platform = os.platform();
      let expectedArtifactName = 'AppImages';
      if (platform === 'darwin') {
        expectedArtifactName = 'dmgs';
      } else if (platform === 'win32') {
        expectedArtifactName = 'Win exes';
      }

      // Mock GitHub API responses
      nock('https://api.github.com')
        .get('/repos/kubernetes-sigs/headlamp/pulls?state=open&per_page=50')
        .reply(200, [
          {
            number: 123,
            title: 'Test PR',
            user: {
              login: 'testuser',
              avatar_url: 'https://github.com/testuser.png',
            },
            head: {
              sha: 'abc123',
              ref: 'test-branch',
            },
          },
        ]);

      nock('https://api.github.com')
        .get('/repos/kubernetes-sigs/headlamp/actions/runs?event=pull_request&head_sha=abc123&per_page=10')
        .reply(200, {
          workflow_runs: [
            {
              id: 456,
              head_sha: 'abc123',
              head_branch: 'test-branch',
              event: 'pull_request',
              status: 'completed',
              conclusion: 'success',
              created_at: '2025-01-10T00:00:00Z',
              updated_at: '2025-01-10T01:00:00Z',
            },
          ],
        });

      nock('https://api.github.com')
        .get('/repos/kubernetes-sigs/headlamp/actions/runs/456/artifacts')
        .reply(200, {
          artifacts: [
            {
              id: 789,
              name: expectedArtifactName,
              size_in_bytes: 100000000,
              expired: false,
              created_at: '2025-01-10T01:00:00Z',
              updated_at: '2025-01-10T01:00:00Z',
              expires_at: '2025-04-10T01:00:00Z',
            },
          ],
        });

      nock('https://api.github.com')
        .get('/repos/kubernetes-sigs/headlamp/commits/abc123')
        .reply(200, {
          sha: 'abc123',
          commit: {
            message: 'Test commit message',
            committer: {
              date: '2025-01-10T00:00:00Z',
            },
          },
        });

      const prs = await fetchPRsWithArtifacts();

      expect(prs.length).toBe(1);
      expect(prs[0].number).toBe(123);
      expect(prs[0].title).toBe('Test PR');
      expect(prs[0].author).toBe('testuser');
      expect(prs[0].headSha).toBe('abc123');
      expect(prs[0].workflowRunId).toBe(456);
      expect(prs[0].availableArtifacts.length).toBe(1);
      expect(prs[0].availableArtifacts[0].name).toBe(expectedArtifactName);
    }, 10000);

    it('should filter out PRs without successful workflow runs', async () => {
      nock('https://api.github.com')
        .get('/repos/kubernetes-sigs/headlamp/pulls?state=open&per_page=50')
        .reply(200, [
          {
            number: 123,
            title: 'Test PR',
            user: {
              login: 'testuser',
              avatar_url: 'https://github.com/testuser.png',
            },
            head: {
              sha: 'abc123',
              ref: 'test-branch',
            },
          },
        ]);

      nock('https://api.github.com')
        .get('/repos/kubernetes-sigs/headlamp/actions/runs?event=pull_request&head_sha=abc123&per_page=10')
        .reply(200, {
          workflow_runs: [
            {
              id: 456,
              head_sha: 'abc123',
              head_branch: 'test-branch',
              event: 'pull_request',
              status: 'completed',
              conclusion: 'failure',
              created_at: '2025-01-10T00:00:00Z',
              updated_at: '2025-01-10T01:00:00Z',
            },
          ],
        });

      const prs = await fetchPRsWithArtifacts();

      expect(prs.length).toBe(0);
    }, 10000);

    it('should filter out PRs with expired artifacts', async () => {
      const platform = os.platform();
      let expectedArtifactName = 'AppImages';
      if (platform === 'darwin') {
        expectedArtifactName = 'dmgs';
      } else if (platform === 'win32') {
        expectedArtifactName = 'Win exes';
      }

      nock('https://api.github.com')
        .get('/repos/kubernetes-sigs/headlamp/pulls?state=open&per_page=50')
        .reply(200, [
          {
            number: 123,
            title: 'Test PR',
            user: {
              login: 'testuser',
              avatar_url: 'https://github.com/testuser.png',
            },
            head: {
              sha: 'abc123',
              ref: 'test-branch',
            },
          },
        ]);

      nock('https://api.github.com')
        .get('/repos/kubernetes-sigs/headlamp/actions/runs?event=pull_request&head_sha=abc123&per_page=10')
        .reply(200, {
          workflow_runs: [
            {
              id: 456,
              head_sha: 'abc123',
              head_branch: 'test-branch',
              event: 'pull_request',
              status: 'completed',
              conclusion: 'success',
              created_at: '2025-01-10T00:00:00Z',
              updated_at: '2025-01-10T01:00:00Z',
            },
          ],
        });

      nock('https://api.github.com')
        .get('/repos/kubernetes-sigs/headlamp/actions/runs/456/artifacts')
        .reply(200, {
          artifacts: [
            {
              id: 789,
              name: expectedArtifactName,
              size_in_bytes: 100000000,
              expired: true, // Artifact is expired
              created_at: '2025-01-10T01:00:00Z',
              updated_at: '2025-01-10T01:00:00Z',
              expires_at: '2025-01-11T01:00:00Z',
            },
          ],
        });

      const prs = await fetchPRsWithArtifacts();

      expect(prs.length).toBe(0);
    }, 10000);
  });

  describe('getPRBuildStoragePath', () => {
    it('should return a path within the temp directory', () => {
      const tempDir = '/tmp/test';
      const storagePath = getPRBuildStoragePath(tempDir);
      
      expect(storagePath).toContain(tempDir);
      expect(storagePath).toContain('headlamp-pr-builds');
    });
  });

  describe('isPRBuildActive', () => {
    it('should return false when config file does not exist', async () => {
      const isActive = await isPRBuildActive(TEST_CONFIG_PATH);
      
      expect(isActive).toBe(false);
    });

    it('should return false when config file exists but has no activePRBuild', async () => {
      fs.writeFileSync(TEST_CONFIG_PATH, JSON.stringify({ someOtherKey: 'value' }));
      
      const isActive = await isPRBuildActive(TEST_CONFIG_PATH);
      
      expect(isActive).toBe(false);
    });

    it('should return true when config file has activePRBuild', async () => {
      const prInfo: PRInfo = {
        number: 123,
        title: 'Test PR',
        author: 'testuser',
        authorAvatarUrl: 'https://github.com/testuser.png',
        headSha: 'abc123',
        headRef: 'test-branch',
        commitDate: '2025-01-10T00:00:00Z',
        commitMessage: 'Test commit',
        workflowRunId: 456,
        availableArtifacts: [],
      };
      
      fs.writeFileSync(TEST_CONFIG_PATH, JSON.stringify({ activePRBuild: prInfo }));
      
      const isActive = await isPRBuildActive(TEST_CONFIG_PATH);
      
      expect(isActive).toBe(true);
    });
  });

  describe('getActivePRBuildInfo', () => {
    it('should return null when config file does not exist', async () => {
      const info = await getActivePRBuildInfo(TEST_CONFIG_PATH);
      
      expect(info).toBeNull();
    });

    it('should return null when config file has no activePRBuild', async () => {
      fs.writeFileSync(TEST_CONFIG_PATH, JSON.stringify({ someOtherKey: 'value' }));
      
      const info = await getActivePRBuildInfo(TEST_CONFIG_PATH);
      
      expect(info).toBeNull();
    });

    it('should return PR info when config file has activePRBuild', async () => {
      const prInfo: PRInfo = {
        number: 123,
        title: 'Test PR',
        author: 'testuser',
        authorAvatarUrl: 'https://github.com/testuser.png',
        headSha: 'abc123',
        headRef: 'test-branch',
        commitDate: '2025-01-10T00:00:00Z',
        commitMessage: 'Test commit',
        workflowRunId: 456,
        availableArtifacts: [],
      };
      
      fs.writeFileSync(TEST_CONFIG_PATH, JSON.stringify({ activePRBuild: prInfo }));
      
      const info = await getActivePRBuildInfo(TEST_CONFIG_PATH);
      
      expect(info).not.toBeNull();
      expect(info?.number).toBe(123);
      expect(info?.title).toBe('Test PR');
    });
  });

  describe('setActivePRBuild', () => {
    it('should create config file and set active PR build', async () => {
      const prInfo: PRInfo = {
        number: 123,
        title: 'Test PR',
        author: 'testuser',
        authorAvatarUrl: 'https://github.com/testuser.png',
        headSha: 'abc123',
        headRef: 'test-branch',
        commitDate: '2025-01-10T00:00:00Z',
        commitMessage: 'Test commit',
        workflowRunId: 456,
        availableArtifacts: [],
      };
      
      await setActivePRBuild(TEST_CONFIG_PATH, prInfo);
      
      expect(fs.existsSync(TEST_CONFIG_PATH)).toBe(true);
      
      const configData = fs.readFileSync(TEST_CONFIG_PATH, 'utf-8');
      const config = JSON.parse(configData);
      
      expect(config.activePRBuild).toBeDefined();
      expect(config.activePRBuild.number).toBe(123);
    });

    it('should preserve other config values when setting active PR build', async () => {
      fs.writeFileSync(TEST_CONFIG_PATH, JSON.stringify({ otherKey: 'otherValue' }));
      
      const prInfo: PRInfo = {
        number: 123,
        title: 'Test PR',
        author: 'testuser',
        authorAvatarUrl: 'https://github.com/testuser.png',
        headSha: 'abc123',
        headRef: 'test-branch',
        commitDate: '2025-01-10T00:00:00Z',
        commitMessage: 'Test commit',
        workflowRunId: 456,
        availableArtifacts: [],
      };
      
      await setActivePRBuild(TEST_CONFIG_PATH, prInfo);
      
      const configData = fs.readFileSync(TEST_CONFIG_PATH, 'utf-8');
      const config = JSON.parse(configData);
      
      expect(config.otherKey).toBe('otherValue');
      expect(config.activePRBuild).toBeDefined();
    });
  });

  describe('clearActivePRBuild', () => {
    it('should remove activePRBuild from config', async () => {
      const prInfo: PRInfo = {
        number: 123,
        title: 'Test PR',
        author: 'testuser',
        authorAvatarUrl: 'https://github.com/testuser.png',
        headSha: 'abc123',
        headRef: 'test-branch',
        commitDate: '2025-01-10T00:00:00Z',
        commitMessage: 'Test commit',
        workflowRunId: 456,
        availableArtifacts: [],
      };
      
      fs.writeFileSync(TEST_CONFIG_PATH, JSON.stringify({ activePRBuild: prInfo, otherKey: 'value' }));
      
      await clearActivePRBuild(TEST_CONFIG_PATH);
      
      const configData = fs.readFileSync(TEST_CONFIG_PATH, 'utf-8');
      const config = JSON.parse(configData);
      
      expect(config.activePRBuild).toBeUndefined();
      expect(config.otherKey).toBe('value');
    });

    it('should not throw error if config file does not exist', async () => {
      await expect(clearActivePRBuild(TEST_CONFIG_PATH)).resolves.not.toThrow();
    });
  });

  describe('cleanupPRBuild', () => {
    it('should remove build directory', async () => {
      const buildDir = path.join(TEST_TEMP_DIR, 'build');
      fs.mkdirSync(buildDir, { recursive: true });
      fs.writeFileSync(path.join(buildDir, 'test.txt'), 'test content');
      
      await cleanupPRBuild(buildDir);
      
      expect(fs.existsSync(buildDir)).toBe(false);
    });

    it('should not throw error if build directory does not exist', async () => {
      const buildDir = path.join(TEST_TEMP_DIR, 'nonexistent');
      
      await expect(cleanupPRBuild(buildDir)).resolves.not.toThrow();
    });
  });
});
