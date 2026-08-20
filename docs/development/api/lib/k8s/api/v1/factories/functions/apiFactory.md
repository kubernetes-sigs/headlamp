# Function: apiFactory()

```ts
function apiFactory<ResourceType>(...args: ApiFactoryArguments): ApiClient<ResourceType>;
```

Defined in: [lib/k8s/api/v1/factories.ts:297](https://github.com/mishradwaterlaw/headlamp/blob/5944f5d61f18c73406d793336db6720caacb9130/frontend/src/lib/k8s/api/v1/factories.ts#L297)

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
