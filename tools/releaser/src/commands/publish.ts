import chalk from 'chalk';
import inquirer from 'inquirer';
import { getRelease, publishDraftRelease, associateTagWithRelease } from '../utils/github.js';
import { pushTag } from '../utils/git.js';
import { sanitizeVersion } from '../utils/version.js';

interface PublishOptions {
  force?: boolean;
}

export async function publishRelease(releaseVersion: string, options: PublishOptions): Promise<void> {
  const version = sanitizeVersion(releaseVersion);
  console.log(chalk.blue(`Publishing release v${version}...`));

  try {
    // Confirm unless --force is used
    if (!options.force) {
      const { confirmed } = await inquirer.prompt([
        {
          type: 'confirm',
          name: 'confirmed',
          message: chalk.yellow(`Are you sure you want to publish version ${version}? This action cannot be undone.`),
          default: false
        }
      ]);

      if (!confirmed) {
        console.log(chalk.yellow('Publishing cancelled'));
        return;
      }
    }

    // Push the tag
    console.log(chalk.blue(`Pushing tag v${version} to remote...`));
    pushTag(version);
    console.log(chalk.green(`✅ Pushed tag v${version} to remote`));

    // Get the release draft
    const releaseDraft = await getRelease(version);
    if (!releaseDraft) {
      console.error(chalk.red(`Error: No release draft found for version ${version}`));
      process.exit(1);
    }

    // Associate the tag with the release
    console.log(chalk.blue(`Associating tag v${version} with the release...`));
    await associateTagWithRelease(releaseDraft.id, version);
    console.log(chalk.green(`✅ Associated tag v${version} with the release`));

    // Publish the release
    console.log(chalk.blue('Publishing the release...'));
    await publishDraftRelease(releaseDraft.id);
    console.log(chalk.green(`✅ Published release v${version}`));

    console.log(chalk.green(`\nRelease v${version} has been successfully published!`));
  } catch (error) {
    console.error(chalk.red('Error publishing release:'));
    console.error(error);
    process.exit(1);
  }
}
