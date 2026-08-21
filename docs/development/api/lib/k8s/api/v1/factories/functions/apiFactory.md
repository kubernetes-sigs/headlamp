# Function: apiFactory()

```ts
function apiFactory<ResourceType>(...args: ApiFactoryArguments): ApiClient<ResourceType>;
```

Defined in: [lib/k8s/api/v1/factories.ts:297](https://github.com/Rucha0901/headlamp/blob/db946f8d81732ed8fbecf4752fa84b86cab70c8b/frontend/src/lib/k8s/api/v1/factories.ts#L297)

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
