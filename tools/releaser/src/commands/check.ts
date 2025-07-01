import chalk from 'chalk';
import { getRelease, checkArtifactsForRelease } from '../utils/github';
import { sanitizeVersion } from '../utils/version';

export async function checkRelease(releaseVersion: string): Promise<void> {
  const version = sanitizeVersion(releaseVersion);
  console.log(chalk.blue(`Checking release draft for version ${version}...`));

  try {
    const releaseDraft = await getRelease(version);

    if (!releaseDraft) {
      console.error(chalk.red(`Error: No release draft found for version ${version}`));
      process.exit(1);
    }

    console.log(chalk.green(`✅ Release draft found for v${version}`));

    const artifactsComplete = await checkArtifactsForRelease(releaseDraft);

    if (artifactsComplete) {
      console.log(chalk.green('✅ All required artifacts (Mac, Linux, Windows) are uploaded'));
    } else {
      console.error(chalk.red('❌ Some required artifacts are missing from the release draft'));
      process.exit(1);
    }

    console.log(chalk.green(`\nRelease draft for v${version} is ready to be published!`));
  } catch (error) {
    console.error(chalk.red('Error checking release draft:'));
    console.error(error);
    process.exit(1);
  }
}
