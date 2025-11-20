import { execFileSync } from 'child_process';
import path from 'path';
import fs from 'fs';

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
  const repoRoot = getRepoRoot();
  const packageJsonPath = path.join(repoRoot, 'app', 'package.json');
  const packageLockJsonPath = path.join(repoRoot, 'app', 'package-lock.json');

  try {
    execFileSync('git', ['add', packageJsonPath, packageLockJsonPath], { stdio: 'inherit' });
    execFileSync('git', ['commit', '--signoff', '-m', `app: Bump version to ${version}`], {
      stdio: 'inherit',
    });
  } catch (error) {
    console.error('Error: Failed to commit version change');
    console.error(error);
    process.exit(1);
  }
}

export function createReleaseTag(version: string): void {
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
  try {
    execFileSync('git', ['push', 'origin', `v${version}`], { stdio: 'inherit' });
  } catch (error) {
    console.error(`Error: Failed to push tag v${version} to origin`);
    console.error(error);
    process.exit(1);
  }
}
