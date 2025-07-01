import chalk from 'chalk';
import { getCurrentVersion, createReleaseTag } from '../utils/git';

export function tagRelease(): void {
  const currentVersion = getCurrentVersion();
  console.log(chalk.blue(`Creating release tag for version ${currentVersion}...`));

  try {
    createReleaseTag(currentVersion);
    console.log(chalk.green(`✅ Created tag v${currentVersion} with message "Release ${currentVersion}"`));
    console.log(chalk.green('\nTag created successfully!'));
  } catch (error) {
    console.error(chalk.red('Error creating tag:'));
    console.error(error);
    process.exit(1);
  }
}
