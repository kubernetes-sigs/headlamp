[API](../API.md) / [lib/k8s/replicaSet](../modules/lib_k8s_replicaSet.md) / KubeReplicaSet

# Interface: KubeReplicaSet

[lib/k8s/replicaSet](../modules/lib_k8s_replicaSet.md).KubeReplicaSet

## Hierarchy

- [`KubeObjectInterface`](lib_k8s_cluster.KubeObjectInterface.md)

  ↳ **`KubeReplicaSet`**

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

• **spec**: `Object`

#### Index signature

▪ [other: `string`]: `any`

#### Type declaration

| Name | Type |
| :------ | :------ |
| `minReadySeconds` | `number` |
| `replicas` | `number` |
| `selector` | [`LabelSelector`](lib_k8s_cluster.LabelSelector.md) |
| `template` | { `metadata?`: [`KubeMetadata`](lib_k8s_cluster.KubeMetadata.md) ; `spec`: [`KubePodSpec`](lib_k8s_pod.KubePodSpec.md)  } |
| `template.metadata?` | [`KubeMetadata`](lib_k8s_cluster.KubeMetadata.md) |
| `template.spec` | [`KubePodSpec`](lib_k8s_pod.KubePodSpec.md) |

#### Defined in

[lib/k8s/replicaSet.ts:13](https://github.com/kubernetes-sigs/headlamp/blob/072d2509b/frontend/src/lib/k8s/replicaSet.ts#L13)

___

### status

• **status**: `Object`

#### Type declaration

| Name | Type |
| :------ | :------ |
| `availableReplicas` | `number` |
| `conditions` | `Omit`<[`KubeCondition`](lib_k8s_cluster.KubeCondition.md), ``"lastProbeTime"`` \| ``"lastUpdateTime"``\>[] |
| `fullyLabeledReplicas` | `number` |
| `observedGeneration` | `number` |
| `readyReplicas` | `number` |
| `replicas` | `number` |

#### Defined in

[lib/k8s/replicaSet.ts:23](https://github.com/kubernetes-sigs/headlamp/blob/072d2509b/frontend/src/lib/k8s/replicaSet.ts#L23)
