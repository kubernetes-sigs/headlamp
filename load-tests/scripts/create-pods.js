#!/usr/bin/env node
const setTimeout = require('timers/promises').setTimeout;
const { execSync } = require('child_process');
const yargs = require('yargs');
const { assertContextKwok } = require('./helpers');

/**
 * Creates Kubernetes pods using kubectl.
 *
 * @param {number} numPods - The number of pods to create.
 * @param {number} sleepInterval - The sleep interval in seconds.
 */
async function createPods(numPods, sleepInterval) {
  const now = new Date();

  for (let x = 0; x < numPods; x++) {
    const inputString = `
apiVersion: apps/v1
kind: Deployment
metadata:
  name: fake-pod-${x}
  namespace: default
spec:
  replicas: 1
  selector:
    matchLabels:
      app: fake-pod-${x}
  template:
    metadata:
      labels:
        app: fake-pod-${x}
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
        image: fake-image
`;

    // create the pod
    try {
      const result = execSync('kubectl apply -f -', {
        input: inputString,
        stdio: ['pipe', 'pipe', 'pipe'],
      });
      const stdoutData = result.toString();
      process.stdout.write(stdoutData);
    } catch (error) {
      console.log(error);
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
  .scriptName('create-pods')
  .usage('$0 <cmd> [args]')
  .command(
    '$0 <numPods> <sleepInterval>',
    'Create Kubernetes pods',
    (yargs) => {
      yargs.positional('numPods', {
        describe: 'Number of pods to create',
        type: 'number',
      });
      yargs.positional('sleepInterval', {
        describe: 'Sleep interval in seconds between pods',
        type: 'number',
      });
    },
    async (argv) => {
      assertContextKwok();
      await createPods(argv.numPods, argv.sleepInterval);
    }
  )
  .help().argv;
