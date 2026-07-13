[API](../API.md) / lib/k8s/crd

# Module: lib/k8s/crd

## Classes

- [CustomResourceDefinition](../classes/lib_k8s_crd.CustomResourceDefinition.md)

## Interfaces

- [CRClassArgs](../interfaces/lib_k8s_crd.CRClassArgs.md)
- [KubeCRD](../interfaces/lib_k8s_crd.KubeCRD.md)

## Functions

### makeCustomResourceClass

▸ **makeCustomResourceClass**(`args`, `isNamespaced`): `ReturnType`<typeof [`makeKubeObject`](lib_k8s_cluster.md#makekubeobject)\>

**`deprecated`** Use the version of the function that receives an object as its argument.

#### Parameters

| Name | Type |
| :------ | :------ |
| `args` | [group: string, version: string, pluralName: string][] |
| `isNamespaced` | `boolean` |

#### Returns

`ReturnType`<typeof [`makeKubeObject`](lib_k8s_cluster.md#makekubeobject)\>

#### Defined in

[lib/k8s/crd.ts:130](https://github.com/kubernetes-sigs/headlamp/blob/072d2509b/frontend/src/lib/k8s/crd.ts#L130)

▸ **makeCustomResourceClass**(`args`): `ReturnType`<typeof [`makeKubeObject`](lib_k8s_cluster.md#makekubeobject)\>

#### Parameters

| Name | Type |
| :------ | :------ |
| `args` | [`CRClassArgs`](../interfaces/lib_k8s_crd.CRClassArgs.md) |

#### Returns

`ReturnType`<typeof [`makeKubeObject`](lib_k8s_cluster.md#makekubeobject)\>

#### Defined in

[lib/k8s/crd.ts:134](https://github.com/kubernetes-sigs/headlamp/blob/072d2509b/frontend/src/lib/k8s/crd.ts#L134)
