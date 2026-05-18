[API](../API.md) / [lib/k8s/persistentVolumeClaim](../modules/lib_k8s_persistentVolumeClaim.md) / KubePersistentVolumeClaim

# Interface: KubePersistentVolumeClaim

[lib/k8s/persistentVolumeClaim](../modules/lib_k8s_persistentVolumeClaim.md).KubePersistentVolumeClaim

## Hierarchy

- [`KubeObjectInterface`](lib_k8s_cluster.KubeObjectInterface.md)

  ↳ **`KubePersistentVolumeClaim`**

## Properties

### apiVersion

• `Optional` **apiVersion**: `string`

#### Inherited from

[KubeObjectInterface](lib_k8s_cluster.KubeObjectInterface.md).[apiVersion](lib_k8s_cluster.KubeObjectInterface.md#apiversion)

#### Defined in

[lib/k8s/cluster.ts:56](https://github.com/kubernetes-sigs/headlamp/blob/072d2509b/frontend/src/lib/k8s/cluster.ts#L56)

___

### kind

• **kind**: `string`

Kind is a string value representing the REST resource this object represents.
Servers may infer this from the endpoint the client submits requests to.

In CamelCase.

Cannot be updated.

**`see`** [more info](https://git.k8s.io/community/contributors/devel/sig-architecture/api-conventions.md#types-kinds)

#### Inherited from

[KubeObjectInterface](lib_k8s_cluster.KubeObjectInterface.md).[kind](lib_k8s_cluster.KubeObjectInterface.md#kind)

#### Defined in

[lib/k8s/cluster.ts:55](https://github.com/kubernetes-sigs/headlamp/blob/072d2509b/frontend/src/lib/k8s/cluster.ts#L55)

___

### metadata

• **metadata**: [`KubeMetadata`](lib_k8s_cluster.KubeMetadata.md)

#### Inherited from

[KubeObjectInterface](lib_k8s_cluster.KubeObjectInterface.md).[metadata](lib_k8s_cluster.KubeObjectInterface.md#metadata)

#### Defined in

[lib/k8s/cluster.ts:57](https://github.com/kubernetes-sigs/headlamp/blob/072d2509b/frontend/src/lib/k8s/cluster.ts#L57)

___

### spec

• `Optional` **spec**: `Object`

#### Index signature

▪ [other: `string`]: `any`

#### Type declaration

| Name | Type |
| :------ | :------ |
| `accessModes?` | `string`[] |
| `resources?` | { `limits?`: `object` ; `requests`: { `[other: string]`: `any`; `storage?`: `string`  }  } |
| `resources.limits?` | `object` |
| `resources.requests` | { `[other: string]`: `any`; `storage?`: `string`  } |
| `resources.requests.storage?` | `string` |
| `storageClassName?` | `string` |
| `volumeMode?` | `string` |
| `volumeName?` | `string` |

#### Defined in

[lib/k8s/persistentVolumeClaim.ts:5](https://github.com/kubernetes-sigs/headlamp/blob/072d2509b/frontend/src/lib/k8s/persistentVolumeClaim.ts#L5)

___

### status

• `Optional` **status**: `Object`

#### Index signature

▪ [other: `string`]: `any`

#### Type declaration

| Name | Type |
| :------ | :------ |
| `accessModes?` | `string`[] |
| `capacity?` | { `storage?`: `string`  } |
| `capacity.storage?` | `string` |
| `phase?` | `string` |

#### Defined in

[lib/k8s/persistentVolumeClaim.ts:19](https://github.com/kubernetes-sigs/headlamp/blob/072d2509b/frontend/src/lib/k8s/persistentVolumeClaim.ts#L19)
