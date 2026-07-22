# Function: singleApiFactory()

```ts
function singleApiFactory<T>(...group: SingleApiFactoryArguments): ApiClient<T>;
```

Defined in: [lib/k8s/api/v1/factories.ts:368](https://github.com/SaikiaMan/headlamp/blob/ee95cceb66fcc81536dc274d41f70372e38b6d87/frontend/src/lib/k8s/api/v1/factories.ts#L368)

## Type Parameters

| Type Parameter |
| ------ |
| `T` *extends* [`KubeObjectInterface`](../../../../KubeObject/interfaces/KubeObjectInterface.md) |

## Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| ...`group` | [`SingleApiFactoryArguments`](../type-aliases/SingleApiFactoryArguments.md) | The API group. |

## Returns

[`ApiClient`](../interfaces/ApiClient.md)\<`T`\>

An object with methods for interacting with a single API endpoint.
