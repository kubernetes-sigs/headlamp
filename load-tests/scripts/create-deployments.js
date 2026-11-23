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

const yargs = require("yargs");
const { assertContextKwok, batchApply } = require("./helpers");

function deploymentYaml(index) {
  return `apiVersion: apps/v1
kind: Deployment
metadata:
  name: nginx-deployment-${index}
  labels:
    app: nginx-${index}
spec:
  replicas: 1
  selector:
    matchLabels:
      app: nginx-${index}
  template:
    metadata:
      labels:
        app: nginx-${index}
    spec:
      containers:
      - name: nginx-${index}
        image: nginx:1.14.2
        ports:
        - containerPort: ${index + 80}`;
}

/**
 * Creates Kubernetes deployments on "KWOK" using batch kubectl apply.
 *
 * @param {number} numDeployments - The number of deployments to create.
 */
function createDeployments(numDeployments) {
  console.log(`Creating ${numDeployments} deployments...`);
  const start = Date.now();

  const yamls = [];
  for (let x = 0; x < numDeployments; x++) {
    yamls.push(deploymentYaml(x));
  }
  batchApply(yamls);

  const elapsed = ((Date.now() - start) / 1000).toFixed(1);
  console.log(`Created ${numDeployments} deployments in ${elapsed}s`);
}

yargs
  .scriptName("create-deployments")
  .usage("$0 <cmd> [args]")
  .command(
    "$0 <numDeployments> [sleepInterval]",
    "Create Kubernetes deployments",
    (yargs) => {
      yargs.positional("numDeployments", {
        describe: "Number of deployments to create",
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
      createDeployments(argv.numDeployments);
    },
  )
  .help().argv;
