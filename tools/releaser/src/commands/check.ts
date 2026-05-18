import chalk from 'chalk';
import { getRelease, checkArtifactsForRelease, checkExtendedAssets } from '../utils/github.js';
import { sanitizeVersion } from '../utils/version.js';

export async function checkRelease(releaseVersion: string): Promise<void> {
  const version = sanitizeVersion(releaseVersion);
  console.log(chalk.blue(`Checking release for version ${version}...`));

  try {
    const release = await getRelease(version);

    if (!release) {
      console.error(chalk.red(`Error: No release found for version ${version}`));
      process.exit(1);
    }

    // Check if it's a draft or published release
    if (release.draft) {
      console.log(chalk.yellow(`📝 Release draft found for v${version}`));
      console.log(chalk.blue(`   Status: Draft (not yet published)`));
    } else {
      console.log(chalk.green(`✅ Published release found for v${version}`));
      console.log(chalk.blue(`   Status: Published`));
      if (release.published_at) {
        console.log(chalk.blue(`   Published at: ${new Date(release.published_at).toLocaleString()}`));
      }
    }

    // Check tag information
    if (release.tag_name) {
      console.log(chalk.blue(`   Tag: ${release.tag_name}`));
    }

    const artifactsComplete = await checkArtifactsForRelease(release);

    if (artifactsComplete) {
      console.log(chalk.green('✅ All required artifacts (Mac, Linux, Windows) are present'));
    } else {
      console.error(chalk.red('❌ Some required artifacts are missing from the release'));
      process.exit(1);
    }

    if (release.draft) {
      console.log(chalk.green(`\nRelease draft for v${version} is ready to be published!`));
    } else {
    // For published releases, also check extended assets
      const extendedAssetsStatus = await checkExtendedAssets(version);

      console.log(chalk.green(`\nRelease v${version} is published and complete!`));

      if (extendedAssetsStatus) {
        // Get core and additional assets based on the new configuration
        const coreAssets = ['containerImage', 'homebrew', 'winget', 'chocolatey', 'flatpak', 'dockerExtension'];
        const additionalAssets = ['helm', 'minikube'];

        const coreExtendedComplete = coreAssets.every(key =>
          extendedAssetsStatus[key as keyof typeof extendedAssetsStatus]?.available
        );

        const additionalAssetsComplete = additionalAssets.every(key =>
          extendedAssetsStatus[key as keyof typeof extendedAssetsStatus]?.available
        );

        if (coreExtendedComplete && additionalAssetsComplete) {
          console.log(chalk.green('✅ All extended assets are available'));
        } else if (coreExtendedComplete) {
          console.log(chalk.green('✅ Core extended assets are available'));
          console.log(chalk.yellow('ℹ️  Some additional assets (Helm/Minikube) may still be processing'));
        } else {
          console.log(chalk.yellow('⚠️  Some extended assets may still be processing or unavailable'));
        }
      }
    }
  } catch (error) {
    console.error(chalk.red('Error checking release:'));
    console.error(error);
    process.exit(1);
  }
}
