#!/usr/bin/env deployments
const setTimeout = require('timers/promises').setTimeout;
const { execSync } = require('child_process');
const yargs = require('yargs');
const { assertContextKwok } = require('./helpers');

/**
 * Creates Kubernetes deployments on "KWOK" using kubectl.
 *
 * @param {number} numDeployments - The number of deployments to create.
 * @param {number} sleepInterval - The sleep interval in seconds.
 */
async function createDeployments(numDeployments, sleepInterval) {
  const now = new Date();

  for (let x = 0; x < numDeployments; x++) {
    const inputString = `
apiVersion: apps/v1
kind: Deployment
metadata:
  name: nginx-deployment-${x}
  labels:
    app: nginx-${x}
spec:
  replicas: 1
  selector:
    matchLabels:
      app: nginx-${x}
  template:
    metadata:
      labels:
        app: nginx-${x}
    spec:
      containers:
      - name: nginx-${x}
        image: nginx:1.14.2
        ports:
        - containerPort: ${x + 80}
`;

    // create the deployments
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
  .scriptName('create-deployments')
  .usage('$0 <cmd> [args]')
  .command(
    '$0 <numDeployments> <sleepInterval>',
    'Create Kubernetes deployments',
    (yargs) => {
      yargs.positional('numDeployments', {
        describe: 'Number of deployments to create',
        type: 'number',
      });
      yargs.positional('sleepInterval', {
        describe: 'Sleep interval in seconds between deployments',
        type: 'number',
      });
    },
    async (argv) => {
      assertContextKwok();
      await createDeployments(argv.numDeployments, argv.sleepInterval);
    }
  )
  .help().argv;
