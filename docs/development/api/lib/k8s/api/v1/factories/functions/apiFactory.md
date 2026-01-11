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

[src/lib/k8s/api/v1/factories.ts:281](https://github.com/kubernetes-sigs/headlamp/blob/4f6ccb46282ab9a5d4439bf075672ad3d4cd1113/frontend/src/lib/k8s/api/v1/factories.ts#L281)
