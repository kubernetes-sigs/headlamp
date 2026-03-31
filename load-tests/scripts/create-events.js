#!/usr/bin/env node
const yargs = require("yargs");
const { assertContextKwok, batchApply } = require("./helpers");

function eventYaml(index, now) {
  return `apiVersion: v1
kind: Event
metadata:
  name: Loremsevent ${index} ${now}
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

yargs
  .scriptName("create-events")
  .usage("$0 <cmd> [args]")
  .command(
    "$0 <numEvents> [sleepInterval]",
    "Create nonsense events for load testing",
    (yargs) => {
      yargs.positional("numEvents", {
        describe: "Number of events to create",
        type: "number",
      });
      yargs.positional("sleepInterval", {
        describe: "Deprecated, ignored. Kept for backward compatibility.",
        type: "number",
        default: 0,
      });
    },
    (argv) => {
      assertContextKwok();
      createNonsenseEvents(argv.numEvents);
    },
  )
  .help().argv;
