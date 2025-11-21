#!/usr/bin/env node

import { Command } from 'commander';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { checkRelease } from './commands/check.js';
import { startRelease } from './commands/start.js';
import { tagRelease } from './commands/tag.js';
import { publishRelease } from './commands/publish.js';
import { buildArtifacts } from './commands/build.js';
import { getAppRuns } from './commands/get-app-runs.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Read version from package.json
const packageJsonPath = join(__dirname, '..', 'package.json');
const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf8'));
const version = packageJson.version;

const program = new Command();

program.name('releaser')
  .description('Headlamp release management tool')
  .version(version, '-v, --version', 'display version number');

program.command('check')
  .description('Check if a release exists and verify all artifacts are present')
  .argument('<release-version>', 'Version to check (e.g., 0.30.0)')
  .action(checkRelease);

program.command('start')
  .description('Update package.json with new version and commit changes')
  .argument('<release-version>', 'New version number (e.g., 0.30.0)')
  .option('--no-branch', 'Do not create a release branch (stay on current branch)')
  .action(startRelease);

program.command('tag')
  .description('Create a git tag for the release')
  .action(tagRelease);

program.command('publish')
  .description('Push tag, assign to release draft, and publish the release')
  .argument('<release-version>', 'Version to publish (e.g., 0.30.0)')
  .option('--force', 'Skip confirmation prompt')
  .action(publishRelease);

// CI command with subcommands
const ci = program.command('ci')
  .description('CI-related commands');

ci.command('app')
  .description('Manage app build workflows')
  .option('--build <git-ref>', 'Trigger build artifact workflows for the specified git ref/branch/tag (e.g., main, v0.30.0)')
  .option('--list', 'List the latest app build workflow runs')
  .option('-p, --platform <platform>', 'Platform filter: all, windows, mac, or linux', 'all')
  .option('--latest <number>', 'Number of recent runs to fetch when listing', '1')
  .option('-o, --output <format>', 'Output format when listing: simple or json')
  .option('--force', 'Skip confirmation prompt when building')
  .action(async (options) => {
    // Check if both --build and --list are provided
    if (options.build && options.list) {
      console.error('Error: Cannot use both --build and --list options together');
      process.exit(1);
    }

    // Check if neither --build nor --list are provided
    if (!options.build && !options.list) {
      console.error('Error: Must specify either --build <git-ref> or --list');
      process.exit(1);
    }

    if (options.build) {
      // Build artifacts
      await buildArtifacts(options.build, {
        platform: options.platform,
        force: options.force,
      });
    } else if (options.list) {
      // List app runs
      const latestNum = parseInt(options.latest, 10);
      if (
        isNaN(latestNum) ||
        !Number.isInteger(latestNum) ||
        latestNum <= 0
      ) {
        console.error(
          `Error: --latest must be a valid positive integer (got "${options.latest}")`
        );
        process.exit(1);
      }
      await getAppRuns({
        platform: options.platform,
        latest: latestNum,
        output: options.output,
      });
    }
  });

program.parse();
