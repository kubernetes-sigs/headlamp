import chalk from 'chalk';
import path from 'path';
import fs from 'fs';
import { execSync } from 'child_process';
import { getRepoRoot, commitVersionChange, branchExists, createAndCheckoutBranch, getCurrentBranch } from '../utils/git.js';
import { sanitizeVersion } from '../utils/version.js';

interface StartOptions {
  noBranch?: boolean;
}

export function startRelease(releaseVersion: string, options: StartOptions): void {
  const version = sanitizeVersion(releaseVersion);
  const branchName = `hl-rc-${version}`;
  let branchCreated = false;

  console.log(chalk.blue(`Starting release process for version ${version}...`));

  const repoRoot = getRepoRoot();
  const packageJsonPath = path.join(repoRoot, 'app', 'package.json');

  try {
    // Create branch unless --no-branch is specified
    if (!options.noBranch) {
      if (branchExists(branchName)) {
        console.log(chalk.yellow(`⚠️  Branch ${branchName} already exists, staying on current branch`));
        const currentBranch = getCurrentBranch();
        console.log(chalk.blue(`Current branch: ${currentBranch}`));
      } else {
        console.log(chalk.blue(`Creating and checking out branch ${branchName}...`));
        createAndCheckoutBranch(branchName);
        branchCreated = true;
        console.log(chalk.green(`✅ Created and checked out branch ${branchName}`));
      }
    }

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
    if (branchCreated) {
      console.log(chalk.blue(`Branch: ${branchName}`));
    }
    console.log(`You can now create a tag with 'releaser tag' and publish with 'releaser publish ${version}'`);
  } catch (error) {
    console.error(chalk.red('Error starting release:'));
    console.error(error);
    process.exit(1);
  }
}
