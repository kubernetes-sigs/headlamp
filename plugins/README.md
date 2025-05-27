# Plugins

## Quickstart for running an example plugin

To see "Pods: x" in the header of Headlamp run this example plugin:

```bash
cd plugins/examples/pod-counter
npm install
npm start
```

## Plugin documentation

See the [Headlamp plugins documentation on the web](https://headlamp.dev/docs/latest/development/plugins/)
or in this repo at
[../docs/development/plugins/](../docs/development/plugins/).

There you will see detailed API documentation, examples, and guides on how to develop plugins.

## The example plugins

| Folder                                                 | Description                                   |
| ------------------------------------------------------ | --------------------------------------------- |
| [examples/](examples)                                  | Examples folder.                              |
| [examples/app-menus](examples/app-menus)               | Add app window menus.                         |
| [examples/change-logo](examples/change-logo)           | Change the logo.                              |
| [examples/cluster-chooser](examples/cluster-chooser)   | Override default chooser button.              |
| [examples/custom-theme](examples/custom-theme)         | Add new custom theme.                         |
| [examples/details-view](examples/details-view)         | Custom sections and actions for detail views. |
| [examples/dynamic-clusters](examples/dynamic-clusters) | Update cluster configuration dynamically.     |
| [examples/pod-counter](examples/pod-counter)           | Display number of Pods in the title bar.      |
| [examples/sidebar](examples/sidebar)                   | Change the side bar menu.                     |
| [examples/tables](examples/tables)                     | Override the tables in list views.            |
| [examples/ui-panels](examples/ui-panels)               | Add custom side panels.                       |
| headlamp-plugin                                        | headlamp-plugin script which plugins use.     |
| headlamp-plugin/template                               | Template for new Headlamp plugins.            |

## Publishing Plugins

Headlamp provides tools to make publishing plugins easier:

### Building Plugins for Release

Use the `build-plugin-release.js` script to build both the OCI image and plugin tarball:

```bash
node plugins/build-plugin-release.js path/to/plugin
```

This will:
1. Build the plugin
2. Create a tarball of the plugin
3. Build an OCI image if the plugin has the `in-cluster` tag in its ArtifactHub configuration

### GitHub Action for Plugin Release

A GitHub workflow is available for releasing plugins. To use it:

1. Go to the Actions tab in your repository
2. Select the "Plugin Release" workflow
3. Click "Run workflow"
4. Enter the path to the plugin directory (relative to repo root)
5. Optionally specify an OCI registry to push to
6. Choose whether to update the ArtifactHub package file

The workflow will:
- Build the plugin
- Create a tarball
- Build and push an OCI image (if the plugin has the `in-cluster` tag)
- Create a GitHub release with the tarball
- Update the ArtifactHub package file (if selected)

### Updating ArtifactHub Package File

You can update the ArtifactHub package file manually using the `update-artifacthub.js` script:

```bash
node plugins/update-artifacthub.js path/to/plugin --registry=ghcr.io/headlamp-k8s
```

This will update the version in the artifacthub.yaml file and optionally update the repository URL.