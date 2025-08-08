import chalk from 'chalk';
import path from 'path';
import fs from 'fs';
import { execSync } from 'child_process';
import { getRepoRoot, commitVersionChange } from '../utils/git.js';
import { sanitizeVersion } from '../utils/version.js';

export function startRelease(releaseVersion: string): void {
  const version = sanitizeVersion(releaseVersion);
  console.log(chalk.blue(`Starting release process for version ${version}...`));

  const repoRoot = getRepoRoot();
  const packageJsonPath = path.join(repoRoot, 'app', 'package.json');

  try {
    // Update package.json with new version
    const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'));
    packageJson.version = version;

    fs.writeFileSync(packageJsonPath, JSON.stringify(packageJson, null, 2) + '\n');
    console.log(chalk.green(`✅ Updated app/package.json with version ${version}`));

    // Run npm install in app directory
    console.log(chalk.blue('Running npm install in app directory...'));
    execSync('npm install', { stdio: 'inherit', cwd: path.join(repoRoot, 'app') });
    console.log(chalk.green('✅ npm install completed'));

    // Commit the changes
    console.log(chalk.blue('Committing changes...'));
    commitVersionChange(version);
    console.log(chalk.green(`✅ Changes committed with message "app: Bump version to ${version}"`));

    console.log(chalk.green(`\nRelease ${version} has been started successfully!`));
    console.log(`You can now create a tag with 'releaser tag' and publish with 'releaser publish ${version}'`);
  } catch (error) {
    console.error(chalk.red('Error starting release:'));
    console.error(error);
    process.exit(1);
  }
}
