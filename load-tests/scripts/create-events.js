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

const { assertContextKwok, batchApply } = require('./helpers');

function eventYaml(index, now) {
  return `apiVersion: v1
kind: Event
metadata:
  name: lorem-event-${index}-${now.getTime()}
  namespace: default
type: Warning
message: 'Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua.'
involvedObject:
  kind: someObject`;
}

/**
 * Creates nonsense events using batch kubectl apply for load testing.
 *
 * @param {number} numEvents - The number of events to create.
 */
function createNonsenseEvents(numEvents) {
  console.log(`Creating ${numEvents} events...`);
  const start = Date.now();
  const now = new Date();

  const yamls = [];
  for (let x = 0; x < numEvents; x++) {
    yamls.push(eventYaml(x, now));
  }
  batchApply(yamls);

  const elapsed = ((Date.now() - start) / 1000).toFixed(1);
  console.log(`Created ${numEvents} events in ${elapsed}s`);
}

if (require.main === module) {
  const yargs = require('yargs');

  yargs
    .scriptName('create-events')
    .usage('$0 <cmd> [args]')
    .command(
      '$0 <numEvents> [sleepInterval]',
      'Create nonsense events for load testing',
      yargs => {
        yargs.positional('numEvents', {
          describe: 'Number of events to create',
          type: 'number',
        });
        yargs.positional('sleepInterval', {
          describe: 'Deprecated, ignored. Kept for backward compatibility.',
          type: 'number',
          default: 0,
        });
      },
      argv => {
        assertContextKwok();
        createNonsenseEvents(argv.numEvents);
      }
    )
    .help().argv;
}

exports.eventYaml = eventYaml;
