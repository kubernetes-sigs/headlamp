#!/usr/bin/env node
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
