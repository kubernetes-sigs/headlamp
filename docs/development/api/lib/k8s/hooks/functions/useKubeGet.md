# Function: useKubeGet()

```ts
function useKubeGet<K>(
   kubeClass: (...args: any) => K & typeof KubeObject, 
   name: string, 
   namespace?: string, 
opts?: object): [K | null, ApiError | null] & QueryResponse<K, ApiError>;
```

Defined in: [lib/k8s/hooks.ts:182](https://github.com/mishradwaterlaw/headlamp/blob/fa170d1f3805256c3d561c39c317801d0e2be4b3/frontend/src/lib/k8s/hooks.ts#L182)

Standalone hook equivalent of KubeObject.useGet.

Fetches a single resource by name (and optionally namespace) using the v2 API.

## Type Parameters

| Type Parameter |
| ------ |
| `K` *extends* [`KubeObject`](../../KubeObject/classes/KubeObject.md)\<`any`\> |

## Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `kubeClass` | (...`args`: `any`) => `K` & *typeof* [`KubeObject`](../../KubeObject/classes/KubeObject.md) | The KubeObject subclass to fetch. |
| `name` | `string` | Name of the resource. |
| `namespace?` | `string` | Namespace of the resource (for namespaced resources). |
| `opts?` | \{ `cluster?`: `string`; `queryParams?`: [`QueryParameters`](../../api/v1/queryParameters/interfaces/QueryParameters.md); \} | Additional options (cluster, queryParams). |
| `opts.cluster?` | `string` | - |
| `opts.queryParams?` | [`QueryParameters`](../../api/v1/queryParameters/interfaces/QueryParameters.md) | - |

## Returns

\[`K` \| `null`, [`ApiError`](../../api/v2/ApiError/classes/ApiError.md) \| `null`\] & [`QueryResponse`](../../api/v2/hooks/interfaces/QueryResponse.md)\<`K`, [`ApiError`](../../api/v2/ApiError/classes/ApiError.md)\>
