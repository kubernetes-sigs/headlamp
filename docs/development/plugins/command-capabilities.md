---
title: Desktop Command Capabilities
sidebar_label: Desktop Commands
---

# Desktop Command Policy

Headlamp Desktop products can grant a known plugin permission to invoke a
local executable. The product build manifest is the only authority for these
grants. A plugin cannot obtain command access by changing its own package
metadata.

This API is unavailable to browser deployments. Development and user-installed
plugins receive it only when product policy names their exact origin and
identity.

## Product Manifest Policy

Declare reviewed grants in the top-level `runCommands` array in
`app-build-manifest.json`. Keeping command policy separate from the `plugins`
array allows a product to authorize a development or user-installed plugin
without declaring it as a bundled plugin:

```json
{
  "runCommands": [
    {
      "environment": "production",
      "pluginLocation": "user",
      "plugins": [
        {
          "bundleName": "example-plugin",
          "packageName": "@example/plugin",
          "artifactHubPackage": "example-repository/example-plugin"
        }
      ],
      "pluginExecutables": [
        {
          "tool": "examplectl"
        }
      ],
      "commands": [
        {
          "tool": "examplectl",
          "args": ["project", "list"],
          "allowTrailingArgs": true
        }
      ]
    }
  ]
}
```

`environment` selects development runs or production builds. `pluginLocation`
selects where the plugin must be installed: the `development`, `user`, or
`shipped` inventory. Each `plugins` entry pairs a bundle directory with its
expected `package.json` identity. All four selectors must match the discovered
plugin and the files independently inspected by the Electron main process. Use
separate policy entries when environments or installation locations need
different commands.

Production policies for `user` plugins must set
`artifactHubPackage` to the Artifact Hub `<repository>/<package>` path on every
`plugins` entry. This human-readable path identifies the package from which
Headlamp installed the managed plugin. Requiring the readable path makes policy
review practical: while that Artifact Hub repository exists, only its
maintainers can publish the named package, and a compromised maintainer could
publish a malicious update whether policy used the path or UUIDs. Headlamp
accepts the narrower residual risk that a deleted or renamed path could later be
reused by another publisher.

Policies may additionally pin `artifactHubPackageId` and
`artifactHubRepositoryId`. These UUIDs preserve identity if an Artifact Hub
repository or package is renamed, deleted, or its old path is later reused.
Providing both UUIDs is recommended for every production policy whose
`pluginLocation` is `user`. The build logs a warning when such a policy omits
them. When either UUID is supplied, both are required. Starting from the
plugin's Artifact Hub page at
`https://artifacthub.io/packages/headlamp/<repository>/<package>`, insert
`/api/v1` before `/packages` to request its metadata. For example, the Minikube
plugin page is
`https://artifacthub.io/packages/headlamp/headlamp-plugins/headlamp_minikube`,
so its metadata command is:

```console
curl https://artifacthub.io/api/v1/packages/headlamp/headlamp-plugins/headlamp_minikube \
  | jq '{artifactHubPackageId: .package_id, artifactHubRepositoryId: .repository.repository_id}'
```

To add these optional pins, copy `package_id` to `artifactHubPackageId` and
`repository.repository_id` to `artifactHubRepositoryId`. Use the IDs from the
exact package page being authorized. Shipped plugins do not need an Artifact
Hub path or UUIDs because their bytes are part of the trusted app build.
Plugins in the `development` location do not have plugin-manager installation
receipts, so Artifact Hub identity verification cannot work for them. They must
omit the Artifact Hub path and UUIDs even when the app environment is
`production`. Development-mode policies should also omit UUID pins because they
authorize development workflows rather than a packaged production trust
decision. The build warns when UUID pins are present in any of these policy
types.

JSON Schema Draft-07 cannot produce advisory diagnostics: a schema rule either
accepts or rejects a value. The manifest schema therefore suggests the UUID
fields through completion and explains these recommendations in editor hovers,
while the build tool provides context-aware warnings without rejecting custom
product manifests.

Commands resolve from the sanitized system `PATH` by default. To execute a
binary supplied by the plugin bundle, declare it in `pluginExecutables`. Each
entry names one command identifier, and Headlamp derives its bundle-relative
path as `bin/<tool>`. Headlamp never falls back between the plugin and system
origins. A missing, invalid, or undeclared plugin executable fails closed.
For managed-user plugins, the verified plugin-manager installation flow records
the executable integrity metadata. For shipped plugins, the packaging flow copies
only manifest-declared executables into the app's plugin inventory and records
their digests before the inventory is included in the packaged application. The
application package and its signing boundary establish provenance for these
shipped bytes. At runtime, non-development plugin executables are verified,
copied into an app-owned temporary directory, and rehashed before execution.

Headlamp's checked-in manifest provides production managed-plugin policies only
where Artifact Hub package paths are known. Development-only policies may also
support local plugin workflows. A product that selects another
manifest with `HEADLAMP_BUILD_MANIFEST` owns the complete policy and can replace
those defaults.

Each grant has these fields:

- `tool` is the executable identifier, without a path.
- `args` is a non-empty exact argument sequence or prefix. Every argument must
  contain at least one non-whitespace character.
- `allowTrailingArgs` defaults to `false`. Set it to `true` only when the tool
  may receive additional arguments after the reviewed prefix.

When several policies share grants, define each grant array once in the
top-level `commandSets` object. A policy can use `commandSets` instead of inline
`commands`; its named arrays are combined in listed order. For example:

```json
{
  "commandSets": {
    "examplectl-read": [{ "tool": "examplectl", "args": ["list"], "allowTrailingArgs": true }],
    "example-plugin-script": [{ "tool": "scriptjs", "args": ["example-plugin/run.js"] }]
  },
  "runCommands": [
    {
      "environment": "development",
      "pluginLocation": "development",
      "plugins": [{ "bundleName": "example-plugin", "packageName": "@example/plugin" }],
      "commandSets": ["examplectl-read", "example-plugin-script"]
    }
  ]
}
```

A policy must define exactly one of `commands` or `commandSets`. Named sets do
not broaden a policy by themselves; the expanded grants still apply only to
that policy's exact environment, location, and plugin identities.

`pluginExecutables` entries have these fields:

- `tool` must match at least one command grant in the same policy. Its path is
  always derived as `bin/<tool>`; paths and aliases cannot be authored.

Unknown fields, duplicate grants, empty argument prefixes, and malformed
values make the manifest invalid. Matching does not perform glob,
regular expression, substring, or shell expansion.

## Plugin API

Headlamp injects `pluginRunCommand` only when the product manifest grants the
verified plugin command access. The plugin passes the tool and arguments
at invocation time:

```ts
import type { PluginRunCommand } from '@kinvolk/headlamp-plugin/lib';

declare const pluginRunCommand: PluginRunCommand;

const process = pluginRunCommand('examplectl', ['project', 'list', '--output', 'json'], {});
```

The empty options object is intentional. Capability-authorized plugins cannot
supply process spawn options.

## Authorization and Consent

The Electron main process validates the opaque capability, renderer window,
plugin identity, tool, and argument policy immediately before process creation.
It stores the reviewed policy in the main process and never accepts grants from
the renderer.

Before plugin code executes, the trusted renderer hashes the exact fetched
`main.js` source it has cached. Electron independently hashes the corresponding
file in the verified bundle and issues a capability only when those digests
match. The cached bytes that execute are therefore the same source Electron
authorized, even if a writable plugin file changes during loading.

Authorization and user consent are separate decisions. Consent is requested only
after product authorization succeeds and is scoped to the plugin identity,
canonical tool, and reviewed argument prefix. Commands are executed directly
with `shell: false`.

For a managed plugin installation, Electron writes an app-owned installation
receipt outside plugin-controlled inventory. It records the canonical inventory
path and bundle directory, the Artifact Hub repository and package names, their
IDs, and the SHA-256 digest of every regular file in the bundle. Capability
registration verifies the installed location, expected repository and package
names, any pinned IDs, and all recorded files. Missing files, additional files,
symbolic links, digest changes, identity mismatches, and bundles copied to
another inventory fail closed. Package-local metadata is never used to prove
installation provenance because a pre-positioned bundle can rewrite it.

For `scriptjs`, Electron copies the receipt-matched script into a unique
app-owned directory and launches only those staged bytes. The copy is removed
after the child process terminates. This prevents a writable plugin bundle from
changing the script between verification and process creation.

For production execution, Electron records each downloaded executable's SHA-256
digest in the integrity metadata after the installer has verified and placed the
file. Electron hashes the executable again immediately before each process
starts and rejects missing or mismatched digests. It copies matching bytes into
a unique app-owned directory and starts the process from that verified copy, so
replacing the plugin-bundle path after hashing cannot change what is executed.
The copy is removed after the child process terminates. Updating a plugin
replaces its app-owned installation receipt; uninstalling removes it.

Managed plugins installed by a Headlamp release that did not record installation
integrity metadata must be updated or reinstalled before they can receive
production command capabilities. This includes Minikube executable and
`scriptjs` capabilities; Headlamp does not synthesize provenance for an existing
bundle from executable checksums alone.

Electron logs executable failures with the plugin package, bundle, installation
location, tool, and a stable reason such as `missing-receipt`,
`digest-mismatch`, or `missing-or-unsafe-executable`. Process creation failures
include the operating-system error code when one is available. Logs omit command
arguments, receipt digests, capability tokens, and full filesystem paths.

The development inventory permits a declared plugin executable without
installation integrity metadata, including when a packaged app selects a
production policy for a legacy development-inventory installation. The
executable must still be a regular, non-symbolic-link file at the declared path
and resolve inside the verified plugin bundle. This exception supports locally
developed and legacy plugins such as Minikube. It does not apply to the `user`
inventory, whose plugins must have plugin-manager installation receipts for
production capabilities.

The manifest does not have a `capabilities` wrapper. Internally, Headlamp still
uses an opaque, short-lived capability token to avoid exposing product policy to
plugin code or trusting a plugin identity on every invocation. Tokens are
regenerated after a main-frame reload and revoked when the window closes. A
token from another plugin, another window, or a previous load is rejected before
a process is created.

## Security Considerations

Reviewers should treat every command grant as security-sensitive. A permitted
executable can still read files, use credentials, access the network, or change
the system. Use the narrowest argument prefix that supports the plugin behavior
and avoid enabling trailing arguments unless they are required.

Declaring a plugin executable additionally trusts native code installed with
that plugin. Use system resolution unless the plugin intentionally owns and
installs the executable.

The `development` inventory is an explicit trust boundary. Headlamp assumes
that anyone able to place or replace plugins in `defaultPluginsDir()` is an
authorized local operator and is already trusted to supply development plugin
code. Protecting this operator-controlled directory from a same-user process or
from someone with equivalent filesystem permissions is outside this mechanism's
threat model. Consequently, development-inventory policies do not require or
attempt Artifact Hub provenance verification, because those plugins were not
installed by the plugin manager and have no installer-authenticated receipt.

This trust assumption does not bypass command policy. Electron still requires
the product manifest to name the exact environment, development location,
bundle directory, package name, executable origin, command, and argument
prefix. It independently checks path containment, rejects symbolic links,
confirms `package.json.name`, applies user consent, and confines plugin-owned
executables before process creation. Products that do not trust the development
inventory must omit production policies for that location or ensure the
directory is protected according to their deployment model.

This mechanism controls local command execution. It is not a JavaScript sandbox
for plugins running in the shared renderer.
