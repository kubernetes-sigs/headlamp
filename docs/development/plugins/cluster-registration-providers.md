---
title: Desktop Cluster Registration Providers
---

# Desktop Cluster Registration Providers

Desktop cluster registration lets an authorized plugin ask Electron to obtain
credentials and merge them into the user's kubeconfig. The bridge is
provider-neutral: plugins call `registerCluster(provider, options)`, while the
main process selects a `ClusterRegistrationProvider` by its stable `id` and
validates the provider-defined options before executing native code.

This is a desktop product integration point, not a general browser-plugin API.
The plugin loader injects `registerCluster` as a private lexical function only
into plugins whose package identity and installation source are explicitly
trusted by the product. User-installed plugins must not receive it.

## Provider contract

Providers are defined in
`app/electron/cluster-registration.ts`:

```ts
interface ClusterRegistrationProvider<TOptions> {
  id: string;
  validateOptions(options: unknown): options is TOptions;
  register(
    options: TOptions,
    runtime: ClusterRegistrationRuntime
  ): Promise<ClusterRegistrationResult>;
}
```

The built-in `azure` provider demonstrates the complete flow for managed AKS,
managed namespaces, and Arc-connected clusters. It validates all renderer
input, launches Azure CLI without a shell, converts kubelogin authentication,
rejects unsafe kubeconfig identity collisions, and replaces the destination
through a private sibling file and atomic rename. POSIX directory sync is
best-effort after the replacement becomes visible.

## Adding a provider

1. Define a narrow options interface containing only the values native code
   requires.
2. Implement a type guard for all untrusted option fields. Reject unknown enum
   values, empty identifiers, and values containing shell metacharacters when a
   native tool has stricter naming rules.
3. Implement `ClusterRegistrationProvider`. Launch commands without a shell and
   pass dynamic values as individual arguments. Alternatively, retrieve a
   kubeconfig through a provider SDK or a trusted Kubernetes API client.
4. Keep generated credentials in a `0700` temporary directory. Merge them with
   `mergeKubeconfig`, persist with `writeKubeconfigAtomically`, and remove all
   temporary credentials in `finally`. On Windows, apply an owner-only ACL with
   `enforcePrivateDirectoryPermissions` or `enforcePrivateFilePermissions`;
   POSIX mode arguments do not create a Windows ACL.
5. Add the provider implementation to `clusterRegistrationProviders` in
   `app/electron/cluster-registration.ts`.
6. In the consumer product manifest, add `clusterRegistrationProviders` to the
   exact `runCommands` policy that already identifies the provider plugin by
   bundle, package, source inventory, and optional Artifact Hub provenance.
   Set `id` to the public provider ID, `type` to the built-in implementation,
   and map each provider tool role to an `external-tools` ID. The runtime
   resolves only the current platform's verified external-tool paths. Never
   hard-code a consumer package name, provider grant, or packaged tool layout
   in Headlamp's plugin loader.

```json
{
  "external-tools": [
    {
      "id": "cloudctl",
      "platforms": {
        "linux": {
          "path": "external-tools/cloudctl/linux/cloudctl",
          "sha256": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
        },
        "darwin": {
          "path": "external-tools/cloudctl/darwin/cloudctl",
          "sha256": "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"
        },
        "win32": {
          "path": "external-tools/cloudctl/win32/cloudctl.exe",
          "sha256": "cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc"
        }
      }
    }
  ],
  "runCommands": [
    {
      "environment": "production",
      "pluginLocation": "shipped",
      "plugins": [{ "bundleName": "cloud-plugin", "packageName": "@example/cloud-plugin" }],
      "commands": [{ "tool": "cloudctl", "args": ["account"] }],
      "clusterRegistrationProviders": [
        {
          "id": "example",
          "type": "example",
          "tools": { "cli": "cloudctl" }
        }
      ]
    }
  ]
}
```

Product builds must declare the referenced IDs in `external-tools` with a
relative path and SHA-256 digest for each supported platform. The product's
build tooling should generate these records from staged files.

7. In the trusted plugin, call the injected function with the provider ID and
   validated provider options:

```ts
declare const registerCluster:
  | ((
      provider: string,
      options: unknown
    ) => Promise<{
      success: boolean;
      message: string;
    }>)
  | undefined;

await registerCluster?.('example', {
  clusterName: 'production',
  location: 'region-1',
});
```

8. Add tests for option validation, exact command arguments, successful
   registration, authentication conversion, malformed destination preservation,
   identity collisions, private permissions, temporary cleanup, atomic-write
   failure, and trusted versus untrusted plugin injection.

## Realistic provider examples

These examples describe plausible extensions; they are not currently
implemented by Headlamp.

### Amazon EKS

An `eks` provider could accept `clusterName`, `region`, and optional `profile` or
`roleArn` fields. Its native implementation could invoke:

```text
aws eks update-kubeconfig --name <cluster> --region <region> --kubeconfig <temporary-file>
```

The provider should use an `aws` tool role mapped by the consumer to a verified
external-tool ID, or an SDK, validate profile and
role identifiers, keep `KUBECONFIG` isolated from the user's destination during
retrieval, then use the shared collision checks and atomic writer.

### Google Kubernetes Engine

A `gke` provider could accept `project`, `location`, `clusterName`, and an
`isRegional` discriminator. It could run `gcloud container clusters
get-credentials` with an isolated temporary `KUBECONFIG`, then merge the
resulting cluster, context, and auth-plugin user entries. The product maps
`gcloud` and any required authentication helper roles to its own verified
external-tool IDs.

### Cluster API

A `cluster-api` provider need not launch a cloud CLI. It could accept a
management-cluster context, namespace, and workload-cluster name, then retrieve
the `<cluster>-kubeconfig` Secret through a trusted backend or Kubernetes client.
The provider would validate the Secret type and key, decode its kubeconfig, and
use the same merge and atomic-write protections. Authorization must bind the
injected capability to the product plugin that owns this workflow.

Other viable providers include local development clusters such as kind or
minikube, and vendor-managed Kubernetes products that expose kubeconfig through
an authenticated SDK. Each should remain a separate provider with its own
validated options and tests rather than adding provider-specific branches to the
generic IPC handler.

## Security requirements

- Treat provider IDs and options as untrusted renderer input.
- Bind the opaque capability to an attested product plugin; a main-frame check
  alone is insufficient because plugins share the renderer global scope.
- Keep plugin identities, provider grants, and packaged tool paths in the
  consumer product manifest rather than Headlamp source.
- Do not expose provider secrets or raw IPC functions through the plugin library.
- Avoid shell interpolation and redact credentials from errors and logs.
- Reject cluster, context, or user collisions that would redirect preserved
  kubeconfig entries.
- Collision-check every file in the `KUBECONFIG` search path, even when only
  the first file is selected as the writable destination.
- Preserve the existing kubeconfig on failures before atomic replacement. A
  post-replacement POSIX directory-sync failure is logged as a durability
  warning while the visible replacement remains successful.
- Enforce owner-only permissions for temporary and destination credentials.
