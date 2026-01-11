# Function: useWatchKubeObjectLists()

```ts
function useWatchKubeObjectLists<K>(__namedParameters: object): void
```

Accepts a list of lists to watch.
Upon receiving update it will modify query data for list query

## Type Parameters

| Type Parameter |
| ------ |
| `K` *extends* [`KubeObject`](../../../../KubeObject/classes/KubeObject.md)\<`any`\> |

## Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `__namedParameters` | `object` | - |
| `__namedParameters.endpoint`? | `null` \| [`KubeObjectEndpoint`](../../KubeObjectEndpoint/interfaces/KubeObjectEndpoint.md) | Kube resource API endpoint information |
| `__namedParameters.kubeObjectClass` | (...`args`: `any`) => `K` & *typeof* [`KubeObject`](../../../../KubeObject/classes/KubeObject.md) | KubeObject class of the watched resource list |
| `__namedParameters.lists` | `object`[] | Which clusters and namespaces to watch |
| `__namedParameters.queryParams`? | [`QueryParameters`](../../../v1/queryParameters/interfaces/QueryParameters.md) | Query parameters for the WebSocket connection URL |

## Returns

`void`

## Defined in

[src/lib/k8s/api/v2/useKubeObjectList.ts:128](https://github.com/kubernetes-sigs/headlamp/blob/4f6ccb46282ab9a5d4439bf075672ad3d4cd1113/frontend/src/lib/k8s/api/v2/useKubeObjectList.ts#L128)
