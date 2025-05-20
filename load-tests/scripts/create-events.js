#!/usr/bin/env node
const setTimeout = require('timers/promises').setTimeout;
const { execSync } = require('child_process');
const yargs = require('yargs');
const { assertContextKwok } = require('./helpers');

/**
 * Creates nonsense events with kubectl for load testing.
 *
 * @param {number} numEvents - The number of events to create.
 * @param {number} sleepInterval - The sleep interval in seconds.
 */
async function createNonsenseEvents(numEvents, sleepInterval) {
  const now = new Date();

  for (let x = 0; x < numEvents; x++) {
    const inputString = `
apiVersion: v1
kind: Event
metadata:
  name: Loremsevent ${x} ${now}
  namespace: default
type: Warning
message: 'Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua.'
involvedObject:
  kind: someObject
`;
    // create the event
    try {
      const result = execSync('kubectl apply -f -', {
        input: inputString,
        stdio: ['pipe', 'pipe', 'pipe'],
      });
      const stdoutData = result.toString();
      process.stdout.write(stdoutData);
    } catch (error) {
      console.error('Error:', error.stderr.toString());
      if (error.status !== null) {
        console.log('Exit code:', error.status);
      }
    }

    if (sleepInterval > 0) {
      await setTimeout(sleepInterval * 1000);
    }
  }
}

yargs
  .scriptName('create-events')
  .usage('$0 <cmd> [args]')
  .command(
    '$0 <numEvents> <sleepInterval>',
    'Create nonsense events for load testing',
    (yargs) => {
      yargs.positional('numEvents', {
        describe: 'Number of events to create',
        type: 'number',
      });
      yargs.positional('sleepInterval', {
        describe: 'Sleep interval in seconds between events',
        type: 'number',
      });
    },
    async (argv) => {
      assertContextKwok();
      await createNonsenseEvents(argv.numEvents, argv.sleepInterval);
    }
  )
  .help().argv;
