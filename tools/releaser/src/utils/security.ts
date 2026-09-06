import { spawnSync } from 'child_process';
import { existsSync, readFileSync } from 'fs';
import path from 'path';
import { getRepoRoot } from './git.js';

export interface SecurityCheckResult {
  name: string;
  passed: boolean;
  skipped: boolean;
  message: string;
  output?: string;
}

function isCommandAvailable(command: string, versionArgs: string[] = ['--version']): boolean {
  const result = spawnSync(command, versionArgs, { encoding: 'utf-8' });
  return !result.error && result.status === 0;
}

/**
 * Runs govulncheck against the Go backend module to catch known vulnerabilities
 * in the backend and its dependencies before a release.
 */
export function checkBackendVulnerabilities(): SecurityCheckResult {
  const name = 'Backend vulnerabilities (govulncheck)';
  const repoRoot = getRepoRoot();
  const backendDir = path.join(repoRoot, 'backend');

  if (!existsSync(path.join(backendDir, 'go.mod'))) {
    return {
      name,
      passed: false,
      skipped: true,
      message: 'Skipped: backend/go.mod not found',
    };
  }

  if (!isCommandAvailable('go', ['version'])) {
    return {
      name,
      passed: false,
      skipped: true,
      message: 'Skipped: Go toolchain not found on PATH',
    };
  }

  const govulncheckModule = process.env.GOVULNCHECK_MODULE || 'golang.org/x/vuln/cmd/govulncheck@latest';

  const result = spawnSync('go', ['run', govulncheckModule, './...'], {
    cwd: backendDir,
    encoding: 'utf-8',
  });

  if (result.error) {
    return {
      name,
      passed: false,
      skipped: true,
      message: `Skipped: failed to run govulncheck (${result.error.message})`,
    };
  }

  const output = `${result.stdout || ''}${result.stderr || ''}`;

  // govulncheck exits 0 when clean and 3 when vulnerabilities are found. Any
  // other non-zero status indicates the scan itself failed (e.g. network or
  // module resolution issues) rather than an actual vulnerability finding.
  if (result.status !== 0 && result.status !== 3) {
    return {
      name,
      passed: false,
      skipped: true,
      message: `Skipped: govulncheck failed to complete (exit code ${result.status})`,
      output,
    };
  }

  return {
    name,
    passed: result.status === 0,
    skipped: false,
    message:
      result.status === 0
        ? 'No known vulnerabilities found in the backend module'
        : 'govulncheck reported known vulnerabilities in the backend module',
    output,
  };
}

/**
 * Runs hadolint against a Dockerfile to catch common security misconfigurations
 * (running as root, unpinned base images, use of ADD over COPY, etc).
 */
export function checkDockerfileSecurity(
  dockerfileRelativePath = 'Dockerfile'
): SecurityCheckResult {
  const name = `Dockerfile security (hadolint: ${dockerfileRelativePath})`;
  const repoRoot = getRepoRoot();
  const dockerfilePath = path.join(repoRoot, dockerfileRelativePath);

  if (!existsSync(dockerfilePath)) {
    return {
      name,
      passed: false,
      skipped: true,
      message: `Skipped: ${dockerfileRelativePath} not found`,
    };
  }

  if (!isCommandAvailable('docker')) {
    return {
      name,
      passed: false,
      skipped: true,
      message: 'Skipped: Docker not found on PATH (required to run hadolint)',
    };
  }

  const dockerfileContents = readFileSync(dockerfilePath, 'utf-8');
  const hadolintImage = process.env.HADOLINT_IMAGE || 'hadolint/hadolint';

  const result = spawnSync(
    'docker',
    ['run', '--rm', '-i', hadolintImage, 'hadolint', '--failure-threshold', 'error', '-'],
    { input: dockerfileContents, encoding: 'utf-8' }
  );

  if (result.error) {
    return {
      name,
      passed: false,
      skipped: true,
      message: `Skipped: failed to run hadolint (${result.error.message})`,
    };
  }

  const output = `${result.stdout || ''}${result.stderr || ''}`;

  // Docker itself can fail (e.g. daemon not running, image pull failure,
  // invalid CLI usage) using exit codes such as 125, 126 or 127. Those are
  // not Dockerfile findings from hadolint and shouldn't be reported as such.
  const dockerExecutionFailureCodes = [125, 126, 127];
  if (result.status === null || dockerExecutionFailureCodes.includes(result.status)) {
    return {
      name,
      passed: false,
      skipped: true,
      message: `Skipped: docker failed to run hadolint (exit code ${result.status})`,
      output,
    };
  }

  return {
    name,
    passed: result.status === 0,
    skipped: false,
    message:
      result.status === 0
        ? `No issues found in ${dockerfileRelativePath}`
        : `hadolint reported issues in ${dockerfileRelativePath}`,
    output,
  };
}
