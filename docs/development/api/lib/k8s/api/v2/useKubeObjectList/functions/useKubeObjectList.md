# Function: useKubeObjectList()

```ts
function useKubeObjectList<K>(param: object): [K[] | null, ApiError | null] & QueryListResponse<(ListResponse<K> | undefined | null)[], K, ApiError>
```

Returns a combined list of Kubernetes objects and watches for changes from the clusters given.

## Type Parameters

| Type Parameter |
| ------ |
| `K` *extends* [`KubeObject`](../../../../KubeObject/classes/KubeObject.md)\<`any`\> |

## Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `param` | `object` | request paramaters |
| `param.kubeObjectClass` | (...`args`: `any`) => `K` & *typeof* [`KubeObject`](../../../../KubeObject/classes/KubeObject.md) | Class to instantiate the object with |
| `param.queryParams`? | [`QueryParameters`](../../../v1/queryParameters/interfaces/QueryParameters.md) | - |
| `param.refetchInterval`? | `number` | How often to refetch the list. Won't refetch by default. Disables watching if set. |
| `param.requests` | `object`[] | - |
| `param.watch`? | `boolean` | Watch for updates **Default** `true` |

## Returns

[`K`[] \| `null`, [`ApiError`](../../ApiError/classes/ApiError.md) \| `null`] & [`QueryListResponse`](../../hooks/interfaces/QueryListResponse.md)\<([`ListResponse`](../interfaces/ListResponse.md)\<`K`\> \| `undefined` \| `null`)[], `K`, [`ApiError`](../../ApiError/classes/ApiError.md)\>

Combined list of Kubernetes resources

## Defined in

[src/lib/k8s/api/v2/useKubeObjectList.ts:400](https://github.com/kubernetes-sigs/headlamp/blob/4f6ccb46282ab9a5d4439bf075672ad3d4cd1113/frontend/src/lib/k8s/api/v2/useKubeObjectList.ts#L400)
