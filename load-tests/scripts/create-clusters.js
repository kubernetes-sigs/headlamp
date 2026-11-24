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

const setTimeout = require("timers/promises").setTimeout;
const { execSync } = require("child_process");
const yargs = require("yargs");
const { assertContextKwok } = require("./helpers");

/**
 * Creates Kubernetes clusters using kwokctl.
 *
 * @param {number} numClusters - The number of clusters to create.
 * @param {number} sleepInterval - The sleep interval in seconds.
 * @param {boolean} deleteClusters - Whether to delete clusters instead of creating them.
 */
async function createClusters(numClusters, sleepInterval, deleteClusters) {
  const now = new Date();

  for (let x = 0; x < numClusters; x++) {
    try {
      const deleteOrCreate = deleteClusters ? "delete" : "create";
      const cmd = `kwokctl ${deleteOrCreate} cluster --name=meow-${x}`;
      console.log(cmd);
      const result = execSync(cmd, {
        stdio: ["pipe", "pipe", "pipe"],
      });
      const stdoutData = result.toString();
      process.stdout.write(stdoutData);
    } catch (error) {
      console.error("Error:", error.stderr.toString());
      if (error.status !== null) {
        console.log("Exit code:", error.status);
      }
    }

    if (sleepInterval > 0) {
      await setTimeout(sleepInterval * 1000);
    }
  }
}

yargs
  .scriptName("create-clusters")
  .usage("$0 <cmd> [args]")
  .command(
    "$0 <numClusters> <sleepInterval>",
    "Create Kubernetes clusters",
    (yargs) => {
      yargs.positional("numClusters", {
        describe: "Number of clusters to create",
        type: "number",
      });
      yargs.positional("sleepInterval", {
        describe: "Sleep interval in seconds between clusters",
        type: "number",
      });
      yargs.option("delete", {
        alias: "d",
        describe: "Delete clusters instead of creating them",
        type: "boolean",
      });
    },
    async (argv) => {
      // assertContextKwok();
      await createClusters(argv.numClusters, argv.sleepInterval, argv.delete);
    },
  )
  .help().argv;
