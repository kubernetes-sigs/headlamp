# @kinvolk/headlamp-plugin

The needed infrastructure for building Headlamp plugins.
Headlamp plugins depend on this package.

See the [Headlamp plugins documentation on the web](https://headlamp.dev/docs/latest/development/plugins/)

This package is published to the npm package index separately from Headlamp.

## Commands

```
headlamp-plugin --help

  headlamp-plugin.js build [package]        Build the plugin, or folder of
                                            plugins. <package> defaults to
                                            current working directory.
  headlamp-plugin.js start                  Watch for changes and build plugin.
  headlamp-plugin.js create <name>          Create a new plugin folder.
  headlamp-plugin.js extract                Copies folders of packages from plug
  <pluginPackages> <outputPlugins>          inPackages/packageName/dist/main.js
                                            to
                                            outputPlugins/packageName/main.js.
  headlamp-plugin.js package [pluginPath]   Creates a tarball of the plugin
  [outputDir]                               package in the format Headlamp
                                            expects.
  headlamp-plugin.js format [package]       format the plugin code with
                                            prettier. <package> defaults to
                                            current working directory. Can also
                                            be a folder of packages.
  headlamp-plugin.js lint [package]         Lint the plugin for coding issues
                                            with eslint. <package> defaults to
                                            current working directory. Can also
                                            be a folder of packages.
  headlamp-plugin.js tsc [package]          Type check the plugin for coding
                                            issues with tsc. <package> defaults
                                            to current working directory. Can
                                            also be a folder of packages.
  headlamp-plugin.js storybook [package]    Start storybook. <package> defaults
                                            to current working directory.
  headlamp-plugin.js storybook-build        Build static storybook. <package>
  [package]                                 defaults to current working
                                            directory. Can also be a folder of
                                            packages.
  headlamp-plugin.js upgrade [package]      Upgrade the plugin to latest
  <skip-package-updates>                    headlamp-plugin; audits, formats,
  <headlamp-plugin-version>                 lints and type checks.<package>
                                            defaults to current working
                                            directory. Can also be a folder of
                                            packages.
  headlamp-plugin.js test [package]         Test. <package> defaults to current
                                            working directory. Can also be a
                                            folder of packages.
  headlamp-plugin.js list                   List installed plugins.
  headlamp-plugin.js install [URL]          Install plugin(s) from a configuration
                                            file or a plugin Artifact Hub URL.
                                            Options:
                                                  --version          Show version number
                                              -c, --config           Path to plugin configuration file
                                                  --folderName       Name of the folder to install the plugin 
                                                  --headlampVersion  Version of headlamp to install the plugin 
                                              -q, --quiet            Do not print logs
                                              -w, --watch            Watch config file for changes and automatically
                                                                    reinstall plugins
  headlamp-plugin.js update [pluginName]    Update the plugin to the latest version.
  headlamp-plugin.js uninstall [pluginName] Uninstall the plugin.
```

## Template for installing plugins from a configuration file

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

## Development notes

### Generate types

`@kinvolk/headlamp-plugin` ships type declarations from the `frontend` module.
To generate the declarations, run `npm run build`.

### How to test local changes to headlamp-plugin

Developing headlamp-plugin itself? Want to test your changes?

#### Integration tests

See test-headlamp-plugin.js for some basic integration tests.

See test-headlamp-plugin-published.js for testing published packages.

#### linking to use local version of headlamp-plugin

Use your changes inside a plugin with an npm feature called linking:

1. Run `npm link` within the src/plugins/headlamp-plugins folder.
2. Create the plugin with link: `npx --yes @kinvolk/headlamp-plugin create myplugin --link`
3. Develop your plugin using your local headlamp-plugin changes.

This internally does a `npm link @kinvolk/headlamp-plugin`, so the development
version is linked rather than using a released version from npm.

Why is this needed? Whilst npx uses linked packages by default,
npm install requires that you first use `npm link packageName`. See the
[npm link docs](https://docs.npmjs.com/cli/v7/commands/npm-link)
for more info on npm link.

##### Testing "headlamp-plugin create" changes

For the "create" command npx and linking doesn't work. Instead, for this one command,
you can call the script directly.

```bash
cd plugins/headlamp-plugin
node ./bin/headlamp-plugin.js create myplugin --link
```

### Keep the dependencies in sync with the frontend/

Run `npm run update-dependencies` so the packages are kept up to date with there.

A lot of the packages are shared between the two, but some are not. See
dependencies-sync.js for lists of dependencies which are shared/not-shared.
You may need to update these lists when adding/removing packages.

Run `npm run check-dependencies` to see if frontend/package.json and
headlamp-plugin/package.json are synced. This is run in CI to make sure when dependencies
are changed, they are synced appropriately.

### Upgrading to an alpha release

You can try an alpha release for testing with the following command.

```bash
npx @kinvolk/headlamp-plugin@alpha upgrade --headlamp-plugin-version=alpha your-plugin-folder
```

### Making an alpha release of headlamp-plugin

You can bump the version to do a new alpha release like so:

```bash
cd plugins/headlamp-plugin
npm version preminor --preid=alpha
v0.6.0-alpha.0
```

Then to do another prerelease do...

```bash
npm version prerelease --preid=alpha
v0.6.0-alpha.1
```

To set the "alpha" tag when publishing do the following.

```bash
npm run build && npm run copy-package-lock && npm pack
npm publish kinvolk-headlamp-plugin-0.6.0-alpha.0.tgz --tag alpha
```

If you don't specify a tag, npm publish uses the "latest" tag.

## Relationship with @headlamp-k8s/pluginctl

`headlamp-plugin` is built on top of `pluginctl` and provides a superset of its functionality. While `pluginctl` focuses solely on plugin management operations, `headlamp-plugin` adds comprehensive development tooling:

- Plugin creation and scaffolding
- Development server with hot reloading
- Build and packaging tools
- Testing infrastructure with Storybook
- Code quality tools (linting, formatting, TypeScript)
- All plugin management features from pluginctl

Choose `headlamp-plugin` if you're developing plugins and need the full development toolchain, or `pluginctl` if you only need plugin management features.
