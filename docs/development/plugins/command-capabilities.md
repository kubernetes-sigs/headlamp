---
title: Desktop Command Capabilities
sidebar_label: Desktop Commands
---

# Desktop Command Capabilities

Headlamp Desktop plugins can declare the local commands they need to run. The
desktop main process validates these declarations and issues an opaque capability
for each command scope. A plugin must present the matching capability whenever it
requests command execution.

This API is available only in Headlamp Desktop. Browser-based Headlamp deployments
cannot run local commands through this mechanism.

## Declaring Command Scopes

Add `runCommands` to the `headlamp` section of the plugin's `package.json`:

```json
{
  "name": "example-plugin",
  "headlamp": {
    "runCommands": [
      { "command": "kubectl", "args": ["get"] },
      { "command": "az", "args": ["account", "show"] }
    ]
  }
}
```

Each `args` array is an exact prefix. The first declaration permits commands such
as `kubectl get pods`, but not `kubectl delete pods`. Omitting `args` creates an
empty prefix and therefore permits any arguments for that executable. Keep scopes
as narrow as the plugin's behavior allows.

When a plugin has valid command declarations, Headlamp injects
`pluginRunCommand` into that plugin. Requests outside the declared scopes throw an
error in the renderer and are rejected again by the desktop main process.

## Threat Model

### Assets

The mechanism protects access to local command execution, the user's saved command
consent, plugin identity, and the opaque capabilities that authorize declared
command scopes.

### Trust Boundaries and Assumptions

- The Electron main process and preload script are trusted.
- Plugin manifests and command requests are treated as untrusted input and are
  validated by the main process.
- Installed plugin JavaScript runs in Headlamp's shared renderer context. Users
  must still install only plugins they trust; command capabilities are not a
  JavaScript sandbox.
- Executables are resolved using the desktop application's shell environment. The
  operating system, executable search path, and resolved binaries are trusted.

### Threats and Mitigations

| Threat                                                                                | Mitigation                                                                                                                                    |
| ------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| A plugin requests a command it did not declare.                                       | The renderer requires a matching command and argument prefix, and the main process independently checks the capability scope.                 |
| A plugin changes its requested scopes after loading.                                  | The main renderer can register scopes only once per main-frame load. Registrations come from package metadata before plugin code executes.    |
| Another renderer registers capabilities.                                              | The main process accepts registration only from the main window's `webContents`.                                                              |
| A plugin guesses or forges a capability.                                              | Capabilities are generated with 256 bits of cryptographic randomness and are validated only in the main process.                              |
| A capability is reused after a reload.                                                | Main-frame reload clears all registered scopes and allows a fresh registration with new capabilities.                                         |
| Malformed or excessive metadata consumes resources or bypasses validation.            | Plugin names, commands, arguments, registration counts, lengths, and forbidden values are bounded and validated. Invalid entries fail closed. |
| A plugin changes mutable renderer built-ins to intercept another plugin's capability. | Capability matching uses direct indexed access instead of dynamically dispatching through mutable array methods.                              |
| Spawn options change the meaning or I/O behavior of an otherwise matching command.    | Capability-authorized requests must provide an empty plain options object; the main process rejects every plugin-controlled spawn option.     |
| Shell syntax in an argument triggers an additional command.                           | Commands are spawned with `shell: false`, so arguments are passed directly to the executable.                                                 |
| Consent granted to one plugin is silently reused by another.                          | Manifest-declared command consent is keyed and displayed with the plugin package name.                                                        |

### Residual Risks and Non-Goals

- A malicious plugin still runs JavaScript in the shared renderer context and may
  attack renderer data or APIs outside this command mechanism.
- A permitted executable may provide powerful behavior. Reviewers must assess the
  complete argument prefix and the additional arguments it permits. An empty
  prefix grants access to all argument combinations for that executable.
- Capabilities authorize command scope, not the safety of command output, files,
  network access, credentials, or side effects.
- `shell: false` prevents shell interpretation but does not make a permitted
  command harmless.
- This mechanism does not protect a compromised Electron main process, preload
  script, operating system, executable search path, or resolved executable.

Plugin authors should request the narrowest practical scopes, and reviewers should
treat changes to `headlamp.runCommands` as security-sensitive.
