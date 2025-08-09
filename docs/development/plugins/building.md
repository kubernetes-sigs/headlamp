---
title: Building and Shipping Plugins
sidebar_label: Building & Shipping
---

Once you have a plugin ready, you may want to build it for production and
deploy with Headlamp or publish it for other Headlamp users to enjoy.

## Deploying Plugins (General Information)

Once your plugin is built and tested, you need to deploy it to your Headlamp instances. This section covers all deployment scenarios.

Let's assume that Headlamp will be run with the `-plugins-dir` option set to
`/headlamp/plugins`, which is the default for in-cluster deployments.

### Plugin Directory Structure

Headlamp expects plugins to follow a specific directory structure:

```
my-plugins/                 # Plugin root directory
├── MyPlugin1/
│   ├── main.js             # Built plugin file
│   └── package.json        # Plugin metadata
├── MyPlugin2/
│   ├── main.js
│   └── package.json
└── MyPlugin3/
    ├── main.js
    └── package.json
```

### Extracting Built Plugins

To extract a single plugin, you can package it first, then extract the package to the right place:

```bash
npm install
npm run build
npm run package

# Extract single plugin
tar xvzf my-first-plugin-0.1.0.tar.gz -C /headlamp/plugins
```

If you prefer to export one or more plugins directly, use the `headlamp-plugin` tool. Run `npm run build` first. Then use the `extract` option on a folder with Headlamp plugins.

For a directory like this:

```
# Directory structure
my-plugins/
├── MyPlugin1/
│   ├── dist/
│   │   └── main.js
│   └── package.json
└── MyPlugin2/
    ├── dist/
    │   └── main.js
    └── package.json
```

You can extract the plugins into a target directory like this:

```bash
npx @kinvolk/headlamp-plugin extract ./my-plugins /headlamp/plugins
```

## Plugins in Headlamp Desktop

Headlamp Desktop has a Plugin Catalog to install plugins easily. It includes plugins from Headlamp developers and the community.

By default, only official plugins in the Plugin Catalog are allowed. The catalog confirms which plugin you want to install. It also shows where the plugin will be downloaded from.

:::important
The Plugin Catalog allows users to change the default behavior and instead show all
plugins. It is however extremely important that you only run plugins that you
trust, as plugins run in the same JavaScript context as the main application.
:::

To learn how to publish your plugin to make it available in the Plugin Catalog for other users, see the [Publishing Plugins guide](./publishing.md).

### Manual Installation

First, build and package the plugin in the plugin folder:

```bash
cd my-plugin/
npm install
npm run build
npm run package
```

You can install the plugin in the Headlamp desktop app by exporting the plugin
archive to the plugins directory. E.g.:

On Linux/macOS:

```bash
mkdir -p ~/.config/Headlamp/plugins/
tar xvf my-first-plugin-0.1.0.tar.gz -C ~/.config/Headlamp/plugins/
```

These are the default plugin directory locations for the Headlamp desktop app:

| Operating System | Default Plugin Directory |
|------------------|--------------------------|
| **MacOS** | `$HOME/.config/Headlamp/plugins` |
| **Linux** | `$HOME/.config/Headlamp/plugins` |
| **Windows** | `%APPDATA%/Headlamp/Config/plugins` |

## Plugins in Headlamp Deployments

### Using InitContainer with a Plugin Image

When deploying Headlamp with plugins, it is easier to use a container image with the plugins already installed. Then, use an init container to mount the plugins into the Headlamp container.

Some plugins already have a published container image. For Headlamp's official plugins, see this [list](https://github.com/orgs/headlamp-k8s/packages?tab=packages&q=headlamp-plugin).

You can thus deploy Headlamp with an init container, such as the [Flux UI plugin image](ghcr.io/headlamp-k8s/headlamp-plugin-flux:v0.3.0):

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: headlamp-with-flux
  labels:
    app: headlamp-with-flux
spec:
  selector:
    matchLabels:
      app: headlamp-with-flux
  template:
    metadata:
      labels:
        app: headlamp-with-flux
    spec:
      initContainers:
      - name: fetch-plugins
        image: ghcr.io/headlamp-k8s/headlamp-plugin-flux:latest
        # Copy the plugins
        command: ["/bin/sh", "-c"]
        args: ["cp -r /plugins/* /headlamp/plugins/ && ls -l /headlamp/plugins"]
        volumeMounts:
        - name: plugins
          mountPath: /headlamp/plugins
      containers:
      - name: headlamp
        image: ghcr.io/headlamp-k8s/headlamp:latest
        args: ["-plugins-dir=/headlamp/plugins"]
        ports:
        - containerPort: 4466
        volumeMounts:
        - name: plugins
          mountPath: /headlamp/plugins
      volumes:
      - name: plugins
        emptyDir: {}
```

## Creating a Plugin Image

The Headlamp official plugins repository has a [Dockerfile](https://github.com/headlamp-k8s/plugins/blob/main/Dockerfile) to generate an image for a plugin. Here is how to use it with the Kompose plugin:

```bash
# Get the plugins
git clone https://github.com/headlamp-k8s/plugins headlamp-plugins

# Move to the plugins directory
cd headlamp-plugins

# Build a container image for the kompose plugin
docker build --build-arg PLUGIN=kompose -t kompose-plugin:latest -f ./Dockerfile .
```

After this step you will have a `kompose-plugin:latest` image that you can use in your deployments, with the actual kompose plugin in its /plugins/kompose directory.
