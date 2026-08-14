# Function: apiFactoryWithNamespace()

```ts
function apiFactoryWithNamespace<T>(...args: ApiFactoryWithNamespaceArguments): ApiWithNamespaceClient<T>;
```

Defined in: [lib/k8s/api/v1/factories.ts:408](https://github.com/mishradwaterlaw/headlamp/blob/fa170d1f3805256c3d561c39c317801d0e2be4b3/frontend/src/lib/k8s/api/v1/factories.ts#L408)

## Type Parameters

| Type Parameter |
| ------ |
| `T` *extends* [`KubeObjectInterface`](../../../../KubeObject/interfaces/KubeObjectInterface.md) |

## Parameters

| Parameter | Type |
| ------ | ------ |
| ...`args` | [`ApiFactoryWithNamespaceArguments`](../type-aliases/ApiFactoryWithNamespaceArguments.md) |

## Returns

[`ApiWithNamespaceClient`](../interfaces/ApiWithNamespaceClient.md)\<`T`\>
