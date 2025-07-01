import { execSync } from 'child_process';
import path from 'path';
import fs from 'fs';

export function getRepoRoot(): string {
  try {
    const gitRoot = execSync('git rev-parse --show-toplevel', { encoding: 'utf-8' }).trim();
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
    execSync(`git add "${packageJsonPath}" "${packageLockJsonPath}"`);
    execSync(`git commit --signoff -m "app: Bump version to ${version}"`);
  } catch (error) {
    console.error('Error: Failed to commit version change');
    console.error(error);
    process.exit(1);
  }
}

export function createReleaseTag(version: string): void {
  try {
    execSync(`git tag -a v${version} -m "Release ${version}"`);
  } catch (error) {
    console.error(`Error: Failed to create tag v${version}`);
    console.error(error);
    process.exit(1);
  }
}

export function pushTag(version: string): void {
  try {
    execSync(`git push origin v${version}`);
  } catch (error) {
    console.error(`Error: Failed to push tag v${version} to origin`);
    console.error(error);
    process.exit(1);
  }
}
