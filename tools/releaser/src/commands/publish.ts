import chalk from 'chalk';
import inquirer from 'inquirer';
import {
  getRelease,
  publishDraftRelease,
  associateTagWithRelease,
  getTagVerification,
  evaluateReleaseTag,
  ReleaseTagCheck,
  TagVerification,
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

    if (!(await checkPushedTag(version, Boolean(options.allowUnsigned)))) {
      process.exit(1);
    }

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
 * Decides whether to stop publishing after pushing the release tag, so that the
 * draft is not published with a tag GitHub rejects. Tags missing on GitHub
 * always stop publishing, because publishing the draft would make GitHub create
 * an unsigned, lightweight tag. Otherwise only `error` results stop publishing,
 * unless `--allow-unsigned` was passed.
 *
 * @param verification The pushed tag's verification status, or null if it is not on GitHub
 * @param check The result of evaluating the tag's verification status
 * @param allowUnsigned Whether `--allow-unsigned` was passed
 */
export function shouldStopPublishing(
  verification: TagVerification | null,
  check: ReleaseTagCheck,
  allowUnsigned: boolean
): boolean {
  if (!verification) {
    return true;
  }
  return check.level === 'error' && !allowUnsigned;
}

/**
 * Checks GitHub's verification status of the pushed tag. Prints an error and
 * returns false if publishing must stop; otherwise warns if GitHub does not
 * show the tag as verified, e.g. because the signing key is not registered as
 * a signing key on the tagger's GitHub account, and returns true.
 */
async function checkPushedTag(version: string, allowUnsigned: boolean): Promise<boolean> {
  const tag = `v${version}`;
  let verification: TagVerification | null;
  try {
    // Retry briefly in case GitHub's API doesn't show the just-pushed tag yet.
    verification = await getTagVerification(version);
    for (let attempt = 1; !verification && attempt < 3; attempt++) {
      await new Promise(resolve => setTimeout(resolve, 2000));
      verification = await getTagVerification(version);
    }
  } catch (error) {
    console.warn(chalk.yellow(`Warning: Could not check the verification status of tag ${tag}: ${error}`));
    return true;
  }

  const result = evaluateReleaseTag(version, verification, false);
  if (shouldStopPublishing(verification, result, allowUnsigned)) {
    console.error(chalk.red(`Error: ${result.message}`));
    console.error(chalk.red(`Tag ${tag} was pushed to origin, but the release was NOT published.`));
    if (!verification) {
      console.error(
        chalk.red(`Make sure 'origin' is kubernetes-sigs/headlamp, then run 'releaser publish ${version}' again.`)
      );
    } else {
      console.error(
        chalk.red(
          `To re-sign the tag, delete it and create it again:\n` +
            `  git push origin :refs/tags/${tag}\n` +
            `  git tag -d ${tag}\n` +
            `  releaser tag\n` +
            `  releaser publish ${version}`
        )
      );
    }
    return false;
  }

  if (result.level === 'ok') {
    console.log(chalk.green(`✅ ${result.message}`));
  } else {
    console.warn(chalk.yellow(`Warning: ${result.message}`));
  }
  return true;
}
