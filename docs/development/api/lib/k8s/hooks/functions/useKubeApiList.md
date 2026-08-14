# Function: useKubeApiList()

```ts
function useKubeApiList<K>(
   kubeClass: (...args: any) => K & typeof KubeObject, 
   onList: (...arg: any[]) => any, 
   onError?: (err: ApiError, cluster?: string) => void, 
   opts?: ApiListOptions): void;
```

Defined in: [lib/k8s/hooks.ts:52](https://github.com/mishradwaterlaw/headlamp/blob/fa170d1f3805256c3d561c39c317801d0e2be4b3/frontend/src/lib/k8s/hooks.ts#L52)

Standalone hook equivalent of KubeObject.useApiList.

Fetches a list of resources across one or more namespaces, merging results
as each namespace responds. Uses the legacy v1 API/watch pattern.

## Type Parameters

| Type Parameter |
| ------ |
| `K` *extends* [`KubeObject`](../../KubeObject/classes/KubeObject.md)\<`any`\> |

## Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `kubeClass` | (...`args`: `any`) => `K` & *typeof* [`KubeObject`](../../KubeObject/classes/KubeObject.md) | The KubeObject subclass to list (e.g. Pod, Deployment). |
| `onList` | (...`arg`: `any`[]) => `any` | Callback called with the merged list whenever results arrive. |
| `onError?` | (`err`: [`ApiError`](../../api/v2/ApiError/classes/ApiError.md), `cluster?`: `string`) => `void` | Optional error callback. |
| `opts?` | [`ApiListOptions`](../../KubeObject/interfaces/ApiListOptions.md) | Listing options (namespace, cluster, queryParams, etc.). |

## Returns

`void`
