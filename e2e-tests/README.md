# end to end tests with playwright

These tests run against Headlamp deployed **in-cluster**, across **two**
clusters whose kubectl contexts are named `test` and `test2`.

Those names are not arbitrary. The specs hardcode them: `podsPage.spec.ts`
navigates to `/c/test/pods`, and `multiCluster.spec.ts` asserts a home page
listing both `test` and `test2`. `headlamp.spec.ts` also asserts on a
`headlamp-admin` service account and on the `headlamp` Service, both of which
come from the in-cluster deployment rather than from a dev server.

The setup below mirrors what CI does in `.github/workflows/build-container.yml`,
which is the reference if anything here drifts.

## Setup

Install the test dependencies:

```bash
cd e2e-tests
npm ci
npx playwright install
```

Create the two clusters and rename their contexts to what the specs expect:

```bash
kind create cluster --name test
kubectl config rename-context kind-test test

kind create cluster --name test2
kubectl config rename-context kind-test2 test2
```

Give each cluster a `headlamp-admin` service account with cluster-admin:

```bash
for ctx in test test2; do
  kubectl --context="$ctx" -n kube-system create serviceaccount headlamp-admin
  kubectl --context="$ctx" create clusterrolebinding headlamp-admin \
    --serviceaccount=kube-system:headlamp-admin --clusterrole=cluster-admin
done
```

Build the images and load them into the `test` cluster. The plugins image is
used as an init container by the manifest below:

```bash
# from the repository root
DOCKER_IMAGE_VERSION=latest make image
DOCKER_IMAGE_VERSION=latest DOCKER_PLUGINS_IMAGE_NAME=headlamp-plugins-test make build-plugins-container

kind load docker-image ghcr.io/headlamp-k8s/headlamp:latest --name test
kind load docker-image ghcr.io/headlamp-k8s/headlamp-plugins-test:latest --name test
```

Deploy Headlamp into the `test` cluster. The manifest is templated, so the
cluster addresses and CA data have to be substituted in:

```bash
kubectl config use-context test
export TEST_CA_DATA=$(kubectl config view --raw --minify -o jsonpath='{.clusters[0].cluster.certificate-authority-data}')
export TEST_SERVER="https://$(kubectl get nodes -o=jsonpath='{.items[0].status.addresses[?(@.type=="InternalIP")].address}'):6443"

kubectl config use-context test2
export TEST2_CA_DATA=$(kubectl config view --raw --minify -o jsonpath='{.clusters[0].cluster.certificate-authority-data}')
export TEST2_SERVER="https://$(kubectl get nodes -o=jsonpath='{.items[0].status.addresses[?(@.type=="InternalIP")].address}'):6443"

kubectl config use-context test
envsubst < e2e-tests/kubernetes-headlamp-ci.yaml | kubectl --context=test apply -f -
kubectl wait deployment -n kube-system headlamp --for condition=Available=True --timeout=180s
```

Finally, export the URL and the tokens the specs read:

```bash
export HEADLAMP_TEST_URL="http://<address of the headlamp Service>"
export HEADLAMP_TEST_TOKEN=$(kubectl --context=test  create token headlamp-admin --duration 24h -n kube-system)
export HEADLAMP_TEST2_TOKEN=$(kubectl --context=test2 create token headlamp-admin --duration 24h -n kube-system)
```

CI reaches the Service on its NodePort, at
`http://<node InternalIP>:<nodePort>`. That address is reachable from the host
on Linux, but not on every platform; if it is not reachable on yours, any means
of exposing the Service will do, as long as `HEADLAMP_TEST_URL` points at it.

`HEADLAMP_TEST_URL` defaults to `http://localhost:3000` if unset
(`playwright.config.ts`), so an unset variable shows up as connection errors
rather than as an obvious configuration problem.

### Kubeconfig with certificates on disk

`dynamicCluster.spec.ts` reads your kubeconfig with `kubectl config view`, which
redacts embedded `certificate-authority-data` and the client certificate fields,
and then reads the referenced files from disk. If those fields are embedded
rather than file paths, six tests in that file fail with `ENOENT`.

CI works around this by rewriting the kubeconfig so the certificates live in
files. If you hit those failures, do the same, and note that the paths must be
absolute, because the test resolves them relative to its own working directory:

```bash
mkdir -p ~/headlamp-e2e-certs
kubectl config view --raw -o jsonpath='{.clusters[0].cluster.certificate-authority-data}' | base64 --decode > ~/headlamp-e2e-certs/ca.crt
kubectl config set-cluster kind-test --certificate-authority="$HOME/headlamp-e2e-certs/ca.crt" --embed-certs=false
kubectl config unset clusters.kind-test.certificate-authority-data
```

Do the same for the `client-certificate-data` and `client-key-data` fields on
the user entry.

### Optional suites

Two spec files skip unless their variable is set, so a normal run does not
exercise them:

```bash
# tests/incluster-api.spec.ts
export HEADLAMP_SA_TOKEN=$(kubectl create token headlamp --duration=1h -n kube-system)

# tests/clusterInventory.spec.ts
export HEADLAMP_CLUSTER_INVENTORY_E2E=true

# Optional, only read by clusterInventory.spec.ts. Defaults to "headlamp".
export HEADLAMP_TEST_BACKEND_TOKEN=...
```

Neither is set in CI, so both suites are skipped there as well.

IMPORTANT: Make sure that the following npx commands are ran in the same terminal session as the environment variables were set.

## Run all tests

- from the terminal navigate to the e2e-tests directory within the headlamp repository
  `cd headlamp/e2e-tests`

- run the following command

```bash
npx playwright test
```

## Run a single test

You can run a single test with the grep flag:

- from the terminal navigate to the e2e-tests directory within the headlamp repository
  `cd headlamp/e2e-tests`

- run the following command

```shell
npx playwright test -g "404 page is present"
```

## Run a single test in browser

- You can run a single test in a real browser with the `--headed` flag, this can be useful if you want to troubleshoot errors with a visual of the test.

```shell
npx playwright test -g "404 page is present" --headed
```

## Recommended configuration

### Playwright UI Mode

- The Playwright UI mode is similar to the VSCode extension where you are able to see the tests run in real-time and can be a great way to troubleshoot issues with the tests. (for more information see: https://playwright.dev/docs/test-ui-mode)

- You can run the tests in UI mode by adding the `--ui` flag to the command.

  - command `npx playwright test --ui`

- This will open a browser window that will show the test running in real-time, this can be ran as a substitute or in pair with the VS code extension.

## Optional configuration

### Headed vs Headless

- If you wish to see the test run in a real browser, you can add the `--headed` flag to the command.

- You can also modify the playwright.config.ts file to change the browser that is used for the tests. You must be sure not to add this change to the repository when you push.
  - within the playwright.config.ts file locate the `const config: PlaywrightTestConfig` object. within the object, modify the use object to contain a field for headless set to false ex. `use: { ..., headless: false }` property to run the tests in a real browser.

### Slow down the tests

- You can modify the playwright.config.ts file to slow down the tests. You must be sure not to add this change to the repository when you push.
  - within the playwright.config.ts file locate the `const config: PlaywrightTestConfig` object. within the object, modify the use object to contain a field for `launchOptions: { slowMo: }` set to a number of milliseconds ex. `use: { ..., launchOptions: { slowMo: 1000 }` property to slow down the tests to take 1 second between each step.

## Running Playwright through a Virtual Machine (VM)

> Note: this section predates the two-cluster kind setup described above and has
> not been updated for it. It still refers to a single minikube cluster and to
> `kubernetes-headlamp-ci.yml`, which is now `kubernetes-headlamp-ci.yaml`.

### Log into Azure CLI

1. **Open a new Ubuntu terminal window.**
   - Verify the installation of Azure CLI on your machine by typing:
     ```
     az version
     ```
   - Log into your Azure account with the following command:
     ```
     az login
     ```

### Prepare the VM Creation Script

1. **Open another terminal window.**

   - Before running the script, replace `VM_NAME` and `RESOURCE_GROUP` with your specific values. You can find the default script template or use a GitHub gist link.

2. **Modify and run the script:**
   - Replace the placeholders in the script with actual values for `VM_NAME` and `RESOURCE_GROUP`.
   - Execute the script using the following command:
     ```
     curl -sSfL https://headlamp.dev/blog/2024/04/user-added-cluster-support-in-shared-headlamp-deployments/create-azurevm.sh | bash
     ```

### Verify VM Creation

1. **Use a web browser to access the Azure portal.**
   - Navigate to the resource page and search for the `VM_NAME` you used in the script to check if the VM was successfully created.

### Connect and Setup the VM

1. **SSH into the newly created VM.**

   - Use this command to connect:
     ```
     ssh your-username@your-vm-ip
     ```

2. **Install essential tools on the VM:**
   - Install Docker:
     ```
     sudo apt install docker.io
     ```
     You can find more details on the [official Docker installation guide](https://docs.docker.com/engine/install/ubuntu).
   - Install Git:
     ```
     sudo apt install git
     ```
   - Clone the Headlamp repository:
     ```
     git clone https://github.com/kubernetes-sigs/headlamp
     ```

### Build and Push Docker Image

1. **Navigate to the workflow file and build the Headlamp image:**

   - Inside `.github/workflows/build-container.yml` is the source line we need, locate the step for building the image and run in your terminal:
     ```
     DOCKER_IMAGE_VERSION=latest npm run image:build
     ```

2. **Tag and push the Docker image to a registry (e.g., ttl.sh):**

   - Tag your Docker image and push it using ttl.sh:
     ```
     docker tag headlamp-k8s/headlamp ttl.sh/headlamp-k8s/headlamp
     docker push ttl.sh/headlamp-k8s/headlamp
     ```

3. **Pull the Docker image to your local machine:**
   - After pushing, exit back to your local machine and pull the image:
     ```
     docker pull ttl.sh/headlamp-k8s/headlamp
     ```

### Setup Minikube and Run Tests

1. **Ensure Minikube is running on your local machine.**

2. **Update the Kubernetes Headlamp CI configuration:**

   - Navigate to `e2e-tests/kubernetes-headlamp-ci.yml`.
   - Change the `image` field under `spec.containers` to match the Docker image you pulled:
     ```
     image: ttl.sh/headlamp-k8s/headlamp
     ```

3. **Deploy to the cluster and run end-to-end tests:**
   - Follow the steps outlined in `Deploy to cluster` and `Run e2e tests` sections to execute these actions on your local machine.
