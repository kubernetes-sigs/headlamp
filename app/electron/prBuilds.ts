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

import { createWriteStream } from 'fs';
import * as fsPromises from 'fs/promises';
import https from 'https';
import { platform as osPlatform } from 'os';
import path from 'path';
import { pipeline } from 'stream';
import { promisify } from 'util';
import { verify } from '@sigstore/verify';

const pipelineAsync = promisify(pipeline);

const REPO_OWNER = 'kubernetes-sigs';
const REPO_NAME = 'headlamp';

/**
 * Represents information about a Pull Request with available artifacts
 */
export interface PRInfo {
  number: number;
  title: string;
  author: string;
  authorAvatarUrl: string;
  headSha: string;
  headRef: string;
  commitDate: string;
  commitMessage: string;
  workflowRunId: number;
  availableArtifacts: {
    name: string;
    id: number;
    size: number;
    expired: boolean;
  }[];
}

/**
 * Result of signature verification
 */
export interface SignatureVerificationResult {
  verified: boolean;
  signatureExists: boolean;
  error?: string;
  details?: {
    issuer?: string;
    workflowName?: string;
    workflowRef?: string;
  };
}

/**
 * Represents information about a workflow run
 */
interface WorkflowRun {
  id: number;
  head_sha: string;
  head_branch: string;
  event: string;
  status: string;
  conclusion: string | null;
  created_at: string;
  updated_at: string;
}

/**
 * Represents an artifact from GitHub Actions
 */
interface Artifact {
  id: number;
  name: string;
  size_in_bytes: number;
  expired: boolean;
  created_at: string;
  updated_at: string;
  expires_at: string;
}

/**
 * Makes an HTTPS GET request to the GitHub API
 */
async function githubApiRequest<T>(endpoint: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'api.github.com',
      path: endpoint,
      headers: {
        'User-Agent': 'Headlamp-Desktop-App',
        Accept: 'application/vnd.github.v3+json',
      },
    };

    https
      .get(options, res => {
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
      })
      .on('error', err => {
        reject(err);
      });
  });
}

/**
 * Downloads a file from a URL to a destination path
 */
async function downloadFile(url: string, destPath: string): Promise<void> {
  return new Promise((resolve, reject) => {
    https
      .get(url, res => {
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

        const fileStream = createWriteStream(destPath);
        pipelineAsync(res, fileStream)
          .then(() => resolve())
          .catch(reject);
      })
      .on('error', err => {
        reject(err);
      });
  });
}

/**
 * Verifies a Sigstore signature for a PR build artifact
 * @param artifactPath Path to the artifact file
 * @param signaturePath Path to the .cosign.bundle signature file
 * @returns Verification result
 */
export async function verifyPRBuildSignature(
  artifactPath: string,
  signaturePath: string
): Promise<SignatureVerificationResult> {
  try {
    // Check if signature file exists
    try {
      await fsPromises.access(signaturePath);
    } catch {
      return {
        verified: false,
        signatureExists: false,
        error: 'Signature file not found',
      };
    }

    // Read artifact and signature
    const artifactBuffer = await fsPromises.readFile(artifactPath);
    const signatureBundle = await fsPromises.readFile(signaturePath, 'utf-8');

    // Parse the bundle (Sigstore bundles are JSON)
    let bundle;
    try {
      bundle = JSON.parse(signatureBundle);
    } catch (err) {
      return {
        verified: false,
        signatureExists: true,
        error: 'Invalid signature bundle format',
      };
    }

    // Verify the signature using @sigstore/verify
    try {
      const result = await verify(bundle, artifactBuffer, {
        // Trust GitHub Actions OIDC issuer
        identities: [
          {
            issuer: 'https://token.actions.githubusercontent.com',
            // Accept any subject from the kubernetes-sigs/headlamp repo
            subjectAlternativeName: `^https://github\\.com/kubernetes-sigs/headlamp/\\.github/workflows/.+@refs/(heads|pull)/.+$`,
          },
        ],
      });

      // Extract details from the verification result
      const details = {
        issuer: result.certificate?.issuer,
        workflowName: result.certificate?.extensions?.githubWorkflowName,
        workflowRef: result.certificate?.extensions?.githubWorkflowRef,
      };

      return {
        verified: true,
        signatureExists: true,
        details,
      };
    } catch (verifyError) {
      return {
        verified: false,
        signatureExists: true,
        error: verifyError instanceof Error ? verifyError.message : 'Signature verification failed',
      };
    }
  } catch (error) {
    return {
      verified: false,
      signatureExists: true,
      error: error instanceof Error ? error.message : 'Unknown verification error',
    };
  }
}

/**
 * Downloads signature file for a PR build artifact
 * @param prInfo The PR information
 * @param artifactName Name of the artifact
 * @param destDir Destination directory
 * @returns Path to downloaded signature file, or null if not found
 */
export async function downloadSignatureFile(
  prInfo: PRInfo,
  artifactName: string,
  destDir: string
): Promise<string | null> {
  try {
    // Signature files are uploaded alongside artifacts with .cosign.bundle extension
    const signatureUrl = `https://nightly.link/${REPO_OWNER}/${REPO_NAME}/actions/runs/${prInfo.workflowRunId}/${artifactName}.cosign.bundle`;
    const signaturePath = path.join(destDir, `${artifactName}.cosign.bundle`);

    console.log(`Downloading signature from: ${signatureUrl}`);
    await downloadFile(signatureUrl, signaturePath);

    return signaturePath;
  } catch (error) {
    console.log('Signature file not found or download failed:', error);
    return null;
  }
}

/**
 * Gets the current platform's artifact name pattern
 */
function getPlatformArtifactPattern(): string {
  const platform = osPlatform();
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
export async function fetchPRsWithArtifacts(): Promise<PRInfo[]> {
  try {
    // Get open PRs
    const prsResponse = await githubApiRequest<any[]>(
      `/repos/${REPO_OWNER}/${REPO_NAME}/pulls?state=open&per_page=50`
    );

    const prInfos: PRInfo[] = [];
    const platformPattern = getPlatformArtifactPattern();

    for (const pr of prsResponse) {
      // Get workflow runs for this PR's head SHA
      const runsResponse = await githubApiRequest<{ workflow_runs: WorkflowRun[] }>(
        `/repos/${REPO_OWNER}/${REPO_NAME}/actions/runs?event=pull_request&head_sha=${pr.head.sha}&per_page=10`
      );

      // Find successful workflow runs
      const successfulRuns = runsResponse.workflow_runs.filter(
        run => run.conclusion === 'success' && run.status === 'completed'
      );

      if (successfulRuns.length === 0) {
        continue;
      }

      // Get artifacts for the most recent successful run
      const latestRun = successfulRuns[0];
      const artifactsResponse = await githubApiRequest<{ artifacts: Artifact[] }>(
        `/repos/${REPO_OWNER}/${REPO_NAME}/actions/runs/${latestRun.id}/artifacts`
      );

      // Filter to platform-specific artifacts that haven't expired
      const relevantArtifacts = artifactsResponse.artifacts.filter(
        artifact => artifact.name === platformPattern && !artifact.expired
      );

      if (relevantArtifacts.length > 0) {
        // Get commit details
        const commitResponse = await githubApiRequest<any>(
          `/repos/${REPO_OWNER}/${REPO_NAME}/commits/${pr.head.sha}`
        );

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
            expired: artifact.expired,
          })),
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
 * Downloads and extracts a PR build artifact using nightly.link with signature verification
 * @param prInfo The PR information containing workflow run ID
 * @param artifactName The name of the artifact to download
 * @param destDir The destination directory for extracted files
 * @param showDialog Function to show confirmation dialogs
 * @returns Object containing download result and signature verification status
 */
export async function downloadPRBuildArtifact(
  prInfo: PRInfo,
  artifactName: string,
  destDir: string,
  showDialog?: (options: any) => Promise<any>
): Promise<{ zipPath: string; signatureResult: SignatureVerificationResult }> {
  try {
    // Ensure destination directory exists
    await fsPromises.mkdir(destDir, { recursive: true });

    // Use nightly.link to download artifacts without authentication
    // Format: https://nightly.link/{owner}/{repo}/actions/runs/{run_id}/{artifact_name}.zip
    const downloadUrl = `https://nightly.link/${REPO_OWNER}/${REPO_NAME}/actions/runs/${prInfo.workflowRunId}/${artifactName}.zip`;

    const zipPath = path.join(destDir, `${artifactName}.zip`);

    console.log(`Downloading artifact from: ${downloadUrl}`);
    await downloadFile(downloadUrl, zipPath);

    // Attempt to download and verify signature
    let signatureResult: SignatureVerificationResult = {
      verified: false,
      signatureExists: false,
    };

    const signaturePath = await downloadSignatureFile(prInfo, artifactName, destDir);

    if (signaturePath) {
      signatureResult = await verifyPRBuildSignature(zipPath, signaturePath);
    } else {
      signatureResult = {
        verified: false,
        signatureExists: false,
        error: 'Signature file not available',
      };
    }

    // If dialog function is provided and signature verification failed/missing, show warning
    if (showDialog && (!signatureResult.verified || !signatureResult.signatureExists)) {
      const message = signatureResult.signatureExists
        ? 'Signature verification failed'
        : 'No signature found for this artifact';

      const detail = signatureResult.signatureExists
        ? `The signature verification failed: ${signatureResult.error}\n\nThis artifact may have been tampered with or signed with an untrusted identity. Do you want to continue anyway?`
        : 'This artifact does not have a Sigstore signature. It may be from an older build before signing was implemented, or the signature file is unavailable.\n\nDo you want to continue without signature verification?';

      const result = await showDialog({
        type: 'warning',
        title: message,
        message,
        detail,
        buttons: ['Cancel', 'Continue Anyway'],
        defaultId: 0,
        cancelId: 0,
      });

      if (result.response !== 1) {
        // User cancelled
        await fsPromises.unlink(zipPath).catch(() => {});
        if (signaturePath) {
          await fsPromises.unlink(signaturePath).catch(() => {});
        }
        throw new Error('User cancelled download due to signature verification failure');
      }
    }

    return { zipPath, signatureResult };
  } catch (error) {
    console.error('Error downloading PR build artifact:', error);
    throw error;
  }
}

/**
 * Extracts the app bundle from a downloaded artifact
 * @param zipPath - Path to the downloaded zip file
 * @param destDir - Destination directory for extraction
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars, no-unused-vars
export async function extractAppBundle(zipPath: string, destDir: string): Promise<void> {
  // Implementation depends on the artifact structure
  // This is a placeholder for now
  const platform = osPlatform();

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
export async function cleanupPRBuild(buildDir: string): Promise<void> {
  try {
    await fsPromises.rm(buildDir, { recursive: true, force: true });
  } catch (error) {
    console.error('Error cleaning up PR build:', error);
    throw error;
  }
}

/**
 * Gets the path where PR builds should be stored
 */
export function getPRBuildStoragePath(tempDir: string): string {
  return path.join(tempDir, 'headlamp-pr-builds');
}

/**
 * Checks if a PR build is currently active
 */
export async function isPRBuildActive(configPath: string): Promise<boolean> {
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
export async function getActivePRBuildInfo(configPath: string): Promise<PRInfo | null> {
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
export async function setActivePRBuild(configPath: string, prInfo: PRInfo): Promise<void> {
  try {
    let config: any = {};
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
export async function clearActivePRBuild(configPath: string): Promise<void> {
  try {
    let config: any = {};
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

/**
 * Handles the PR build startup dialog and returns the user's choice
 * @param configPath Path to the config file
 * @param tempDir Temp directory for PR builds
 * @param dialogFunc Function to show the dialog
 * @param i18n Internationalization function
 * @returns Object with shouldReload flag
 */
export async function handlePRBuildStartup(
  configPath: string,
  tempDir: string,
  dialogFunc: (options: any) => Promise<{ response: number }>,
  i18n: { t: (key: string, options?: any) => string }
): Promise<{ shouldReload: boolean }> {
  const isActive = await isPRBuildActive(configPath);

  if (!isActive) {
    return { shouldReload: false };
  }

  const prInfo = await getActivePRBuildInfo(configPath);
  if (!prInfo) {
    return { shouldReload: false };
  }

  const dialogOptions = {
    type: 'warning',
    buttons: [i18n.t('Continue with PR build'), i18n.t('Use default build')],
    defaultId: 0,
    title: i18n.t('Development Build Active'),
    message: i18n.t('You are currently using a development build from PR #{{prNumber}}', {
      prNumber: prInfo.number,
    }),
    detail: i18n.t(
      'PR: {{prTitle}}\nAuthor: {{author}}\nCommit: {{commitSha}}\n\nThis is a development build and may be unstable. Do you want to continue using it or switch back to the default build?',
      {
        prTitle: prInfo.title,
        author: prInfo.author,
        commitSha: prInfo.headSha.substring(0, 7),
      }
    ),
  };

  const answer = await dialogFunc(dialogOptions);

  if (answer.response === 1) {
    // User chose to use default build
    const prBuildDir = getPRBuildStoragePath(tempDir);
    await clearActivePRBuild(configPath);
    await cleanupPRBuild(prBuildDir);
    return { shouldReload: true };
  }

  return { shouldReload: false };
}

/**
 * Registers IPC handlers for PR builds feature
 * @param ipcMain The IPC main object
 * @param configPath Path to the config file
 * @param tempDir Temp directory for PR builds
 * @param enabled Whether the feature is enabled
 */
export function registerPRBuildsIPCHandlers(
  ipcMain: any,
  configPath: string,
  tempDir: string,
  enabled: boolean,
  showDialog: (options: any) => Promise<any>
): void {
  if (enabled) {
    // Handle listing available PR builds
    ipcMain.handle('list-pr-builds', async () => {
      try {
        const prs = await fetchPRsWithArtifacts();
        return { success: true, data: prs };
      } catch (error) {
        console.error('Error fetching PR builds:', error);
        return {
          success: false,
          error: error instanceof Error ? error.message : String(error),
        };
      }
    });

    // Handle getting PR build status
    ipcMain.handle('get-pr-build-status', async () => {
      try {
        const isActive = await isPRBuildActive(configPath);
        const prInfo = isActive ? await getActivePRBuildInfo(configPath) : null;
        return { success: true, data: { isActive, prInfo } };
      } catch (error) {
        console.error('Error getting PR build status:', error);
        return {
          success: false,
          error: error instanceof Error ? error.message : String(error),
        };
      }
    });

    // Handle activating a PR build
    ipcMain.handle('activate-pr-build', async (event: any, prInfo: PRInfo) => {
      try {
        // Show confirmation dialog from Electron (not from renderer)
        const result = await showDialog({
          type: 'warning',
          title: 'Activate PR Build',
          message: `Activate development build from PR #${prInfo.number}?`,
          detail: `Title: ${prInfo.title}\nAuthor: ${
            prInfo.author
          }\nCommit: ${prInfo.headSha.substring(0, 7)}\nDate: ${
            prInfo.commitDate
          }\n\nThis will replace your current build. The application will need to be restarted to apply changes.`,
          buttons: ['Cancel', 'Activate'],
          defaultId: 0,
          cancelId: 0,
        });

        // If user cancelled (clicked Cancel or closed dialog)
        if (result.response !== 1) {
          return { success: false, error: 'User cancelled activation' };
        }

        // Download artifact with signature verification
        const artifactName = prInfo.availableArtifacts[0]?.name || getPlatformArtifactPattern();
        const prBuildDir = getPRBuildStoragePath(tempDir);

        const { zipPath, signatureResult } = await downloadPRBuildArtifact(
          prInfo,
          artifactName,
          prBuildDir,
          showDialog
        );

        // Set active PR build config
        await setActivePRBuild(configPath, prInfo);

        return {
          success: true,
          data: {
            zipPath,
            signatureVerified: signatureResult.verified,
            signatureExists: signatureResult.signatureExists,
          },
        };
      } catch (error) {
        console.error('Error activating PR build:', error);
        return {
          success: false,
          error: error instanceof Error ? error.message : String(error),
        };
      }
    });

    // Handle clearing PR build
    ipcMain.handle('clear-pr-build', async () => {
      try {
        // Show confirmation dialog from Electron (not from renderer)
        const result = await showDialog({
          type: 'warning',
          title: 'Clear PR Build',
          message: 'Clear the active development build and return to default?',
          detail:
            'This will remove the PR build configuration. The application will use the default build after restart.',
          buttons: ['Cancel', 'Clear'],
          defaultId: 0,
          cancelId: 0,
        });

        // If user cancelled (clicked Cancel or closed dialog)
        if (result.response !== 1) {
          return { success: false, error: 'User cancelled clear operation' };
        }

        const prBuildDir = getPRBuildStoragePath(tempDir);
        await clearActivePRBuild(configPath);
        await cleanupPRBuild(prBuildDir);
        return { success: true };
      } catch (error) {
        console.error('Error clearing PR build:', error);
        return {
          success: false,
          error: error instanceof Error ? error.message : String(error),
        };
      }
    });

    // Handle getting feature flag status
    ipcMain.handle('get-pr-builds-enabled', async () => {
      return { success: true, data: enabled };
    });
  } else {
    // If feature is disabled, return appropriate responses
    ipcMain.handle('list-pr-builds', async () => {
      return { success: false, error: 'PR builds feature is not enabled' };
    });

    ipcMain.handle('get-pr-build-status', async () => {
      return { success: false, error: 'PR builds feature is not enabled' };
    });

    ipcMain.handle('activate-pr-build', async () => {
      return { success: false, error: 'PR builds feature is not enabled' };
    });

    ipcMain.handle('clear-pr-build', async () => {
      return { success: false, error: 'PR builds feature is not enabled' };
    });

    ipcMain.handle('get-pr-builds-enabled', async () => {
      return { success: true, data: false };
    });
  }
}
