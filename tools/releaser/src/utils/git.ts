import { execFileSync } from 'child_process';
import path from 'path';
import fs from 'fs';
import { isValidVersion } from './version.js';

export function getRepoRoot(): string {
  try {
    const gitRoot = execFileSync('git', ['rev-parse', '--show-toplevel'], {
      encoding: 'utf-8',
    }).trim();
    return gitRoot;
  } catch (error) {
    console.error('Error: Not in a git repository');
    process.exit(1);
  }
}

export function getCurrentVersion(): string {
  const repoRoot = getRepoRoot();
  const packageJsonPath = path.join(repoRoot, 'app', 'package.json');

  try {
    const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'));
    return packageJson.version;
  } catch (error) {
    console.error('Error: Could not read package.json');
    process.exit(1);
  }
}

export function commitVersionChange(version: string): void {
  if (!isValidVersion(version)) {
    console.error(`Error: Invalid semantic version format "${version}".`);
    process.exit(1);
  }

  const repoRoot = getRepoRoot();
  const packageJsonPath = path.join(repoRoot, 'app', 'package.json');
  const packageLockJsonPath = path.join(repoRoot, 'app', 'package-lock.json');
  const chartYamlPath = path.join(repoRoot, 'charts', 'headlamp', 'Chart.yaml');
  const expectedTemplatesPath = path.join(repoRoot, 'charts', 'headlamp', 'tests', 'expected_templates');

  try {
    execFileSync(
      'git',
      ['add', packageJsonPath, packageLockJsonPath, chartYamlPath, expectedTemplatesPath],
      { stdio: 'inherit' }
    );
    execFileSync('git', ['commit', '--signoff', '-m', `releaser: bump version to ${version}`], {
      stdio: 'inherit',
    });
  } catch (error) {
    console.error('Error: Failed to commit version change');
    console.error(error);
    process.exit(1);
  }
}

export function createReleaseTag(version: string): void {
  if (!isValidVersion(version)) {
    console.error(`Error: Invalid semantic version format "${version}".`);
    process.exit(1);
  }

  try {
    execFileSync('git', ['tag', '-a', `v${version}`, '-m', `Release ${version}`], {
      stdio: 'inherit',
    });
  } catch (error) {
    console.error(`Error: Failed to create tag v${version}`);
    console.error(error);
    process.exit(1);
  }
}

export function pushTag(version: string): void {
  if (!isValidVersion(version)) {
    console.error(`Error: Invalid semantic version format "${version}".`);
    process.exit(1);
  }

  try {
    execFileSync('git', ['push', 'origin', `v${version}`], { stdio: 'inherit' });
  } catch (error) {
    console.error(`Error: Failed to push tag v${version} to origin`);
    console.error(error);
    process.exit(1);
  }
}

export function branchExists(branchName: string): boolean {
  try {
    execFileSync('git', ['rev-parse', '--verify', branchName], { stdio: 'ignore' });
    return true;
  } catch (error) {
    return false;
  }
}

export function createAndCheckoutBranch(branchName: string): void {
  try {
    execFileSync('git', ['checkout', '-b', branchName], { stdio: 'inherit' });
  } catch (error) {
    console.error(`Error: Failed to create and checkout branch ${branchName}`);
    console.error(error);
    process.exit(1);
  }
}

export function getCurrentBranch(): string {
  try {
    return execFileSync('git', ['rev-parse', '--abbrev-ref', 'HEAD'], {
      encoding: 'utf-8',
    }).trim();
  } catch (error) {
    console.error('Error: Failed to get current branch');
    console.error(error);
    process.exit(1);
  }
}
