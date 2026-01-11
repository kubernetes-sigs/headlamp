# Function: useKubeObject()

```ts
function useKubeObject<K>(__namedParameters: object): [K | null, ApiError | null] & QueryResponse<K, ApiError>
```

Returns a single KubeObject.

## Type Parameters

| Type Parameter |
| ------ |
| `K` *extends* [`KubeObject`](../../../../KubeObject/classes/KubeObject.md)\<`any`\> |

## Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `__namedParameters` | `object` | - |
| `__namedParameters.cluster`? | `string` | Cluster name |
| `__namedParameters.kubeObjectClass` | (...`args`: `any`) => `K` & *typeof* [`KubeObject`](../../../../KubeObject/classes/KubeObject.md) | Class to instantiate the object with |
| `__namedParameters.name` | `string` | Object name |
| `__namedParameters.namespace`? | `string` | Object namespace |
| `__namedParameters.queryParams`? | [`QueryParameters`](../../../v1/queryParameters/interfaces/QueryParameters.md) | - |

## Returns

[`K` \| `null`, [`ApiError`](../../ApiError/classes/ApiError.md) \| `null`] & [`QueryResponse`](../interfaces/QueryResponse.md)\<`K`, [`ApiError`](../../ApiError/classes/ApiError.md)\>

## Defined in

[src/lib/k8s/api/v2/hooks.ts:101](https://github.com/kubernetes-sigs/headlamp/blob/4f6ccb46282ab9a5d4439bf075672ad3d4cd1113/frontend/src/lib/k8s/api/v2/hooks.ts#L101)
