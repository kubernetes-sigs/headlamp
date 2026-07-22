# Function: useKubeObjectList()

```ts
function useKubeObjectList<K>(param: object): [K[] | null, ApiError | null] & QueryListResponse<(
  | ListResponse<K>
  | null
| undefined)[], K, ApiError>;
```

Defined in: [lib/k8s/api/v2/useKubeObjectList.ts:418](https://github.com/SaikiaMan/headlamp/blob/ee95cceb66fcc81536dc274d41f70372e38b6d87/frontend/src/lib/k8s/api/v2/useKubeObjectList.ts#L418)

Returns a combined list of Kubernetes objects and watches for changes from the clusters given.

## Type Parameters

| Type Parameter |
| ------ |
| `K` *extends* [`KubeObject`](../../../../KubeObject/classes/KubeObject.md)\<`any`\> |

## Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `param` | \{ `kubeObjectClass`: (...`args`: `any`) => `K` & *typeof* [`KubeObject`](../../../../KubeObject/classes/KubeObject.md); `queryParams?`: [`QueryParameters`](../../../v1/queryParameters/interfaces/QueryParameters.md); `refetchInterval?`: `number`; `requests`: `object`[]; `watch?`: `boolean`; \} | request paramaters |
| `param.kubeObjectClass` | (...`args`: `any`) => `K` & *typeof* [`KubeObject`](../../../../KubeObject/classes/KubeObject.md) | Class to instantiate the object with |
| `param.queryParams?` | [`QueryParameters`](../../../v1/queryParameters/interfaces/QueryParameters.md) | - |
| `param.refetchInterval?` | `number` | How often to refetch the list. Won't refetch by default. Disables watching if set. |
| `param.requests` | `object`[] | - |
| `param.watch?` | `boolean` | Watch for updates **Default** `true` |

## Returns

\[`K`[] \| `null`, [`ApiError`](../../ApiError/classes/ApiError.md) \| `null`\] & [`QueryListResponse`](../../hooks/interfaces/QueryListResponse.md)\<(
  \| [`ListResponse`](../interfaces/ListResponse.md)\<`K`\>
  \| `null`
  \| `undefined`)[], `K`, [`ApiError`](../../ApiError/classes/ApiError.md)\>

Combined list of Kubernetes resources
