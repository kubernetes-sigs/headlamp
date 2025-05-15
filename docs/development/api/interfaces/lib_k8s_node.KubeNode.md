[API](../API.md) / [lib/k8s/node](../modules/lib_k8s_node.md) / KubeNode

# Interface: KubeNode

[lib/k8s/node](../modules/lib_k8s_node.md).KubeNode

## Hierarchy

- [`KubeObjectInterface`](lib_k8s_cluster.KubeObjectInterface.md)

  ↳ **`KubeNode`**

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
| `podCIDR` | `string` |
| `taints` | { `effect`: `string` ; `key`: `string`  }[] |

#### Defined in

[lib/k8s/node.ts:45](https://github.com/kubernetes-sigs/headlamp/blob/072d2509b/frontend/src/lib/k8s/node.ts#L45)

___

### status

• **status**: `Object`

#### Type declaration

| Name | Type |
| :------ | :------ |
| `addresses` | { `address`: `string` ; `type`: `string`  }[] |
| `allocatable` | { `cpu`: `any` ; `ephemeralStorage`: `any` ; `hugepages_1Gi`: `any` ; `hugepages_2Mi`: `any` ; `memory`: `any` ; `pods`: `any`  } |
| `allocatable.cpu` | `any` |
| `allocatable.ephemeralStorage` | `any` |
| `allocatable.hugepages_1Gi` | `any` |
| `allocatable.hugepages_2Mi` | `any` |
| `allocatable.memory` | `any` |
| `allocatable.pods` | `any` |
| `capacity` | { `cpu`: `any` ; `ephemeralStorage`: `any` ; `hugepages_1Gi`: `any` ; `hugepages_2Mi`: `any` ; `memory`: `any` ; `pods`: `any`  } |
| `capacity.cpu` | `any` |
| `capacity.ephemeralStorage` | `any` |
| `capacity.hugepages_1Gi` | `any` |
| `capacity.hugepages_2Mi` | `any` |
| `capacity.memory` | `any` |
| `capacity.pods` | `any` |
| `conditions` | `Omit`<[`KubeCondition`](lib_k8s_cluster.KubeCondition.md), ``"lastProbeTime"`` \| ``"lastUpdateTime"``\> & { `lastHeartbeatTime`: `string`  }[] |
| `nodeInfo` | { `architecture`: `string` ; `bootID`: `string` ; `containerRuntimeVersion`: `string` ; `kernelVersion`: `string` ; `kubeProxyVersion`: `string` ; `kubeletVersion`: `string` ; `machineID`: `string` ; `operatingSystem`: `string` ; `osImage`: `string` ; `systemUUID`: `string`  } |
| `nodeInfo.architecture` | `string` |
| `nodeInfo.bootID` | `string` |
| `nodeInfo.containerRuntimeVersion` | `string` |
| `nodeInfo.kernelVersion` | `string` |
| `nodeInfo.kubeProxyVersion` | `string` |
| `nodeInfo.kubeletVersion` | `string` |
| `nodeInfo.machineID` | `string` |
| `nodeInfo.operatingSystem` | `string` |
| `nodeInfo.osImage` | `string` |
| `nodeInfo.systemUUID` | `string` |

#### Defined in

[lib/k8s/node.ts:8](https://github.com/kubernetes-sigs/headlamp/blob/072d2509b/frontend/src/lib/k8s/node.ts#L8)
