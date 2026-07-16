# Function: resourceDefToApiFactory()

```ts
function resourceDefToApiFactory<ResourceType>(resourceDef: KubeObjectInterface, clusterName?: string): Promise<
  | ApiClient<ResourceType>
| ApiWithNamespaceClient<ResourceType>>;
```

Defined in: [lib/k8s/api/v1/factories.ts:508](https://github.com/SaikiaMan/headlamp/blob/ee95cceb66fcc81536dc274d41f70372e38b6d87/frontend/src/lib/k8s/api/v1/factories.ts#L508)

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
