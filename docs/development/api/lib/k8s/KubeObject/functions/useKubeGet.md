# Function: useKubeGet()

```ts
function useKubeGet<K>(
   kubeObjectClass: (...args: any) => K & typeof KubeObject, 
   name: string, 
   namespace?: string, 
opts?: object): [K | null, ApiError | null] & QueryResponse<K, ApiError>;
```

Defined in: [lib/k8s/KubeObject.ts:105](https://github.com/mishradwaterlaw/headlamp/blob/5944f5d61f18c73406d793336db6720caacb9130/frontend/src/lib/k8s/KubeObject.ts#L105)

Hook to fetch and watch a single Kubernetes object.

## Type Parameters

| Type Parameter |
| ------ |
| `K` *extends* [`KubeObject`](../classes/KubeObject.md)\<`any`\> |

## Parameters

| Parameter | Type |
| ------ | ------ |
| `kubeObjectClass` | (...`args`: `any`) => `K` & *typeof* [`KubeObject`](../classes/KubeObject.md) |
| `name` | `string` |
| `namespace?` | `string` |
| `opts?` | \{ `cluster?`: `string`; `initialData?`: `K`; `queryParams?`: [`QueryParameters`](../../api/v1/queryParameters/interfaces/QueryParameters.md); \} |
| `opts.cluster?` | `string` |
| `opts.initialData?` | `K` |
| `opts.queryParams?` | [`QueryParameters`](../../api/v1/queryParameters/interfaces/QueryParameters.md) |

## Returns

\[`K` \| `null`, [`ApiError`](../../api/v2/ApiError/classes/ApiError.md) \| `null`\] & [`QueryResponse`](../../api/v2/hooks/interfaces/QueryResponse.md)\<`K`, [`ApiError`](../../api/v2/ApiError/classes/ApiError.md)\>
