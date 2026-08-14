# Function: useKubeList()

```ts
function useKubeList<K>(kubeClass: (...args: any) => K & typeof KubeObject, opts?: object & QueryParameters): [K[] | null, ApiError | null] & QueryListResponse<(
  | ListResponse<K>
  | null
| undefined)[], K, ApiError>;
```

Defined in: [lib/k8s/hooks.ts:125](https://github.com/mishradwaterlaw/headlamp/blob/fa170d1f3805256c3d561c39c317801d0e2be4b3/frontend/src/lib/k8s/hooks.ts#L125)

Standalone hook equivalent of KubeObject.useList.

Fetches and watches a list of resources using the v2 API (react-query + WebSocket).
Supports multi-cluster and multi-namespace fetching.

## Type Parameters

| Type Parameter |
| ------ |
| `K` *extends* [`KubeObject`](../../KubeObject/classes/KubeObject.md)\<`any`\> |

## Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `kubeClass` | (...`args`: `any`) => `K` & *typeof* [`KubeObject`](../../KubeObject/classes/KubeObject.md) | The KubeObject subclass to list. |
| `opts` | `object` & [`QueryParameters`](../../api/v1/queryParameters/interfaces/QueryParameters.md) | Options including cluster, namespace, refetchInterval, and query params. |

## Returns

\[`K`[] \| `null`, [`ApiError`](../../api/v2/ApiError/classes/ApiError.md) \| `null`\] & [`QueryListResponse`](../../api/v2/hooks/interfaces/QueryListResponse.md)\<(
  \| [`ListResponse`](../../api/v2/useKubeObjectList/interfaces/ListResponse.md)\<`K`\>
  \| `null`
  \| `undefined`)[], `K`, [`ApiError`](../../api/v2/ApiError/classes/ApiError.md)\>
