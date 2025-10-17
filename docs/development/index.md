---
title: Development
sidebar_position: 5
---

This is a quickstart guide for building and running Headlamp for development.

Please make sure you read the [Contribution Guidelines](../contributing.md) as well
before starting to contribute to the project.

See [platforms](../platforms.md) to find out which browsers, OS and flavors of Kubernetes we support.

## Dependencies to get started

These are the required dependencies to get started. Other dependencies are pulled in by the golang or node package managers (see frontend/package.json, app/package.json, backend/go.mod and Dockerfile).

- [Node.js](https://nodejs.org/en/download/) Latest LTS (20.11.1 at time of writing). Many of us use [nvm](https://github.com/nvm-sh/nvm) for installing multiple versions of Node.
- [Go](https://go.dev/doc/install), (1.24 at time of writing)
- [Kubernetes](https://kubernetes.io/), we suggest [minikube](https://minikube.sigs.k8s.io/docs/) as one good K8s installation for testing locally. Other k8s installations are supported (see [platforms](../platforms.md).

## Build the code

Headlamp is composed of a `backend` and a `frontend`.

You can build both the `backend` and `frontend` by running:

```bash
npm run build
```

Or individually:

```bash
npm run backend:build
```

and

```bash
npm run frontend:build
```

## Run the code

The quickest way to get the `backend` and `frontend` running for development is to run both together:

```bash
npm start
```

Or you can run them individually in separate terminal instances:

```bash
npm run backend:start
```

and in a different terminal instance:

```bash
npm run frontend:start
```

## Generate API documentation

To generate the TypeScript API documentation:

```bash
npm run docs
```

This generates API documentation in `docs/development/api/` using TypeDoc.

## Build the app

You can build the app for Linux, Windows, or Mac.

Do so on the platform you are building for. That is build the mac app on a Mac,
and the linux app on a linux box.

Choose the relevant command:

```bash
npm run app:package:linux
```

```bash
npm run app:package:mac
```

```bash
npm run app:package:win
```

For Windows, by default it will produce an installer using [NSIS (Nullsoft Scriptable Install System)](https://sourceforge.net/projects/nsis/).

If you prefer an `.msi` installer, then be sure to install the [WiX Toolset](https://wixtoolset.org/) and have its `light.exe` and `candle.exe` in the Windows path.
E.g., if you are using WiX Toolset version 3.11, this can be done by running the following command,
before the one above:

```bash
set PATH=%PATH%;C:\Program Files (x86)\WiX Toolset v3.11\bin
```

Then run the following command to generate the `.msi` installer:

```bash
npm run app:package:win:msi
```

See the generated app files in app/dist/ .

### Running the app

If you already have **BOTH** the `backend` and `frontend` up and running, the quickest way to
get the `app` running for development is the following:

```bash
npm run app:start:client
```

or else you can simply do

```bash
npm run start:app
```

which runs everything including the `backend`, `frontend` and `app` in parallel.

### Running the app on Ubuntu WSL

Headlamp on WSL requires some packages installed (maybe it requires more) to run the app.

Note: `libgconf-2-4` was removed starting with Ubuntu 24.04 and newer
releases. If you are on an older release where it is still available you can
install it as well, otherwise you can safely omit it.

```bash
sudo apt install libatk1.0-0 libatk-bridge2.0-0 libgdk-pixbuf2.0-0 libgtk-3-0 libgbm1 libnss3 libasound2
```

Some of these are also needed some of them only for the end to end tests.

```bash
sudo apt-get install firefox libgstreamer-plugins-bad1.0-0 libegl1 libnotify4 libopengl0 libwoff1 libharfbuzz-icu0 libgstreamer-gl1.0-0 libwebpdemux2 libenchant1c2a libsecret-1-0 libhyphen0 libevdev2 libgles2 gstreamer1.0-libav
```

## Build a container image

The following command builds a container image for Headlamp from the current
source. It will run the `frontend` from a `backend`'s static server, and
options can be appended to the main command as arguments.

```bash
npm run image:build
```

### Custom container base images

The Dockerfile takes a build argument for the base image used. You can specify the
base image used using the IMAGE_BASE environment variable.

```bash
IMAGE_BASE=debian:latest npm run image:build
```

If no IMAGE_BASE is specified, then a default image is used (see Dockerfile for exact default image used).

This is useful if there are requirements on which base images can be used in an environment.

So far Debian variants (including Ubuntu), and Alpine Linux are supported.
If you have other requirements, please get in touch.

### Running the container image

With docker you can run the Headlamp image(`ghcr.io/headlamp-k8s/headlamp:latest`).
Note, the mount arguments add folders that are referenced in the ~/.kube
folders - you may need to add other folders if your config refers
to more folders.

```bash
docker run --network="host" -p 127.0.0.1:4466:4466/tcp --mount type=bind,source="/home/rene/.minikube",target=$HOME/.minikube --mount type=bind,source="$HOME/.kube",target=/root/.kube ghcr.io/headlamp-k8s/headlamp:latest /headlamp/headlamp-server -html-static-dir /headlamp/frontend -plugins-dir=/headlamp/plugins
```

If you want to make a new container image called `headlamp-k8s/headlamp:development`
you can run it like this:

```bash
$ DOCKER_IMAGE_VERSION=development npm run image:build
...
Successfully tagged headlamp-k8s/headlamp:development

$ docker run --network="host" -p 127.0.0.1:4466:4466/tcp --mount type=bind,source="/home/rene/.minikube",target=$HOME/.minikube --mount type=bind,source="$HOME/.kube",target=/root/.kube headlamp-k8s/headlamp:development /headlamp/headlamp-server -html-static-dir /headlamp/frontend -plugins-dir=/headlamp/plugins
```

Then go to <https://localhost:4466> in your browser.

### Minikube "in-cluster"

These instructions are for if you want to run Headlamp "in-cluster",
and test it locally on minikube with a local container image.

We assume you've already set up minikube
(probably with `minikube start --driver=docker`).

#### Container image in the minikube docker environment

First, we have to make the container image in the minikube docker environment.
This is needed because minikube looks for container images in there, not
ones made in the local docker environment.

```bash
eval $(minikube docker-env)
DOCKER_IMAGE_VERSION=development npm run image:build
```

#### Create a deployment yaml

```bash
kubectl create deployment headlamp -n kube-system --image=headlamp-k8s/headlamp:development -o yaml --dry-run=client -- /headlamp/headlamp-server -html-static-dir /headlamp/frontend -in-cluster -watch-plugins-changes false -plugins-dir=/headlamp/plugins > minikube-headlamp.yaml
```

To use the local container image we change the `imagePullPolicy` to Never.
Making kubectl use local images - which is what you want in development.

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  creationTimestamp: null
  labels:
    app: headlamp
  name: headlamp
  namespace: kube-system
spec:
  replicas: 1
  selector:
    matchLabels:
      app: headlamp
  strategy: {}
  template:
    metadata:
      creationTimestamp: null
      labels:
        app: headlamp
    spec:
      containers:
        - command:
            - /headlamp/headlamp-server
            - -html-static-dir
            - /headlamp/frontend
            - -in-cluster
            - -plugins-dir=/headlamp/plugins
          image: headlamp-k8s/headlamp:development
          name: headlamp
          imagePullPolicy: Never
          resources: {}
status: {}
```

Now we create the deployment.

```bash
kubectl apply -f minikube-headlamp.yaml
```

Then we expose the deployment, and get a URL where we can see it.

```
$ kubectl expose deployment headlamp -n kube-system --type=NodePort --port=4466
service/headlamp exposed

$ kubectl get service headlamp -n kube-system
NAME       TYPE       CLUSTER-IP      EXTERNAL-IP   PORT(S)          AGE
headlamp   NodePort   10.99.144.210   <none>        4466:30712/TCP   6m57s

$ minikube service headlamp -n kube-system --url
http://192.168.49.2:30342
```

Go to the URL printed by minikube in your browser, and get your token to login.

### Shipping plugins in the Docker image

The Headlamp server has an option (`-plugins-dir`) for indicating where to find any plugins.
Thus, a deployment of Headlamp using the Docker image can mount a plugins folder
and point to it by using the mentioned option.

An alternative is to build an image that ships some plugins in it. For that,
just create a ".plugins" folder in the Headlamp project directory, as the Dockerfile
will include it and point to it by default.

## Special Build Options

Here are some options that can be used when building Headlamp to change its default behavior.

### Update Checks

In the **desktop app**, by default, Headlamp will check for new versions from its GitHub page and warn the user about it.
It will also show the release notes after updating to a new version.

This behavior can be turned off by adding the following to a `.env` file in the `app/` folder:

```bash
HEADLAMP_CHECK_FOR_UPDATES=false
```

## Build Headlamp Base (Headlamp without any plugins)

For building Headlamp Base (Headlamp without plugins), simply remove the `app/app-build-manifest.json` and run the build commands in the sections above.
