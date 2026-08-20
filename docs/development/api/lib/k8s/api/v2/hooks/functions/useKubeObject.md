# Function: useKubeObject()

```ts
function useKubeObject<K>(__namedParameters: object): [K | null, ApiError | null] & QueryResponse<K, ApiError>;
```

Defined in: [lib/k8s/api/v2/hooks.ts:108](https://github.com/kehach07/headlamp/blob/7b4a853c98ea719589ddb64289f86ea94e08b877/frontend/src/lib/k8s/api/v2/hooks.ts#L108)

Returns a single KubeObject.

## Type Parameters

| Type Parameter |
| ------ |
| `K` *extends* [`KubeObject`](../../../../KubeObject/classes/KubeObject.md)\<`any`\> |

## Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `__namedParameters` | \{ `cluster?`: `string`; `kubeObjectClass`: (...`args`: `any`) => `K` & *typeof* [`KubeObject`](../../../../KubeObject/classes/KubeObject.md); `name`: `string`; `namespace?`: `string`; `queryParams?`: [`QueryParameters`](../../../v1/queryParameters/interfaces/QueryParameters.md); \} | - |
| `__namedParameters.cluster?` | `string` | Cluster name |
| `__namedParameters.kubeObjectClass` | (...`args`: `any`) => `K` & *typeof* [`KubeObject`](../../../../KubeObject/classes/KubeObject.md) | Class to instantiate the object with |
| `__namedParameters.name` | `string` | Object name |
| `__namedParameters.namespace?` | `string` | Object namespace |
| `__namedParameters.queryParams?` | [`QueryParameters`](../../../v1/queryParameters/interfaces/QueryParameters.md) | - |

## Returns

\[`K` \| `null`, [`ApiError`](../../ApiError/classes/ApiError.md) \| `null`\] & [`QueryResponse`](../interfaces/QueryResponse.md)\<`K`, [`ApiError`](../../ApiError/classes/ApiError.md)\>
