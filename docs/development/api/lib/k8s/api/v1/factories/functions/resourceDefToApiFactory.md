# Function: resourceDefToApiFactory()

```ts
function resourceDefToApiFactory<ResourceType>(resourceDef: KubeObjectInterface, clusterName?: string): Promise<ApiClient<ResourceType> | ApiWithNamespaceClient<ResourceType>>
```

## Type Parameters

| Type Parameter |
| ------ |
| `ResourceType` *extends* [`KubeObjectInterface`](../../../../KubeObject/interfaces/KubeObjectInterface.md) |

## Parameters

| Parameter | Type |
| ------ | ------ |
| `resourceDef` | [`KubeObjectInterface`](../../../../KubeObject/interfaces/KubeObjectInterface.md) |
| `clusterName`? | `string` |

## Returns

`Promise`\<[`ApiClient`](../interfaces/ApiClient.md)\<`ResourceType`\> \| [`ApiWithNamespaceClient`](../interfaces/ApiWithNamespaceClient.md)\<`ResourceType`\>\>

## Defined in

[src/lib/k8s/api/v1/factories.ts:481](https://github.com/zyzzmohit/headlamp/blob/5c039e27e936e8174f45bbfcab8979134d6fb3fc/frontend/src/lib/k8s/api/v1/factories.ts#L481)
