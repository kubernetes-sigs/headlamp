#!/usr/bin/env node

/*
 * Copyright 2025 The Kubernetes Authors
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';
import { findProjectRoot, getLocalesDir } from './lib/paths';
import { commandStatus, commandList } from './lib/commands';

const PROJECT_ROOT = findProjectRoot();
const LOCALES_DIR = getLocalesDir(PROJECT_ROOT);

void yargs(hideBin(process.argv))
  .scriptName('i18n')
  .usage('$0 <command> [options]')
  .command('status', 'Show translation status for all languages', {}, () => {
    commandStatus(LOCALES_DIR);
  })
  .command('list [lang]', 'List translation files with completion status', (yargs) => {
    return yargs.positional('lang', {
      describe: 'Language code (e.g., de, fr, es). If not specified, shows all languages',
      type: 'string',
    });
  }, (argv) => commandList(LOCALES_DIR, argv.lang))
  .demandCommand(1, 'Please specify a command')
  .help()
  .alias('h', 'help')
  .version(false)
  .example('$0 status', 'Show translation status for all languages')
  .example('$0 list', 'List all translation files with completion status')
  .example('$0 list de', 'List German translation files with completion status')
  .epilogue('For more information, see https://headlamp.dev/docs/latest/development/i18n/contributing/')
  .parse();
