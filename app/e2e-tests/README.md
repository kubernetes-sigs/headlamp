# e2e test for local playwright app mode

Currently we have the original e2e tests for the web mode in the `e2e-tests` directory. We are adding new tests for the app mode in the `app-e2e-tests` directory for local testing. Unlike the other tests, these tests do not require a token to run so the setup is as followed:

## Running app mode tests

## Setup

- Before running the tests, be sure to have an instance of Minikube running with the name `minikube`

### Running the tests

To run the tests for the app mode, follow the steps below:

- cd into the e2e-tests directory within the headlamp repository
  `cd headlamp/app/e2e-tests`

- npm install the needed packages
  `npm install`

- run the following command
  `npm run test-app`
  (optional: include `-- --headed` to run the tests in headed mode)
  (optional: include `-- --ui` to run the tests in ui mode)

## Running web mode tests

Running the tests for the web mode requires the backend and frontend to be running. Follow the steps below to run the tests for the web mode:

Note: You may encouter issues switching from the app mode tests to the web mode tests. If you do, search for any running headlamp server processes and end them before running the web mode tests or app mode tests.

## Setup

- Before running the tests, be sure to have an instance of Minikube running with the name `minikube`

### Backend

To run the tests for the web mode, you will need to have the backend running. Follow the steps below to run the backend:

- cd into the headlamp directory in a singular terminal
  `cd headlamp`

- run the following command
  `npm run backend:build` followed by `npm run backend:start`

### Frontend

To run the tests for the web mode, you will need to have the frontend running. Follow the steps below to run the frontend:

- cd into the headlamp directory in a separate terminal
  `cd headlamp`

- run the following command
  `npm run frontend:build` followed by `npm run frontend:start`

### Running the tests

To run the tests for the web mode, follow the steps below:

- cd into the e2e-tests directory within the headlamp repository in a separate terminal
  `cd headlamp/app/e2e-tests`

- npm install the needed packages
  `npm install`

- run the following command
  `npm run test-web`
  (optional: include `-- --headed` to run the tests in headed mode)
  (optional: include `-- --ui` to run the tests in ui mode)
