[API](../API.md) / [lib/k8s/roleBinding](../modules/lib_k8s_roleBinding.md) / KubeRoleBinding

# Interface: KubeRoleBinding

[lib/k8s/roleBinding](../modules/lib_k8s_roleBinding.md).KubeRoleBinding

## Hierarchy

- [`KubeObjectInterface`](lib_k8s_cluster.KubeObjectInterface.md)

  ↳ **`KubeRoleBinding`**

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

### roleRef

• **roleRef**: `Object`

#### Type declaration

| Name | Type |
| :------ | :------ |
| `apiGroup` | `string` |
| `kind` | `string` |
| `name` | `string` |

#### Defined in

[lib/k8s/roleBinding.ts:5](https://github.com/kubernetes-sigs/headlamp/blob/072d2509b/frontend/src/lib/k8s/roleBinding.ts#L5)

___

### subjects

• **subjects**: { `apiGroup`: `string` ; `kind`: `string` ; `name`: `string` ; `namespace`: `string`  }[]

#### Defined in

[lib/k8s/roleBinding.ts:10](https://github.com/kubernetes-sigs/headlamp/blob/072d2509b/frontend/src/lib/k8s/roleBinding.ts#L10)
