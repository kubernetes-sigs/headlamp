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

Run these commands from the repository root on Linux with Docker running and
Node.js `>=22.0.0`, npm `>=11.0.0`, `curl`, `envsubst`, `grep`, `kind`, `kubectl`,
`jq`, and `make` installed.

Install the Playwright dependencies:

```bash
cd e2e-tests
npm ci
npx playwright install --with-deps
cd ..
```

Set up the two clusters, Headlamp, and the Cluster Inventory fixture:

```bash
./e2e-tests/scripts/setup-multicluster.sh
```

The script writes the URL and credentials needed by Playwright to
`e2e-tests/.env`. Load them and run the multi-cluster and Cluster Inventory
specs:

```bash
set -a
source e2e-tests/.env
set +a
cd e2e-tests
npx playwright test tests/multiCluster.spec.ts tests/clusterInventory.spec.ts
cd ..
```

The setup is idempotent. It creates `test` and `test2` when neither exists,
reuses them when both exist, and fails without deleting anything when the
environment is only partially present. Clusters created by a successful setup
stay running for subsequent tests. The setup log reports whether it created or
reused the clusters.

If the setup reused the clusters, leave both clusters and contexts intact and
remove only the generated environment file:

```bash
rm -f e2e-tests/.env
```

If the setup created both clusters, remove that environment when finished:

```bash
kind delete cluster --name test
kind delete cluster --name test2
kubectl config delete-context test 2>/dev/null || true
kubectl config delete-context test2 2>/dev/null || true
rm -f e2e-tests/.env
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
rather than file paths, seven tests in that file fail with `ENOENT`.

CI works around this by rewriting the kubeconfig so the certificates live in
files. If you hit those failures, do the same, and note that the paths must be
absolute, because the test resolves them relative to its own working directory:

```bash
umask 077
mkdir -p ~/headlamp-e2e-certs

# test cluster
kubectl config view --raw --minify --context=test -o jsonpath='{.clusters[0].cluster.certificate-authority-data}' | base64 --decode > ~/headlamp-e2e-certs/test-ca.crt
kubectl config view --raw --minify --context=test -o jsonpath='{.users[0].user.client-certificate-data}' | base64 --decode > ~/headlamp-e2e-certs/test-client.crt
kubectl config view --raw --minify --context=test -o jsonpath='{.users[0].user.client-key-data}' | base64 --decode > ~/headlamp-e2e-certs/test-client.key

kubectl config set-cluster kind-test \
  --certificate-authority="$HOME/headlamp-e2e-certs/test-ca.crt" \
  --embed-certs=false

kubectl config set-credentials admin@kind-test \
  --client-certificate="$HOME/headlamp-e2e-certs/test-client.crt" \
  --client-key="$HOME/headlamp-e2e-certs/test-client.key" \
  --embed-certs=false

# test2 cluster
kubectl config view --raw --minify --context=test2 -o jsonpath='{.clusters[0].cluster.certificate-authority-data}' | base64 --decode > ~/headlamp-e2e-certs/test2-ca.crt
kubectl config view --raw --minify --context=test2 -o jsonpath='{.users[0].user.client-certificate-data}' | base64 --decode > ~/headlamp-e2e-certs/test2-client.crt
kubectl config view --raw --minify --context=test2 -o jsonpath='{.users[0].user.client-key-data}' | base64 --decode > ~/headlamp-e2e-certs/test2-client.key

kubectl config set-cluster kind-test2 \
  --certificate-authority="$HOME/headlamp-e2e-certs/test2-ca.crt" \
  --embed-certs=false

kubectl config set-credentials admin@kind-test2 \
  --client-certificate="$HOME/headlamp-e2e-certs/test2-client.crt" \
  --client-key="$HOME/headlamp-e2e-certs/test2-client.key" \
  --embed-certs=false
```

### Additional suites

`tests/incluster-api.spec.ts` tests a separate Headlamp deployment running in
in-cluster mode. CI runs it in a dedicated step after deploying
`kubernetes-headlamp-incluster-ci.yaml` to the `test2` cluster. To reproduce
that setup locally:

```bash
kubectl config use-context test2
kubectl create serviceaccount headlamp --namespace kube-system
kubectl create clusterrolebinding headlamp \
  --serviceaccount=kube-system:headlamp --clusterrole=cluster-admin
kubectl apply -f e2e-tests/kubernetes-headlamp-incluster-ci.yaml
kubectl wait deployment -n kube-system headlamp \
  --for condition=Available=True --timeout=120s

kubectl port-forward -n kube-system service/headlamp 8080:80
```

Leave the port-forward running, then use a second terminal to set the URL and
service account token before running the spec:

```bash
export HEADLAMP_TEST_URL=http://localhost:8080
export HEADLAMP_SA_TOKEN=$(kubectl create token headlamp --duration=1h -n kube-system)

cd e2e-tests
npx playwright test tests/incluster-api.spec.ts
```

### Cluster Inventory

The Cluster Inventory E2E uses the same `test` and `test2` clusters and the same
Headlamp Deployment as the regular multi-cluster tests. It installs the v0.1.3
Cluster Inventory API CRD on `test`, publishes one `ClusterProfile` for
`test2`, and verifies both discovery and proxy access to a running pod in
`tests/clusterInventory.spec.ts`. The generated `.env` enables this spec; it is
otherwise skipped unless `HEADLAMP_CLUSTER_INVENTORY_E2E=true`.

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

## OAuth2-Proxy + Dex e2e test (opt-in)

The spec `tests/dexOauth2Proxy.spec.ts` exercises the
[Headlamp + OAuth2-Proxy + Dex tutorial](../docs/installation/in-cluster/dex/index.md)
end-to-end against the runnable
[`test-scripts/`](../docs/installation/in-cluster/dex/test-scripts/)
stack (Minikube + Dex + Headlamp + OAuth2-Proxy). It covers the
authentication gating, login and logout, Kubernetes API access, session
handling, redirects, and common bypass attempts. It is **opt-in**: the
whole `describe` block is skipped unless
`HEADLAMP_TEST_DEX_OAUTH2_PROXY=1` is set — because the stack takes
several minutes to bring up.

The browser must resolve `host.minikube.internal` to the machine running Dex.
If Playwright runs outside WSL or a VM, add the mapping on the browser side and
use the WSL/VM address that reaches Dex rather than assuming `127.0.0.1`.

Two modes are supported:

1. **Have the test bring the stack up and tear it down (recommended):**

   ```shell
   export HEADLAMP_TEST_DEX_OAUTH2_PROXY=1
   export HEADLAMP_TEST_DEX_OAUTH2_PROXY_MANAGE=1
   npx playwright test tests/dexOauth2Proxy.spec.ts
   ```

    The test runs
    `../docs/installation/in-cluster/dex/test-scripts/run.sh`
    in `beforeAll` and `cleanup.sh` in `afterAll`.

2. **Use a stack you already brought up:**

    ```shell
    cd ../docs/installation/in-cluster/dex/test-scripts
    ./run.sh
    cd -
    export HEADLAMP_TEST_DEX_OAUTH2_PROXY=1
    npx playwright test tests/dexOauth2Proxy.spec.ts
    # …when done:
    ../docs/installation/in-cluster/dex/test-scripts/cleanup.sh
    ```

The test points at `http://localhost:8080` (the port `run.sh`
port-forwards to OAuth2-Proxy) and signs in to Dex as
`admin@example.com` / `password` (the static user from
`dex-config.yaml`). Override with `HEADLAMP_TEST_DEX_OAUTH2_PROXY_URL`,
`HEADLAMP_TEST_DEX_USER` and `HEADLAMP_TEST_DEX_PASSWORD` if needed.

## Recommended configuration

### Playwright UI Mode

- The Playwright UI mode is similar to the VSCode extension where you are able to see the tests run in real-time and can be a great way to troubleshoot issues with the tests. (for more information see: https://playwright.dev/docs/test-ui-mode)

- You can run the tests in UI mode by adding the `--ui` flag to the command.

  - command `npx playwright test --ui`

- This will open a browser window that will show the test running in real-time, this can be ran as a substitute or in pair with the VS code extension.

## Optional configuration

### System Chromium

Playwright downloads a supported Chromium build by default. On an unsupported
Linux distribution, use an existing Chromium executable instead:

```bash
export PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH="$(command -v chromium)"
```

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
