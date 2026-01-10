"use strict";

var _globals = require("@jest/globals");
var _fs = _interopRequireDefault(require("fs"));
var _nock = _interopRequireDefault(require("nock"));
var _os = _interopRequireDefault(require("os"));
var _path = _interopRequireDefault(require("path"));
var _prBuilds = require("./pr-builds");
function _interopRequireDefault(e) { return e && e.__esModule ? e : { default: e }; }
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

const TEST_TEMP_DIR = _path.default.join(_os.default.tmpdir(), 'headlamp-pr-builds-test');
const TEST_CONFIG_PATH = _path.default.join(TEST_TEMP_DIR, 'test-config.json');
(0, _globals.describe)('pr-builds', () => {
  (0, _globals.beforeEach)(() => {
    // Clean up any pending nock interceptors
    _nock.default.cleanAll();

    // Create test directory
    if (!_fs.default.existsSync(TEST_TEMP_DIR)) {
      _fs.default.mkdirSync(TEST_TEMP_DIR, {
        recursive: true
      });
    }

    // Clean up any existing test config
    if (_fs.default.existsSync(TEST_CONFIG_PATH)) {
      _fs.default.unlinkSync(TEST_CONFIG_PATH);
    }
  });
  (0, _globals.afterEach)(() => {
    // Clean up nock
    _nock.default.cleanAll();

    // Clean up test directory
    if (_fs.default.existsSync(TEST_TEMP_DIR)) {
      _fs.default.rmSync(TEST_TEMP_DIR, {
        recursive: true,
        force: true
      });
    }
  });
  (0, _globals.describe)('fetchPRsWithArtifacts', () => {
    (0, _globals.it)('should fetch PRs with available artifacts for current platform', async () => {
      const platform = _os.default.platform();
      let expectedArtifactName = 'AppImages';
      if (platform === 'darwin') {
        expectedArtifactName = 'dmgs';
      } else if (platform === 'win32') {
        expectedArtifactName = 'Win exes';
      }

      // Mock GitHub API responses
      (0, _nock.default)('https://api.github.com').get('/repos/kubernetes-sigs/headlamp/pulls?state=open&per_page=50').reply(200, [{
        number: 123,
        title: 'Test PR',
        user: {
          login: 'testuser',
          avatar_url: 'https://github.com/testuser.png'
        },
        head: {
          sha: 'abc123',
          ref: 'test-branch'
        }
      }]);
      (0, _nock.default)('https://api.github.com').get('/repos/kubernetes-sigs/headlamp/actions/runs?event=pull_request&head_sha=abc123&per_page=10').reply(200, {
        workflow_runs: [{
          id: 456,
          head_sha: 'abc123',
          head_branch: 'test-branch',
          event: 'pull_request',
          status: 'completed',
          conclusion: 'success',
          created_at: '2025-01-10T00:00:00Z',
          updated_at: '2025-01-10T01:00:00Z'
        }]
      });
      (0, _nock.default)('https://api.github.com').get('/repos/kubernetes-sigs/headlamp/actions/runs/456/artifacts').reply(200, {
        artifacts: [{
          id: 789,
          name: expectedArtifactName,
          size_in_bytes: 100000000,
          expired: false,
          created_at: '2025-01-10T01:00:00Z',
          updated_at: '2025-01-10T01:00:00Z',
          expires_at: '2025-04-10T01:00:00Z'
        }]
      });
      (0, _nock.default)('https://api.github.com').get('/repos/kubernetes-sigs/headlamp/commits/abc123').reply(200, {
        sha: 'abc123',
        commit: {
          message: 'Test commit message',
          committer: {
            date: '2025-01-10T00:00:00Z'
          }
        }
      });
      const prs = await (0, _prBuilds.fetchPRsWithArtifacts)();
      (0, _globals.expect)(prs.length).toBe(1);
      (0, _globals.expect)(prs[0].number).toBe(123);
      (0, _globals.expect)(prs[0].title).toBe('Test PR');
      (0, _globals.expect)(prs[0].author).toBe('testuser');
      (0, _globals.expect)(prs[0].headSha).toBe('abc123');
      (0, _globals.expect)(prs[0].availableArtifacts.length).toBe(1);
      (0, _globals.expect)(prs[0].availableArtifacts[0].name).toBe(expectedArtifactName);
    }, 10000);
    (0, _globals.it)('should filter out PRs without successful workflow runs', async () => {
      (0, _nock.default)('https://api.github.com').get('/repos/kubernetes-sigs/headlamp/pulls?state=open&per_page=50').reply(200, [{
        number: 123,
        title: 'Test PR',
        user: {
          login: 'testuser',
          avatar_url: 'https://github.com/testuser.png'
        },
        head: {
          sha: 'abc123',
          ref: 'test-branch'
        }
      }]);
      (0, _nock.default)('https://api.github.com').get('/repos/kubernetes-sigs/headlamp/actions/runs?event=pull_request&head_sha=abc123&per_page=10').reply(200, {
        workflow_runs: [{
          id: 456,
          head_sha: 'abc123',
          head_branch: 'test-branch',
          event: 'pull_request',
          status: 'completed',
          conclusion: 'failure',
          created_at: '2025-01-10T00:00:00Z',
          updated_at: '2025-01-10T01:00:00Z'
        }]
      });
      const prs = await (0, _prBuilds.fetchPRsWithArtifacts)();
      (0, _globals.expect)(prs.length).toBe(0);
    }, 10000);
    (0, _globals.it)('should filter out PRs with expired artifacts', async () => {
      const platform = _os.default.platform();
      let expectedArtifactName = 'AppImages';
      if (platform === 'darwin') {
        expectedArtifactName = 'dmgs';
      } else if (platform === 'win32') {
        expectedArtifactName = 'Win exes';
      }
      (0, _nock.default)('https://api.github.com').get('/repos/kubernetes-sigs/headlamp/pulls?state=open&per_page=50').reply(200, [{
        number: 123,
        title: 'Test PR',
        user: {
          login: 'testuser',
          avatar_url: 'https://github.com/testuser.png'
        },
        head: {
          sha: 'abc123',
          ref: 'test-branch'
        }
      }]);
      (0, _nock.default)('https://api.github.com').get('/repos/kubernetes-sigs/headlamp/actions/runs?event=pull_request&head_sha=abc123&per_page=10').reply(200, {
        workflow_runs: [{
          id: 456,
          head_sha: 'abc123',
          head_branch: 'test-branch',
          event: 'pull_request',
          status: 'completed',
          conclusion: 'success',
          created_at: '2025-01-10T00:00:00Z',
          updated_at: '2025-01-10T01:00:00Z'
        }]
      });
      (0, _nock.default)('https://api.github.com').get('/repos/kubernetes-sigs/headlamp/actions/runs/456/artifacts').reply(200, {
        artifacts: [{
          id: 789,
          name: expectedArtifactName,
          size_in_bytes: 100000000,
          expired: true,
          // Artifact is expired
          created_at: '2025-01-10T01:00:00Z',
          updated_at: '2025-01-10T01:00:00Z',
          expires_at: '2025-01-11T01:00:00Z'
        }]
      });
      const prs = await (0, _prBuilds.fetchPRsWithArtifacts)();
      (0, _globals.expect)(prs.length).toBe(0);
    }, 10000);
  });
  (0, _globals.describe)('getPRBuildStoragePath', () => {
    (0, _globals.it)('should return a path within the temp directory', () => {
      const tempDir = '/tmp/test';
      const storagePath = (0, _prBuilds.getPRBuildStoragePath)(tempDir);
      (0, _globals.expect)(storagePath).toContain(tempDir);
      (0, _globals.expect)(storagePath).toContain('headlamp-pr-builds');
    });
  });
  (0, _globals.describe)('isPRBuildActive', () => {
    (0, _globals.it)('should return false when config file does not exist', async () => {
      const isActive = await (0, _prBuilds.isPRBuildActive)(TEST_CONFIG_PATH);
      (0, _globals.expect)(isActive).toBe(false);
    });
    (0, _globals.it)('should return false when config file exists but has no activePRBuild', async () => {
      _fs.default.writeFileSync(TEST_CONFIG_PATH, JSON.stringify({
        someOtherKey: 'value'
      }));
      const isActive = await (0, _prBuilds.isPRBuildActive)(TEST_CONFIG_PATH);
      (0, _globals.expect)(isActive).toBe(false);
    });
    (0, _globals.it)('should return true when config file has activePRBuild', async () => {
      const prInfo = {
        number: 123,
        title: 'Test PR',
        author: 'testuser',
        authorAvatarUrl: 'https://github.com/testuser.png',
        headSha: 'abc123',
        headRef: 'test-branch',
        commitDate: '2025-01-10T00:00:00Z',
        commitMessage: 'Test commit',
        availableArtifacts: []
      };
      _fs.default.writeFileSync(TEST_CONFIG_PATH, JSON.stringify({
        activePRBuild: prInfo
      }));
      const isActive = await (0, _prBuilds.isPRBuildActive)(TEST_CONFIG_PATH);
      (0, _globals.expect)(isActive).toBe(true);
    });
  });
  (0, _globals.describe)('getActivePRBuildInfo', () => {
    (0, _globals.it)('should return null when config file does not exist', async () => {
      const info = await (0, _prBuilds.getActivePRBuildInfo)(TEST_CONFIG_PATH);
      (0, _globals.expect)(info).toBeNull();
    });
    (0, _globals.it)('should return null when config file has no activePRBuild', async () => {
      _fs.default.writeFileSync(TEST_CONFIG_PATH, JSON.stringify({
        someOtherKey: 'value'
      }));
      const info = await (0, _prBuilds.getActivePRBuildInfo)(TEST_CONFIG_PATH);
      (0, _globals.expect)(info).toBeNull();
    });
    (0, _globals.it)('should return PR info when config file has activePRBuild', async () => {
      const prInfo = {
        number: 123,
        title: 'Test PR',
        author: 'testuser',
        authorAvatarUrl: 'https://github.com/testuser.png',
        headSha: 'abc123',
        headRef: 'test-branch',
        commitDate: '2025-01-10T00:00:00Z',
        commitMessage: 'Test commit',
        availableArtifacts: []
      };
      _fs.default.writeFileSync(TEST_CONFIG_PATH, JSON.stringify({
        activePRBuild: prInfo
      }));
      const info = await (0, _prBuilds.getActivePRBuildInfo)(TEST_CONFIG_PATH);
      (0, _globals.expect)(info).not.toBeNull();
      (0, _globals.expect)(info?.number).toBe(123);
      (0, _globals.expect)(info?.title).toBe('Test PR');
    });
  });
  (0, _globals.describe)('setActivePRBuild', () => {
    (0, _globals.it)('should create config file and set active PR build', async () => {
      const prInfo = {
        number: 123,
        title: 'Test PR',
        author: 'testuser',
        authorAvatarUrl: 'https://github.com/testuser.png',
        headSha: 'abc123',
        headRef: 'test-branch',
        commitDate: '2025-01-10T00:00:00Z',
        commitMessage: 'Test commit',
        availableArtifacts: []
      };
      await (0, _prBuilds.setActivePRBuild)(TEST_CONFIG_PATH, prInfo);
      (0, _globals.expect)(_fs.default.existsSync(TEST_CONFIG_PATH)).toBe(true);
      const configData = _fs.default.readFileSync(TEST_CONFIG_PATH, 'utf-8');
      const config = JSON.parse(configData);
      (0, _globals.expect)(config.activePRBuild).toBeDefined();
      (0, _globals.expect)(config.activePRBuild.number).toBe(123);
    });
    (0, _globals.it)('should preserve other config values when setting active PR build', async () => {
      _fs.default.writeFileSync(TEST_CONFIG_PATH, JSON.stringify({
        otherKey: 'otherValue'
      }));
      const prInfo = {
        number: 123,
        title: 'Test PR',
        author: 'testuser',
        authorAvatarUrl: 'https://github.com/testuser.png',
        headSha: 'abc123',
        headRef: 'test-branch',
        commitDate: '2025-01-10T00:00:00Z',
        commitMessage: 'Test commit',
        availableArtifacts: []
      };
      await (0, _prBuilds.setActivePRBuild)(TEST_CONFIG_PATH, prInfo);
      const configData = _fs.default.readFileSync(TEST_CONFIG_PATH, 'utf-8');
      const config = JSON.parse(configData);
      (0, _globals.expect)(config.otherKey).toBe('otherValue');
      (0, _globals.expect)(config.activePRBuild).toBeDefined();
    });
  });
  (0, _globals.describe)('clearActivePRBuild', () => {
    (0, _globals.it)('should remove activePRBuild from config', async () => {
      const prInfo = {
        number: 123,
        title: 'Test PR',
        author: 'testuser',
        authorAvatarUrl: 'https://github.com/testuser.png',
        headSha: 'abc123',
        headRef: 'test-branch',
        commitDate: '2025-01-10T00:00:00Z',
        commitMessage: 'Test commit',
        availableArtifacts: []
      };
      _fs.default.writeFileSync(TEST_CONFIG_PATH, JSON.stringify({
        activePRBuild: prInfo,
        otherKey: 'value'
      }));
      await (0, _prBuilds.clearActivePRBuild)(TEST_CONFIG_PATH);
      const configData = _fs.default.readFileSync(TEST_CONFIG_PATH, 'utf-8');
      const config = JSON.parse(configData);
      (0, _globals.expect)(config.activePRBuild).toBeUndefined();
      (0, _globals.expect)(config.otherKey).toBe('value');
    });
    (0, _globals.it)('should not throw error if config file does not exist', async () => {
      await (0, _globals.expect)((0, _prBuilds.clearActivePRBuild)(TEST_CONFIG_PATH)).resolves.not.toThrow();
    });
  });
  (0, _globals.describe)('cleanupPRBuild', () => {
    (0, _globals.it)('should remove build directory', async () => {
      const buildDir = _path.default.join(TEST_TEMP_DIR, 'build');
      _fs.default.mkdirSync(buildDir, {
        recursive: true
      });
      _fs.default.writeFileSync(_path.default.join(buildDir, 'test.txt'), 'test content');
      await (0, _prBuilds.cleanupPRBuild)(buildDir);
      (0, _globals.expect)(_fs.default.existsSync(buildDir)).toBe(false);
    });
    (0, _globals.it)('should not throw error if build directory does not exist', async () => {
      const buildDir = _path.default.join(TEST_TEMP_DIR, 'nonexistent');
      await (0, _globals.expect)((0, _prBuilds.cleanupPRBuild)(buildDir)).resolves.not.toThrow();
    });
  });
});