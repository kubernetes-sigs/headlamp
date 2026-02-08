# Variable: KubeList

```ts
KubeList: object;
```

## Type declaration

### applyUpdate()

Apply an update event to the existing list

#### Type Parameters

| Type Parameter |
| ------ |
| `ObjectInterface` *extends* [`KubeObjectInterface`](../../../../KubeObject/interfaces/KubeObjectInterface.md) |
| `ObjectClass` *extends* *typeof* [`KubeObject`](../../../../KubeObject/classes/KubeObject.md) |

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `list` | [`KubeList`](../interfaces/KubeList.md)\<[`KubeObject`](../../../../KubeObject/classes/KubeObject.md)\<`ObjectInterface`\>\> | List of kubernetes resources |
| `update` | [`KubeListUpdateEvent`](../interfaces/KubeListUpdateEvent.md)\<`ObjectInterface`\> | Update event to apply to the list |
| `itemClass` | `ObjectClass` | Class of an item in the list. Used to instantiate each item |
| `cluster` | `string` | - |

#### Returns

[`KubeList`](../interfaces/KubeList.md)\<[`KubeObject`](../../../../KubeObject/classes/KubeObject.md)\<`ObjectInterface`\>\>

New list with the updated values

## Defined in

[src/lib/k8s/api/v2/KubeList.ts:20](https://github.com/zyzzmohit/headlamp/blob/5c039e27e936e8174f45bbfcab8979134d6fb3fc/frontend/src/lib/k8s/api/v2/KubeList.ts#L20)
