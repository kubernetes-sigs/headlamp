# Function: multipleApiFactory()

```ts
function multipleApiFactory<T>(...args: MultipleApiFactoryArguments): ApiClient<T>;
```

Defined in: [lib/k8s/api/v1/factories.ts:320](https://github.com/mishradwaterlaw/headlamp/blob/5944f5d61f18c73406d793336db6720caacb9130/frontend/src/lib/k8s/api/v1/factories.ts#L320)

Creates an API endpoint object for multiple API endpoints.
It first tries the first endpoint, then the second, and so on until it
gets a successful response.

## Type Parameters

| Type Parameter |
| ------ |
| `T` *extends* [`KubeObjectInterface`](../../../../KubeObject/interfaces/KubeObjectInterface.md) |

## Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| ...`args` | [`MultipleApiFactoryArguments`](../type-aliases/MultipleApiFactoryArguments.md) | An array of arguments to pass to the `singleApiFactory` function. |

## Returns

[`ApiClient`](../interfaces/ApiClient.md)\<`T`\>

An API endpoint object.
