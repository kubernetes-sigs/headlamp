# Function: apiFactoryWithNamespace()

```ts
function apiFactoryWithNamespace<T>(...args: ApiFactoryWithNamespaceArguments): ApiWithNamespaceClient<T>
```

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

## Defined in

[src/lib/k8s/api/v1/factories.ts:389](https://github.com/zyzzmohit/headlamp/blob/5c039e27e936e8174f45bbfcab8979134d6fb3fc/frontend/src/lib/k8s/api/v1/factories.ts#L389)
