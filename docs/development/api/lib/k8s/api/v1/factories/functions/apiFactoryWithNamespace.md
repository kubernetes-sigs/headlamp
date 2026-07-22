# Function: apiFactoryWithNamespace()

```ts
function apiFactoryWithNamespace<T>(...args: ApiFactoryWithNamespaceArguments): ApiWithNamespaceClient<T>;
```

Defined in: [lib/k8s/api/v1/factories.ts:408](https://github.com/SaikiaMan/headlamp/blob/ee95cceb66fcc81536dc274d41f70372e38b6d87/frontend/src/lib/k8s/api/v1/factories.ts#L408)

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
