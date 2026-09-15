# Example Plugin: Secure Storage

This desktop-only example stores a sample credential with Electron
`safeStorage`, loads it again, and deletes it. Headlamp isolates the value in the
example plugin's trusted installation namespace, so another plugin cannot select
that namespace by name.

To run the plugin:

```bash
cd plugins/examples/secure-storage
npm install
npm start
```

Open **Secure Storage** in the Headlamp home sidebar. The example does not
register its route when Headlamp runs as a web application because
`pluginSecureStorage` is available only in the desktop app.

Do not use the example value as a Kubernetes Secret. This API stores local
application credentials on the computer running Headlamp; it does not create or
synchronize Kubernetes resources.

The main code is in [src/index.tsx](src/index.tsx). See the
[plugin functionality documentation](../../../docs/development/plugins/functionality/index.md#secure-storage)
for the API contract and security model.
