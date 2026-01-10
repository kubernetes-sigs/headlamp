"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.cleanupPRBuild = cleanupPRBuild;
exports.clearActivePRBuild = clearActivePRBuild;
exports.downloadPRBuildArtifact = downloadPRBuildArtifact;
exports.extractAppBundle = extractAppBundle;
exports.fetchPRsWithArtifacts = fetchPRsWithArtifacts;
exports.getActivePRBuildInfo = getActivePRBuildInfo;
exports.getPRBuildStoragePath = getPRBuildStoragePath;
exports.isPRBuildActive = isPRBuildActive;
exports.setActivePRBuild = setActivePRBuild;
var _fs = require("fs");
var fsPromises = _interopRequireWildcard(require("fs/promises"));
var _https = _interopRequireDefault(require("https"));
var _os = require("os");
var _path = _interopRequireDefault(require("path"));
var _stream = require("stream");
var _util = require("util");
function _interopRequireDefault(e) { return e && e.__esModule ? e : { default: e }; }
function _getRequireWildcardCache(e) { if ("function" != typeof WeakMap) return null; var r = new WeakMap(), t = new WeakMap(); return (_getRequireWildcardCache = function (e) { return e ? t : r; })(e); }
function _interopRequireWildcard(e, r) { if (!r && e && e.__esModule) return e; if (null === e || "object" != typeof e && "function" != typeof e) return { default: e }; var t = _getRequireWildcardCache(r); if (t && t.has(e)) return t.get(e); var n = { __proto__: null }, a = Object.defineProperty && Object.getOwnPropertyDescriptor; for (var u in e) if ("default" !== u && {}.hasOwnProperty.call(e, u)) { var i = a ? Object.getOwnPropertyDescriptor(e, u) : null; i && (i.get || i.set) ? Object.defineProperty(n, u, i) : n[u] = e[u]; } return n.default = e, t && t.set(e, n), n; }
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

const pipelineAsync = (0, _util.promisify)(_stream.pipeline);
const GITHUB_API_BASE = 'https://api.github.com';
const REPO_OWNER = 'kubernetes-sigs';
const REPO_NAME = 'headlamp';

/**
 * Represents information about a Pull Request with available artifacts
 */

/**
 * Represents information about a workflow run
 */

/**
 * Represents an artifact from GitHub Actions
 */

/**
 * Makes an HTTPS GET request to the GitHub API
 */
async function githubApiRequest(endpoint) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'api.github.com',
      path: endpoint,
      headers: {
        'User-Agent': 'Headlamp-Desktop-App',
        Accept: 'application/vnd.github.v3+json'
      }
    };
    _https.default.get(options, res => {
      let data = '';
      res.on('data', chunk => {
        data += chunk;
      });
      res.on('end', () => {
        if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
          try {
            resolve(JSON.parse(data));
          } catch (err) {
            reject(new Error(`Failed to parse JSON response: ${err}`));
          }
        } else {
          reject(new Error(`GitHub API request failed with status ${res.statusCode}: ${data}`));
        }
      });
    }).on('error', err => {
      reject(err);
    });
  });
}

/**
 * Downloads a file from a URL to a destination path
 */
async function downloadFile(url, destPath) {
  return new Promise((resolve, reject) => {
    _https.default.get(url, res => {
      if (res.statusCode === 302 || res.statusCode === 301) {
        // Follow redirect
        const redirectUrl = res.headers.location;
        if (redirectUrl) {
          downloadFile(redirectUrl, destPath).then(resolve).catch(reject);
          return;
        }
      }
      if (res.statusCode !== 200) {
        reject(new Error(`Failed to download file: HTTP ${res.statusCode}`));
        return;
      }
      const fileStream = (0, _fs.createWriteStream)(destPath);
      pipelineAsync(res, fileStream).then(() => resolve()).catch(reject);
    }).on('error', err => {
      reject(err);
    });
  });
}

/**
 * Gets the current platform's artifact name pattern
 */
function getPlatformArtifactPattern() {
  const platform = (0, _os.platform)();
  switch (platform) {
    case 'darwin':
      return 'dmgs';
    case 'win32':
      return 'Win exes';
    case 'linux':
      return 'AppImages';
    default:
      throw new Error(`Unsupported platform: ${platform}`);
  }
}

/**
 * Fetches list of open PRs with available app artifacts
 */
async function fetchPRsWithArtifacts() {
  try {
    // Get open PRs
    const prsResponse = await githubApiRequest(`/repos/${REPO_OWNER}/${REPO_NAME}/pulls?state=open&per_page=50`);
    const prInfos = [];
    const platformPattern = getPlatformArtifactPattern();
    for (const pr of prsResponse) {
      // Get workflow runs for this PR's head SHA
      const runsResponse = await githubApiRequest(`/repos/${REPO_OWNER}/${REPO_NAME}/actions/runs?event=pull_request&head_sha=${pr.head.sha}&per_page=10`);

      // Find successful workflow runs
      const successfulRuns = runsResponse.workflow_runs.filter(run => run.conclusion === 'success' && run.status === 'completed');
      if (successfulRuns.length === 0) {
        continue;
      }

      // Get artifacts for the most recent successful run
      const latestRun = successfulRuns[0];
      const artifactsResponse = await githubApiRequest(`/repos/${REPO_OWNER}/${REPO_NAME}/actions/runs/${latestRun.id}/artifacts`);

      // Filter to platform-specific artifacts that haven't expired
      const relevantArtifacts = artifactsResponse.artifacts.filter(artifact => artifact.name === platformPattern && !artifact.expired);
      if (relevantArtifacts.length > 0) {
        // Get commit details
        const commitResponse = await githubApiRequest(`/repos/${REPO_OWNER}/${REPO_NAME}/commits/${pr.head.sha}`);
        prInfos.push({
          number: pr.number,
          title: pr.title,
          author: pr.user.login,
          authorAvatarUrl: pr.user.avatar_url,
          headSha: pr.head.sha,
          headRef: pr.head.ref,
          commitDate: commitResponse.commit.committer.date,
          commitMessage: commitResponse.commit.message,
          workflowRunId: latestRun.id,
          availableArtifacts: relevantArtifacts.map(artifact => ({
            name: artifact.name,
            id: artifact.id,
            size: artifact.size_in_bytes,
            expired: artifact.expired
          }))
        });
      }
    }
    return prInfos;
  } catch (error) {
    console.error('Error fetching PRs with artifacts:', error);
    throw error;
  }
}

/**
 * Downloads and extracts a PR build artifact using nightly.link
 * @param prInfo The PR information containing workflow run ID
 * @param artifactName The name of the artifact to download
 * @param destDir The destination directory for extracted files
 */
async function downloadPRBuildArtifact(prInfo, artifactName, destDir) {
  try {
    // Ensure destination directory exists
    await fsPromises.mkdir(destDir, {
      recursive: true
    });

    // Use nightly.link to download artifacts without authentication
    // Format: https://nightly.link/{owner}/{repo}/actions/runs/{run_id}/{artifact_name}.zip
    const downloadUrl = `https://nightly.link/${REPO_OWNER}/${REPO_NAME}/actions/runs/${prInfo.workflowRunId}/${artifactName}.zip`;
    const zipPath = _path.default.join(destDir, `${artifactName}.zip`);
    console.log(`Downloading artifact from: ${downloadUrl}`);
    await downloadFile(downloadUrl, zipPath);
    return zipPath;
  } catch (error) {
    console.error('Error downloading PR build artifact:', error);
    throw error;
  }
}

/**
 * Extracts the app bundle from a downloaded artifact
 */
async function extractAppBundle(zipPath, destDir) {
  // Implementation depends on the artifact structure
  // This is a placeholder for now
  const platform = (0, _os.platform)();
  try {
    if (platform === 'darwin') {
      // Extract .dmg file
      // DMG files need special handling on macOS
      console.log('Extracting DMG file...');
    } else if (platform === 'linux') {
      // Extract AppImage
      console.log('Extracting AppImage...');
    } else if (platform === 'win32') {
      // Extract Windows installer
      console.log('Extracting Windows installer...');
    }
  } catch (error) {
    console.error('Error extracting app bundle:', error);
    throw error;
  }
}

/**
 * Cleans up downloaded PR build artifacts
 */
async function cleanupPRBuild(buildDir) {
  try {
    await fsPromises.rm(buildDir, {
      recursive: true,
      force: true
    });
  } catch (error) {
    console.error('Error cleaning up PR build:', error);
    throw error;
  }
}

/**
 * Gets the path where PR builds should be stored
 */
function getPRBuildStoragePath(tempDir) {
  return _path.default.join(tempDir, 'headlamp-pr-builds');
}

/**
 * Checks if a PR build is currently active
 */
async function isPRBuildActive(configPath) {
  try {
    const configData = await fsPromises.readFile(configPath, 'utf-8');
    const config = JSON.parse(configData);
    return config.activePRBuild !== undefined;
  } catch (error) {
    // Config file doesn't exist or is invalid
    return false;
  }
}

/**
 * Gets information about the currently active PR build
 */
async function getActivePRBuildInfo(configPath) {
  try {
    const configData = await fsPromises.readFile(configPath, 'utf-8');
    const config = JSON.parse(configData);
    return config.activePRBuild || null;
  } catch (error) {
    return null;
  }
}

/**
 * Sets the active PR build information
 */
async function setActivePRBuild(configPath, prInfo) {
  try {
    let config = {};
    try {
      const configData = await fsPromises.readFile(configPath, 'utf-8');
      config = JSON.parse(configData);
    } catch (error) {
      // Config file doesn't exist, start with empty object
    }
    config.activePRBuild = prInfo;
    await fsPromises.writeFile(configPath, JSON.stringify(config, null, 2), 'utf-8');
  } catch (error) {
    console.error('Error setting active PR build:', error);
    throw error;
  }
}

/**
 * Clears the active PR build information
 */
async function clearActivePRBuild(configPath) {
  try {
    let config = {};
    try {
      const configData = await fsPromises.readFile(configPath, 'utf-8');
      config = JSON.parse(configData);
    } catch (error) {
      // Config file doesn't exist, nothing to clear
      return;
    }
    delete config.activePRBuild;
    await fsPromises.writeFile(configPath, JSON.stringify(config, null, 2), 'utf-8');
  } catch (error) {
    console.error('Error clearing active PR build:', error);
    throw error;
  }
}