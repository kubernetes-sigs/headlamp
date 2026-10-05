import chalk from 'chalk';
import { getCurrentVersion, createReleaseTag } from '../utils/git.js';

interface TagOptions {
  sign?: boolean;
}

export function tagRelease(options: TagOptions = {}): void {
  const currentVersion = getCurrentVersion();
  const sign = options.sign !== false;
  console.log(
    chalk.blue(`Creating ${sign ? 'signed ' : ''}release tag for version ${currentVersion}...`)
  );

  try {
    createReleaseTag(currentVersion, sign);
    console.log(
      chalk.green(
        `✅ Created ${sign ? 'signed ' : ''}tag v${currentVersion} with message "Release ${currentVersion}"`
      )
    );
    console.log(chalk.green('\nTag created successfully!'));
  } catch (error) {
    console.error(chalk.red('Error creating tag:'));
    console.error(error);
    process.exit(1);
  }
}
