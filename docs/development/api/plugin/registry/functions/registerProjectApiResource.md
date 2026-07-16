# Function: registerProjectApiResource()

```ts
function registerProjectApiResource(apiResource: ApiResource): void;
```

Defined in: [plugin/registry.tsx:1229](https://github.com/SaikiaMan/headlamp/blob/ee95cceb66fcc81536dc274d41f70372e38b6d87/frontend/src/plugin/registry.tsx#L1229)

Register a custom API resource to be included in Project resource fetching.

This allows plugins to extend the default list of resources that Projects
track, enabling CRD-based resources to appear in project resource counts,
health status, and the Resources tab.

Only namespaced resources should be registered, as Projects are scoped to namespaces.

## Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `apiResource` | [`ApiResource`](../../../lib/k8s/api/v2/ApiResource/interfaces/ApiResource.md) | The API resource definition to register. Must include apiVersion, version, pluralName, singularName, kind, and isNamespaced. |

## Returns

`void`

## Example

```tsx
registerProjectApiResource({
  apiVersion: 'argoproj.io/v1alpha1',
  version: 'v1alpha1',
  groupName: 'argoproj.io',
  pluralName: 'applications',
  singularName: 'application',
  kind: 'Application',
  isNamespaced: true,
});
```

## Note

If the total number of watched resources (defaults + plugin-registered)
  grows too large, the fetch strategy may fall back from watch to polling.
  Register only resources that are needed for project health/status.
