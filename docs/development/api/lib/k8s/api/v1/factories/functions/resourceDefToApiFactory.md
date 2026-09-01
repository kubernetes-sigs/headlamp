# Function: resourceDefToApiFactory()

```ts
function resourceDefToApiFactory<ResourceType>(resourceDef: KubeObjectInterface, clusterName?: string): Promise<
  | ApiClient<ResourceType>
| ApiWithNamespaceClient<ResourceType>>;
```

Defined in: [lib/k8s/api/v1/factories.ts:508](https://github.com/Rucha0901/headlamp/blob/db946f8d81732ed8fbecf4752fa84b86cab70c8b/frontend/src/lib/k8s/api/v1/factories.ts#L508)

## Type Parameters

| Type Parameter |
| ------ |
| `ResourceType` *extends* [`KubeObjectInterface`](../../../../KubeObject/interfaces/KubeObjectInterface.md) |

## Parameters

| Parameter | Type |
| ------ | ------ |
| `resourceDef` | [`KubeObjectInterface`](../../../../KubeObject/interfaces/KubeObjectInterface.md) |
| `clusterName?` | `string` |

## Returns

`Promise`\<
  \| [`ApiClient`](../interfaces/ApiClient.md)\<`ResourceType`\>
  \| [`ApiWithNamespaceClient`](../interfaces/ApiWithNamespaceClient.md)\<`ResourceType`\>\>
