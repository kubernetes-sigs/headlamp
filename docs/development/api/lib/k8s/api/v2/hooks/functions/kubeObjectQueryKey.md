# Function: kubeObjectQueryKey()

```ts
function kubeObjectQueryKey(__namedParameters: object): (
  | string
  | QueryParameters
  | KubeObjectEndpoint
  | null
  | undefined)[];
```

Defined in: [lib/k8s/api/v2/hooks.ts:91](https://github.com/Rucha0901/headlamp/blob/db946f8d81732ed8fbecf4752fa84b86cab70c8b/frontend/src/lib/k8s/api/v2/hooks.ts#L91)

## Parameters

| Parameter | Type |
| ------ | ------ |
| `__namedParameters` | \{ `cluster`: `string`; `endpoint?`: \| [`KubeObjectEndpoint`](../../KubeObjectEndpoint/interfaces/KubeObjectEndpoint.md) \| `null`; `name`: `string`; `namespace?`: `string`; `queryParams?`: [`QueryParameters`](../../../v1/queryParameters/interfaces/QueryParameters.md); \} |
| `__namedParameters.cluster` | `string` |
| `__namedParameters.endpoint?` | \| [`KubeObjectEndpoint`](../../KubeObjectEndpoint/interfaces/KubeObjectEndpoint.md) \| `null` |
| `__namedParameters.name` | `string` |
| `__namedParameters.namespace?` | `string` |
| `__namedParameters.queryParams?` | [`QueryParameters`](../../../v1/queryParameters/interfaces/QueryParameters.md) |

## Returns

(
  \| `string`
  \| [`QueryParameters`](../../../v1/queryParameters/interfaces/QueryParameters.md)
  \| [`KubeObjectEndpoint`](../../KubeObjectEndpoint/interfaces/KubeObjectEndpoint.md)
  \| `null`
  \| `undefined`)[]
