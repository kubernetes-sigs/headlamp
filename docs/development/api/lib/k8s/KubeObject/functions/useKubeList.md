# Function: useKubeList()

```ts
function useKubeList<K>(kubeObjectClass: (...args: any) => K & typeof KubeObject, __namedParameters?: object & QueryParameters): [K[] | null, ApiError | null] & QueryListResponse<(
  | ListResponse<K>
  | null
| undefined)[], K, ApiError>;
```

Defined in: [lib/k8s/KubeObject.ts:53](https://github.com/mishradwaterlaw/headlamp/blob/5944f5d61f18c73406d793336db6720caacb9130/frontend/src/lib/k8s/KubeObject.ts#L53)

Hook to fetch and watch a list of Kubernetes objects.

## Type Parameters

| Type Parameter |
| ------ |
| `K` *extends* [`KubeObject`](../classes/KubeObject.md)\<`any`\> |

## Parameters

| Parameter | Type |
| ------ | ------ |
| `kubeObjectClass` | (...`args`: `any`) => `K` & *typeof* [`KubeObject`](../classes/KubeObject.md) |
| `__namedParameters` | `object` & [`QueryParameters`](../../api/v1/queryParameters/interfaces/QueryParameters.md) |

## Returns

\[`K`[] \| `null`, [`ApiError`](../../api/v2/ApiError/classes/ApiError.md) \| `null`\] & [`QueryListResponse`](../../api/v2/hooks/interfaces/QueryListResponse.md)\<(
  \| [`ListResponse`](../../api/v2/useKubeObjectList/interfaces/ListResponse.md)\<`K`\>
  \| `null`
  \| `undefined`)[], `K`, [`ApiError`](../../api/v2/ApiError/classes/ApiError.md)\>
