# Variable: KubeList

```ts
KubeList: object;
```

Defined in: [lib/k8s/api/v2/KubeList.ts:20](https://github.com/SaikiaMan/headlamp/blob/ee95cceb66fcc81536dc274d41f70372e38b6d87/frontend/src/lib/k8s/api/v2/KubeList.ts#L20)

## Type Declaration

### applyUpdate()

```ts
applyUpdate<ObjectInterface, ObjectClass>(
   list: KubeList<KubeObject<ObjectInterface>>, 
   update: KubeListUpdateEvent<ObjectInterface>, 
   itemClass: ObjectClass, 
cluster: string): KubeList<KubeObject<ObjectInterface>>;
```

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
