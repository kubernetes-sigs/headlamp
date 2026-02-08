# Function: singleApiFactory()

```ts
function singleApiFactory<T>(...__namedParameters: SingleApiFactoryArguments): ApiClient<T>
```

## Type Parameters

| Type Parameter |
| ------ |
| `T` *extends* [`KubeObjectInterface`](../../../../KubeObject/interfaces/KubeObjectInterface.md) |

## Parameters

| Parameter | Type |
| ------ | ------ |
| ...`__namedParameters` | [`SingleApiFactoryArguments`](../type-aliases/SingleApiFactoryArguments.md) |

## Returns

[`ApiClient`](../interfaces/ApiClient.md)\<`T`\>

An object with methods for interacting with a single API endpoint.

## Defined in

[src/lib/k8s/api/v1/factories.ts:353](https://github.com/zyzzmohit/headlamp/blob/5c039e27e936e8174f45bbfcab8979134d6fb3fc/frontend/src/lib/k8s/api/v1/factories.ts#L353)
