import chalk from 'chalk';
import fs from 'fs';
import path from 'path';
import { getRelease, downloadReleaseAsset, compareAsset } from '../utils/github.js';
import { sanitizeVersion, isValidVersion } from '../utils/version.js';

/**
 * Checks that each file is attached to the release under the same name, and
 * that the attached copy matches the local file. Exits with an error otherwise.
 */
export async function verifyAssets(releaseVersion: string, files: string[]): Promise<void> {
  const version = sanitizeVersion(releaseVersion);
  if (!isValidVersion(version)) {
    console.error(chalk.red(`Error: Invalid semantic version format "${version}".`));
    process.exit(1);
  }

  const release = await getRelease(version);
  if (!release) {
    console.error(chalk.red(`Error: No release found for version ${version}`));
    process.exit(1);
  }

  let failed = false;
  for (const file of files) {
    const name = path.basename(file);
    let local: Buffer;
    try {
      local = fs.readFileSync(file);
    } catch (error) {
      console.error(chalk.red(`❌ Could not read ${file}: ${error}`));
      failed = true;
      continue;
    }

    const result = compareAsset(local, await downloadReleaseAsset(release, name));
    if (result === 'ok') {
      console.log(chalk.green(`✅ ${name} is attached to the release and matches ${file}`));
    } else if (result === 'missing') {
      console.error(chalk.red(`❌ ${name} is not attached to the release`));
      failed = true;
    } else {
      console.error(chalk.red(`❌ The attached ${name} does not match ${file}`));
      failed = true;
    }
  }

  if (failed) {
    process.exit(1);
  }
}
