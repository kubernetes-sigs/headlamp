# Function: apiFactory()

```ts
function apiFactory<ResourceType>(...args: ApiFactoryArguments): ApiClient<ResourceType>
```

Creates an API client for a single or multiple Kubernetes resources.

## Type Parameters

| Type Parameter | Default type |
| ------ | ------ |
| `ResourceType` *extends* [`KubeObjectInterface`](../../../../KubeObject/interfaces/KubeObjectInterface.md) | [`KubeObjectInterface`](../../../../KubeObject/interfaces/KubeObjectInterface.md) |

## Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| ...`args` | [`ApiFactoryArguments`](../type-aliases/ApiFactoryArguments.md) | The arguments to pass to either `singleApiFactory` or `multipleApiFactory`. |

## Returns

[`ApiClient`](../interfaces/ApiClient.md)\<`ResourceType`\>

An API client for the specified Kubernetes resource(s).

## Defined in

[src/lib/k8s/api/v1/factories.ts:281](https://github.com/zyzzmohit/headlamp/blob/5c039e27e936e8174f45bbfcab8979134d6fb3fc/frontend/src/lib/k8s/api/v1/factories.ts#L281)
