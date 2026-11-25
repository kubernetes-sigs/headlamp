# @headlamp-k8s/pluginctl

A lightweight CLI tool for managing Headlamp plugins.

## Purpose

This package provides a minimal, focused tool for managing Headlamp plugins. It's ideal for:
- Installing plugins from ArtifactHub
- Managing plugin configurations
- Performing bulk plugin operations via configuration files

## Usage

```bash
pluginctl.js <command>

Commands:
  pluginctl.js extract <pluginPackages>     Copies folders of packages from plug
  <outputPlugins>                           inPackages/packageName/dist/main.js
                                            to
                                            outputPlugins/packageName/main.js.
  pluginctl.js package [pluginPath]         Creates a tarball of the plugin
  [outputDir]                               package in the format Headlamp
                                            expects.
  pluginctl.js install [URL]                Install plugin(s) from a
                                            configuration file or a plugin
                                            artifact Hub URL
  pluginctl.js update <pluginName>          Update a plugin to the latest
                                            version
  pluginctl.js uninstall <pluginName>       Uninstall a plugin
  pluginctl.js list                         List installed plugins

Options:
  --version  Show version number                                       [boolean]
  --help     Show help                                                 [boolean]
```

## Configuration File Format

plugins.yaml:

```yaml
plugins:
  - name: my-plugin
    source: https://artifacthub.io/packages/headlamp/test-123/my-plugin
    version: 1.0.0
  - name: another-plugin
    source: https://artifacthub.io/packages/headlamp/test-123/another-plugin
    dependencies:
      - my-plugin
installOptions:
  parallel: true
  maxConcurrent: 3
```

Dependencies refer to plugin `name` values in the same configuration. Unknown
names and dependency cycles are rejected before installation starts. Configuration
order does not need to match dependency order: prerequisites finish before their
dependents are attempted in both sequential and parallel mode. A failed or skipped
prerequisite causes its dependents to be skipped; independent plugins can continue.
Parallel mode runs up to `maxConcurrent` dependency-ready plugins per batch.

## Available Classes

The package exports the following classes for programmatic use:

- `PluginManager`: Core class for managing individual plugins
- `MultiPluginManager`: Class for handling multiple plugins and their dependencies

Example usage:

```javascript
const { PluginManager, MultiPluginManager } = require('@headlamp-k8s/pluginctl');

// Create a plugin manager instance
const manager = new PluginManager();

// Create a multi-plugin manager for handling multiple plugins
const multiManager = new MultiPluginManager();
```

## Testing and statement coverage

From this directory:

```bash
npm ci
npm run test:unit -- --runInBand
npm run test:cli
npm run test:coverage
```

`test:cli` runs isolated real-process tests for extraction, packaging/checksums,
argument validation, listing, and removal. Fixtures use temporary directories and
do not require network access, a global npm link, or an installed Headlamp app.

`test:coverage` combines the existing Jest unit suite, those CLI tests, and the
existing `src/plugin-management.e2e.js` install/update/uninstall workflow. The unit
suite and that existing workflow **require access to Artifact Hub and its plugin
archive host**; this is not an offline or deterministic-network test command.
The update fixture downgrades its recorded version so the update actually runs.
The older `npm test`/`test-pluginctl.js` global-link workflow is not invoked.

The report covers the package entrypoint (`index.js`), CLI (`bin/**/*.js`), and
implementation (`src/**/*.js`), excluding test files. All four production files
remain in the denominator, even if unexecuted. Istanbul coverage from Jest and
instrumented CLI subprocesses is merged by source location, not by averaging
percentages. Production code and existing test behavior are not excluded to
improve the score.

Reports are written to `coverage/index.html`, `coverage/coverage-final.json`, and
`coverage/coverage-summary.json`. Unit-only counters are retained in
`coverage/unit/`. The command removes its previous `coverage/` output before
running and exits unsuccessfully if any suite fails; a partial run is not reported
as success.

## Using npm link for Development

To test your local changes to `pluginctl` in other packages:

1. Create a global symlink:
```bash
cd plugins/pluginctl
npm link
```

2. In the project where you want to use the local version:
```bash
npm link @headlamp-k8s/pluginctl
```

This will create a symlink to your local development version instead of using the published package. This is useful for:
- Testing changes before publishing
- Debugging issues
- Developing features that require changes in both packages

To unlink:
```bash
npm unlink @headlamp-k8s/pluginctl
```

## Relationship with @kinvolk/headlamp-plugin

`pluginctl` is a minimal tool focused solely on plugin management operations. It provides the core functionality for:
- Installing plugins
- Updating plugins
- Removing plugins
- Listing installed plugins

In contrast, `@kinvolk/headlamp-plugin` is a comprehensive package that includes:
- All plugin management features from pluginctl
- Plugin development tools
- Build and testing infrastructure
- Code quality tools

Choose `pluginctl` if you only need plugin management features, or `headlamp-plugin` if you need the full development toolkit. 