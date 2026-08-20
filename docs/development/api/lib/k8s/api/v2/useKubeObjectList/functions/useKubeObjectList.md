# Function: useKubeObjectList()

```ts
function useKubeObjectList<K>(param: object): [K[] | null, ApiError | null] & QueryListResponse<(
  | ListResponse<K>
  | null
| undefined)[], K, ApiError>;
```

Defined in: [lib/k8s/api/v2/useKubeObjectList.ts:524](https://github.com/kehach07/headlamp/blob/7b4a853c98ea719589ddb64289f86ea94e08b877/frontend/src/lib/k8s/api/v2/useKubeObjectList.ts#L524)

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
