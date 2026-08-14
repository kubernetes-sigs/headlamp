# Function: useKubeApiGet()

```ts
function useKubeApiGet<K>(
   kubeClass: (...args: any) => K & typeof KubeObject, 
   onGet: (item: K | null) => any, 
   name: string, 
   namespace?: string, 
   onError?: (err: ApiError | null, cluster?: string) => void, 
   opts?: object): void;
```

Defined in: [lib/k8s/hooks.ts:213](https://github.com/mishradwaterlaw/headlamp/blob/fa170d1f3805256c3d561c39c317801d0e2be4b3/frontend/src/lib/k8s/hooks.ts#L213)

Standalone hook equivalent of KubeObject.useApiGet.

Fetches a single resource using the legacy v1 watch API, calling `onGet`
whenever the resource changes.

## Type Parameters

| Type Parameter |
| ------ |
| `K` *extends* [`KubeObject`](../../KubeObject/classes/KubeObject.md)\<`any`\> |

## Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `kubeClass` | (...`args`: `any`) => `K` & *typeof* [`KubeObject`](../../KubeObject/classes/KubeObject.md) | The KubeObject subclass to fetch. |
| `onGet` | (`item`: `K` \| `null`) => `any` | Callback called with the fetched resource (or null). |
| `name` | `string` | Name of the resource. |
| `namespace?` | `string` | Namespace of the resource (for namespaced resources). |
| `onError?` | (`err`: [`ApiError`](../../api/v2/ApiError/classes/ApiError.md) \| `null`, `cluster?`: `string`) => `void` | Optional error callback. |
| `opts?` | \{ `cluster?`: `string`; `queryParams?`: [`QueryParameters`](../../api/v1/queryParameters/interfaces/QueryParameters.md); \} | Additional options (cluster, queryParams). |
| `opts.cluster?` | `string` | - |
| `opts.queryParams?` | [`QueryParameters`](../../api/v1/queryParameters/interfaces/QueryParameters.md) | - |

## Returns

`void`
