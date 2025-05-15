[API](../API.md) / [lib/k8s/daemonSet](../modules/lib_k8s_daemonSet.md) / KubeDaemonSet

# Interface: KubeDaemonSet

[lib/k8s/daemonSet](../modules/lib_k8s_daemonSet.md).KubeDaemonSet

## Hierarchy

- [`KubeObjectInterface`](lib_k8s_cluster.KubeObjectInterface.md)

  ↳ **`KubeDaemonSet`**

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

▪ [otherProps: `string`]: `any`

#### Type declaration

| Name | Type |
| :------ | :------ |
| `selector` | [`LabelSelector`](lib_k8s_cluster.LabelSelector.md) |
| `template` | { `metadata`: [`KubeMetadata`](lib_k8s_cluster.KubeMetadata.md) ; `spec`: [`KubePodSpec`](lib_k8s_pod.KubePodSpec.md)  } |
| `template.metadata` | [`KubeMetadata`](lib_k8s_cluster.KubeMetadata.md) |
| `template.spec` | [`KubePodSpec`](lib_k8s_pod.KubePodSpec.md) |
| `updateStrategy` | { `rollingUpdate`: { `maxUnavailable`: `number`  } ; `type`: `string`  } |
| `updateStrategy.rollingUpdate` | { `maxUnavailable`: `number`  } |
| `updateStrategy.rollingUpdate.maxUnavailable` | `number` |
| `updateStrategy.type` | `string` |

#### Defined in

[lib/k8s/daemonSet.ts:12](https://github.com/kubernetes-sigs/headlamp/blob/072d2509b/frontend/src/lib/k8s/daemonSet.ts#L12)

___

### status

• **status**: `Object`

#### Index signature

▪ [otherProps: `string`]: `any`

#### Defined in

[lib/k8s/daemonSet.ts:26](https://github.com/kubernetes-sigs/headlamp/blob/072d2509b/frontend/src/lib/k8s/daemonSet.ts#L26)
