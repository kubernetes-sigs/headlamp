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

function nodeYaml(index) {
  return `apiVersion: v1
kind: Node
metadata:
  annotations:
    node.alpha.kubernetes.io/ttl: "0"
    kwok.x-k8s.io/node: fake
  labels:
    beta.kubernetes.io/arch: amd64
    beta.kubernetes.io/os: linux
    kubernetes.io/arch: amd64
    kubernetes.io/hostname: kwok-node-${index}
    kubernetes.io/os: linux
    kubernetes.io/role: agent
    node-role.kubernetes.io/agent: ""
    type: kwok
  name: kwok-node-${index}
spec:
  taints: # Avoid scheduling actual running pods to fake Node
  - effect: NoSchedule
    key: kwok.x-k8s.io/node
    value: fake
status:
  allocatable:
    cpu: 32
    memory: 256Gi
    pods: 110
  capacity:
    cpu: 32
    memory: 256Gi
    pods: 110
  nodeInfo:
    architecture: amd64
    bootID: ""
    containerRuntimeVersion: ""
    kernelVersion: ""
    kubeProxyVersion: fake
    kubeletVersion: fake
    machineID: ""
    operatingSystem: linux
    osImage: ""
    systemUUID: ""
  phase: Running`;
}

/**
 * Creates Kubernetes nodes on "KWOK" using batch kubectl apply.
 *
 * @param {number} numNodes - The number of nodes to create.
 */
function createNodes(numNodes) {
  console.log(`Creating ${numNodes} nodes...`);
  const start = Date.now();

  const yamls = [];
  for (let x = 0; x < numNodes; x++) {
    yamls.push(nodeYaml(x));
  }
  batchApply(yamls);

  const elapsed = ((Date.now() - start) / 1000).toFixed(1);
  console.log(`Created ${numNodes} nodes in ${elapsed}s`);
}

yargs
  .scriptName("create-nodes")
  .usage("$0 <cmd> [args]")
  .command(
    "$0 <numNodes> [sleepInterval]",
    "Create Kubernetes nodes",
    (yargs) => {
      yargs.positional("numNodes", {
        describe: "Number of nodes to create",
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
      createNodes(argv.numNodes);
    },
  )
  .help().argv;
