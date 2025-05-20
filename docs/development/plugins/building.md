---
title: Building and Shipping Plugins
sidebar_label: Building & Shipping
---

This section explains how to start developing a Headlamp plugin and how
to ship it once finished.

## Creating a new plugin

This is how to start a new plugin:

```bash
npx --yes @kinvolk/headlamp-plugin create headlamp-myfancy
cd headlamp-myfancy
npm run start
```

There's some basic code inside src/index.tsx.

Now run Headlamp (the desktop app or the
[development version](../index.md#run-the-code)),
and your plugin should be loaded.

Using the above commands means that Headlamp will **automatically reload**
whenever to make a change to the plugin.

ℹ️ This automatic reload does not happen when running in-cluster,
even if the plugins folder is changed. I.e., if you want to serve
updated plugins, you need to restart the server.

## Code Formatting, Linting, and Type Checking

Your plugin has a few tools built in to help make development easier.

#### Format code with prettier

```bash
npm run format
```

#### Find code lint issues with eslint

```bash
npm run lint
```

Eslint also allows you to try and automatically fix issues.

```bash
npm run lint-fix
```

#### Run the type checker

```bash
npm run tsc
```

#### Run the tests

```bash
npm run test
```

## Building for production

To build the previous plugin example for production, run the following
command:

```bash
cd headlamp-myfancy
npm install
npm run build
```

This will create a file with the bundled plugin in
`headlamp-myfancy/dist/main.js`.

### Building a folder of packages at once

For convienience the `headlamp-plugin build` command can build a
package or folder of packages.

```bash
npx @kinvolk/headlamp-plugin build myplugins/headlamp-myfancy
npx @kinvolk/headlamp-plugin build myplugins
```

## Shipping and Deploying Plugins

Once a plugin is ready to be shipped (built for production), it needs to
be placed in a "plugins directory" for Headlamp to load it.

For example, if we have built 3 plugins called MyPlugin1, MyPlugin2, and
MyPlugin3, they should be added to a directory in the following structure:

```
.plugins/
  MyPlugin1/
    main.js
  MyPlugin2/
    main.js
  MyPlugin3/
    main.js
```

If our plugins are placed in `myplugins`, we can conveniently create that
folder with the following command:

```bash
npx @kinvolk/headlamp-plugin extract ./myplugins /path/to/.plugins
```

This also works individually (for each plugin):

```bash
npx @kinvolk/headlamp-plugin extract ./myplugins/MyPlugin1 /path/to/./plugins
```

### In-cluster deployment with plugins

For in-cluster Headlamp deployments, when running Headlamp's server,
the `-plugin-dir` option should point to the directory:

```bash
./headlamp-server -plugins-dir=.plugins
```

### Using plugins on the desktop version

The Headlamp desktop app will look for the plugins directory (in the format
mentioned above). This will be either under the user's Headlamp configuration folder
or within the current folder as `.plugins` if the former doesn't exist.

### Bundling plugins with desktop version

To build a Headlamp app with a set of plugins, first extract some plugins
into the .plugins folder in the root of the "headlamp" repo.

```bash
cd plugins/examples/pod-counter
npm install
npm run build
cd ../..

mkdir .plugins
npx @kinvolk/headlamp-plugin extract ./plugins/examples/ ./.plugins
ls -la .plugins
make app-linux
```

For more on how to extract files into there see "Shipping and Deploying Plugins" above.

### More on making a headlamp container image including plugins

See the blog post
"[Get up to speed deploying Headlamp with plugins](https://headlamp.dev/blog/2022/10/20/best-practices-for-deploying-headlamp-with-plugins)"
for more information on building a container image with your plugins.

## Writing storybook stories

What is a storybook story?

From <https://storybook.js.org/docs/web-components/get-started/introduction>

> Storybook is a tool for UI development. It makes development faster and
> easier by isolating components. This allows you to work on one component
> at a time. You can develop entire UIs without needing to start up a
> complex dev stack, force certain data into your database,
> or navigate around your application.

See an example in your browser:

```bash
$ cd plugins/examples/pod-counter
$ ls src
headlamp-plugin.d.ts  index.tsx  Message.stories.tsx  Message.tsx
$ npm install
$ npm run storybook
```

Your browser should open and show you a Message component with three
different states the component can be in.

Note that there is a Message.stories.tsx to go along with the Message.tsx
which has the `<Message>` component defined within it. See that file for an
example of how to write a story.

### Snapshot testing

Another benefit of writing storybook stories is that they can act as
unit tests for regression testing. Storyshots will save snapshots
of html for the different states that a component can be in. See the
[Snapshot tests](https://storybook.js.org/docs/react/writing-tests/snapshot-testing)
guide in the storybook documentation for more information.

This is in addition to the benefit of making sure your components can be
manually tested and developed quickly in isolation.

See the [storybook documentation](https://storybook.js.org/docs/) for full
details on storybook.

## Running tests on a github action

A workflow for testing your plugin on github with actions.

Below is based on the [Building and testing Node.js](https://docs.github.com/en/actions/automating-builds-and-tests/building-and-testing-nodejs) docs from GitHub.

Place this in a file named something like `.github/workflows/headlamp-plugin-github-workflow.yaml` in the root of your repo.

```yaml
name: Headlamp plugin linting, type checking, and testing

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  build:
    runs-on: ubuntu-latest

    defaults:
      run:
        working-directory: ./your-folder-of-plugins

    strategy:
      matrix:
        node-version: [18.x]

    steps:
      - uses: actions/checkout@v4
      - name: Use Node.js ${{ matrix.node-version }}
        uses: actions/setup-node@v3
        with:
          node-version: ${{ matrix.node-version }}
      - run: npx @kinvolk/headlamp-plugin lint .
      - run: npx @kinvolk/headlamp-plugin format --check .
      - run: npx @kinvolk/headlamp-plugin tsc .
      - run: npx @kinvolk/headlamp-plugin test .
      - run: npx @kinvolk/headlamp-plugin build .
```

Please see the GitHub documentation for further details on workflows and actions.

## Upgrading package

There's a command that handles much of the upgrading of plugins to the latest headlamp-plugin version. This upgrade command also audits packages, formats code, lints, and type checks.

Additionally, this handles some code changes needed for plugins. For example, it handles running the material-ui 4 to mui 5 'codemod' code changes and creates missing configuration added in different versions of headlamp-plugin.

Testing is necessary after running the upgrade command.
Of course, make sure you have a backup of your plugin folder before running it.

```bash
npx @kinvolk/headlamp-plugin upgrade --headlamp-plugin-version=latest your-plugin-folder
```
