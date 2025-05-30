---
title: Building a Custom Headlamp Docker Image with Pre-installed Plugins
sidebar_label: Custom Docker Image with Plugins
---

This guide explains how to build a custom Headlamp Docker image with your own plugins pre-installed. This is useful for production environments or when you want to avoid dynamic plugin installation using init containers or PVCs.

## 1. Build Your Plugins

First, build your Headlamp plugins for production. Each plugin should have a `dist/main.js` file after building.

```bash
cd plugins/examples/pod-counter
npm install
npm run build
```

Repeat for each plugin you want to include.

## 2. Extract Plugins to a `.plugins` Directory

Use the Headlamp plugin CLI to extract your built plugins into a `.plugins` directory at the root of your Headlamp project:

```bash
mkdir .plugins
npx @kinvolk/headlamp-plugin extract ./plugins/examples/ ./.plugins
```

This will create a structure like:

```
.plugins/
  PodCounter/
    main.js
    package.json
  AnotherPlugin/
    main.js
    package.json
```

## 3. Build the Docker Image

The Headlamp Dockerfile is designed to copy the `.plugins` directory into the image automatically. From the root of your Headlamp project, run:

```bash
make image
```

Or, to tag your image:

```bash
DOCKER_IMAGE_VERSION=my-custom-version make image
```

## 4. Run the Image

Your custom plugins will be available in the container at startup. Example:

```bash
docker run --network="host" -p 127.0.0.1:4466:4466/tcp headlamp-k8s/headlamp:my-custom-version
```

## 5. Notes

- The Dockerfile copies `.plugins` to `/headlamp/plugins` in the image.
- You can also mount a plugins directory at runtime using the `-plugins-dir` option if you prefer not to bake them into the image.
- For more details, see the [official plugin building guide](./building.md) and [blog post on best practices](https://headlamp.dev/blog/2022/10/20/best-practices-for-deploying-headlamp-with-plugins).

## Example: Full Workflow

```bash
# 1. Build your plugin(s)
cd plugins/examples/pod-counter
npm install
npm run build
cd ../../..

# 2. Extract to .plugins
echo "Extracting plugins..."
mkdir -p .plugins
npx @kinvolk/headlamp-plugin extract ./plugins/examples/ ./.plugins

# 3. Build the image
DOCKER_IMAGE_VERSION=with-plugins make image

# 4. Run the image
docker run --network="host" -p 127.0.0.1:4466:4466/tcp headlamp-k8s/headlamp:with-plugins
```

---

This approach avoids the need for init containers or PVCs for plugin delivery and is suitable for static, production-ready deployments.
