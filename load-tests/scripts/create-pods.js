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

function podYaml(index) {
  return `apiVersion: apps/v1
kind: Deployment
metadata:
  name: fake-pod-${index}
  namespace: default
spec:
  replicas: 1
  selector:
    matchLabels:
      app: fake-pod-${index}
  template:
    metadata:
      labels:
        app: fake-pod-${index}
    spec:
      affinity:
        nodeAffinity:
          requiredDuringSchedulingIgnoredDuringExecution:
            nodeSelectorTerms:
            - matchExpressions:
              - key: type
                operator: In
                values:
                - kwok
      tolerations:
      - key: "kwok.x-k8s.io/node"
        operator: "Exists"
        effect: "NoSchedule"
      containers:
      - name: fake-container
        image: fake-image`;
}

/**
 * Creates Kubernetes pods (as Deployments) using batch kubectl apply.
 *
 * @param {number} numPods - The number of pods to create.
 */
function createPods(numPods) {
  console.log(`Creating ${numPods} pod deployments...`);
  const start = Date.now();

  const yamls = [];
  for (let x = 0; x < numPods; x++) {
    yamls.push(podYaml(x));
  }
  batchApply(yamls);

  const elapsed = ((Date.now() - start) / 1000).toFixed(1);
  console.log(`Created ${numPods} pod deployments in ${elapsed}s`);
}

yargs
  .scriptName("create-pods")
  .usage("$0 <cmd> [args]")
  .command(
    "$0 <numPods> [sleepInterval]",
    "Create Kubernetes pods",
    (yargs) => {
      yargs.positional("numPods", {
        describe: "Number of pods to create",
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
      createPods(argv.numPods);
    },
  )
  .help().argv;
