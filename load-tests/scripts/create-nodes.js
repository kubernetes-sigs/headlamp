#!/usr/bin/env node
const setTimeout = require('timers/promises').setTimeout;
const { execSync } = require('child_process');
const yargs = require('yargs');
const { assertContextKwok } = require('./helpers');

/**
 * Creates Kubernetes nodes on "KWOK" using kubectl.
 *
 * @param {number} numNodes - The number of nodes to create.
 * @param {number} sleepInterval - The sleep interval in seconds.
 */
async function createNodes(numNodes, sleepInterval) {
  const now = new Date();

  for (let x = 0; x < numNodes; x++) {
    const inputString = `
apiVersion: v1
kind: Node
metadata:
  annotations:
    node.alpha.kubernetes.io/ttl: "0"
    kwok.x-k8s.io/node: fake
  labels:
    beta.kubernetes.io/arch: amd64
    beta.kubernetes.io/os: linux
    kubernetes.io/arch: amd64
    kubernetes.io/hostname: kwok-node-${x}
    kubernetes.io/os: linux
    kubernetes.io/role: agent
    node-role.kubernetes.io/agent: ""
    type: kwok
  name: kwok-node-${x}
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
  phase: Running
`;

    // create the node
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
  .scriptName('create-nodes')
  .usage('$0 <cmd> [args]')
  .command(
    '$0 <numNodes> <sleepInterval>',
    'Create Kubernetes nodes',
    (yargs) => {
      yargs.positional('numNodes', {
        describe: 'Number of nodes to create',
        type: 'number',
      });
      yargs.positional('sleepInterval', {
        describe: 'Sleep interval in seconds between nodes',
        type: 'number',
      });
    },
    async (argv) => {
      assertContextKwok();
      await createNodes(argv.numNodes, argv.sleepInterval);
    }
  )
  .help().argv;
