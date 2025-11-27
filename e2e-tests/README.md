# end to end tests with playwright and minikube

```
npx playwright install
```

The instructions below assume Headlamp is running locally in-cluster with minikube.

```bash
# Determine if the headlamp addon is enabled
minikube addons list

# If the addon is not already enabled run the following command
minikube addons enable headlamp

# Generate the URL needed for the HEADLAMP_TEST_URL environment variable
# note: Make sure to use the URL created after the " Starting tunnel for service headlamp. " message
minikube service headlamp -n headlamp

# Open the browser to the URL generated above, it should direct you to a page waiting for a token

# run in a separate terminal...
export HEADLAMP_TEST_URL= # from the "minikube service headlamp -n headlamp" command directly above.

# Create a token for the tests to use
export HEADLAMP_TOKEN=$(kubectl create token headlamp --duration 24h -n headlamp)

# To see the token to login via the web browser
echo $HEADLAMP_TOKEN
```

Now with those two environment variables set we can run the tests.

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
