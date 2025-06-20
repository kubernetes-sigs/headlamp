#!/usr/bin/env node

import { Command } from 'commander';
import { readFileSync } from 'fs';
import { join } from 'path';
import { checkRelease } from './commands/check';
import { startRelease } from './commands/start';
import { tagRelease } from './commands/tag';
import { publishRelease } from './commands/publish';

// Read version from package.json
const packageJsonPath = join(__dirname, '..', 'package.json');
const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf8'));
const version = packageJson.version;

const program = new Command();

program.name('releaser')
  .description('Headlamp release management tool')
  .version(version, '-v, --version', 'display version number');

program.command('check')
  .description('Check if a release draft exists with all artifacts')
  .argument('<release-version>', 'Version to check (e.g., 0.30.0)')
  .action(checkRelease);

program.command('start')
  .description('Update package.json with new version and commit changes')
  .argument('<release-version>', 'New version number (e.g., 0.30.0)')
  .action(startRelease);

program.command('tag')
  .description('Create a git tag for the release')
  .action(tagRelease);

program.command('publish')
  .description('Push tag, assign to release draft, and publish the release')
  .argument('<release-version>', 'Version to publish (e.g., 0.30.0)')
  .option('--force', 'Skip confirmation prompt')
  .action(publishRelease);

program.parse();
