import chalk from 'chalk';
import inquirer from 'inquirer';
import {
  getRelease,
  publishDraftRelease,
  associateTagWithRelease,
  getTagVerification,
} from '../utils/github.js';
import { isReleaseTagSigned, pushTag } from '../utils/git.js';
import { sanitizeVersion, isValidVersion } from '../utils/version.js';

interface PublishOptions {
  force?: boolean;
  allowUnsigned?: boolean;
}

export async function publishRelease(releaseVersion: string, options: PublishOptions): Promise<void> {
  const version = sanitizeVersion(releaseVersion);
  if (!isValidVersion(version)) {
    console.error(chalk.red(`Error: Invalid semantic version format "${version}".`));
    process.exit(1);
  }

  if (!isReleaseTagSigned(version)) {
    if (!options.allowUnsigned) {
      console.error(
        chalk.red(
          `Error: Tag v${version} does not exist locally or is not signed. ` +
            `Create it with 'releaser tag', or pass --allow-unsigned to publish anyway.`
        )
      );
      process.exit(1);
    }
    console.warn(chalk.yellow(`Warning: Publishing with unsigned tag v${version}.`));
  }

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

    await warnIfTagNotVerified(version);

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

/**
 * Warns if GitHub does not show the pushed tag as verified, e.g. because the
 * signing key is not registered as a signing key on the tagger's GitHub account.
 */
async function warnIfTagNotVerified(version: string): Promise<void> {
  try {
    const { verified, reason } = await getTagVerification(version);
    if (verified) {
      console.log(chalk.green(`✅ GitHub shows tag v${version} as verified`));
      return;
    }

    console.warn(chalk.yellow(`Warning: GitHub does not show tag v${version} as verified (reason: ${reason}).`));
    if (reason === 'unknown_key') {
      console.warn(
        chalk.yellow(
          'Add your GPG or SSH signing key to your GitHub account as a signing key: ' +
            'https://docs.github.com/en/authentication/managing-commit-signature-verification'
        )
      );
    }
  } catch (error) {
    console.warn(chalk.yellow(`Warning: Could not check the verification status of tag v${version}: ${error}`));
  }
}
