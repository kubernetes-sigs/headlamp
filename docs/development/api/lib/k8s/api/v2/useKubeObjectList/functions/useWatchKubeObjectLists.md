# Function: useWatchKubeObjectLists()

```ts
function useWatchKubeObjectLists<K>(__namedParameters: object): void;
```

Defined in: [lib/k8s/api/v2/useKubeObjectList.ts:130](https://github.com/SaikiaMan/headlamp/blob/ee95cceb66fcc81536dc274d41f70372e38b6d87/frontend/src/lib/k8s/api/v2/useKubeObjectList.ts#L130)

Accepts a list of lists to watch.
Upon receiving update it will modify query data for list query

## Type Parameters

| Type Parameter |
| ------ |
| `K` *extends* [`KubeObject`](../../../../KubeObject/classes/KubeObject.md)\<`any`\> |

## Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `__namedParameters` | \{ `endpoint?`: \| [`KubeObjectEndpoint`](../../KubeObjectEndpoint/interfaces/KubeObjectEndpoint.md) \| `null`; `kubeObjectClass`: (...`args`: `any`) => `K` & *typeof* [`KubeObject`](../../../../KubeObject/classes/KubeObject.md); `lists`: `object`[]; `queryParams?`: [`QueryParameters`](../../../v1/queryParameters/interfaces/QueryParameters.md); \} | - |
| `__namedParameters.endpoint?` | \| [`KubeObjectEndpoint`](../../KubeObjectEndpoint/interfaces/KubeObjectEndpoint.md) \| `null` | Kube resource API endpoint information |
| `__namedParameters.kubeObjectClass` | (...`args`: `any`) => `K` & *typeof* [`KubeObject`](../../../../KubeObject/classes/KubeObject.md) | KubeObject class of the watched resource list |
| `__namedParameters.lists` | `object`[] | Which clusters and namespaces to watch |
| `__namedParameters.queryParams?` | [`QueryParameters`](../../../v1/queryParameters/interfaces/QueryParameters.md) | Query parameters for the WebSocket connection URL |

## Returns

`void`
