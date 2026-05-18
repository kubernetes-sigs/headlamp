[API](../API.md) / [lib/k8s/pod](../modules/lib_k8s_pod.md) / KubePod

# Interface: KubePod

[lib/k8s/pod](../modules/lib_k8s_pod.md).KubePod

## Hierarchy

- [`KubeObjectInterface`](lib_k8s_cluster.KubeObjectInterface.md)

  ↳ **`KubePod`**

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

• **spec**: [`KubePodSpec`](lib_k8s_pod.KubePodSpec.md)

#### Defined in

[lib/k8s/pod.ts:32](https://github.com/kubernetes-sigs/headlamp/blob/072d2509b/frontend/src/lib/k8s/pod.ts#L32)

___

### status

• **status**: `Object`

#### Index signature

▪ [other: `string`]: `any`

#### Type declaration

| Name | Type |
| :------ | :------ |
| `conditions` | [`KubeCondition`](lib_k8s_cluster.KubeCondition.md)[] |
| `containerStatuses` | [`KubeContainerStatus`](lib_k8s_cluster.KubeContainerStatus.md)[] |
| `ephemeralContainerStatuses?` | [`KubeContainerStatus`](lib_k8s_cluster.KubeContainerStatus.md)[] |
| `hostIP?` | `string` |
| `initContainerStatuses?` | [`KubeContainerStatus`](lib_k8s_cluster.KubeContainerStatus.md)[] |
| `message?` | `string` |
| `phase` | `string` |
| `qosClass?` | `string` |
| `reason?` | `string` |
| `startTime` | [`Time`](../modules/lib_k8s_cluster.md#time) |

#### Defined in

[lib/k8s/pod.ts:33](https://github.com/kubernetes-sigs/headlamp/blob/072d2509b/frontend/src/lib/k8s/pod.ts#L33)
