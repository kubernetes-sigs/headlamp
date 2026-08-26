# Function: registerProjectApiResource()

```ts
function registerProjectApiResource(apiResource: ApiResource): void;
```

Defined in: [plugin/registry.tsx:1280](https://github.com/mishradwaterlaw/headlamp/blob/5944f5d61f18c73406d793336db6720caacb9130/frontend/src/plugin/registry.tsx#L1280)

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
