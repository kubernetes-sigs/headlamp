[API](../API.md) / [lib/k8s/cluster](../modules/lib_k8s_cluster.md) / KubeCondition

# Interface: KubeCondition

[lib/k8s/cluster](../modules/lib_k8s_cluster.md).KubeCondition

## Properties

### lastProbeTime

• **lastProbeTime**: [`Time`](../modules/lib_k8s_cluster.md#time)

Last time we probed the condition.

#### Defined in

[lib/k8s/cluster.ts:892](https://github.com/kubernetes-sigs/headlamp/blob/072d2509b/frontend/src/lib/k8s/cluster.ts#L892)

___

### lastTransitionTime

• `Optional` **lastTransitionTime**: [`Time`](../modules/lib_k8s_cluster.md#time)

#### Defined in

[lib/k8s/cluster.ts:893](https://github.com/kubernetes-sigs/headlamp/blob/072d2509b/frontend/src/lib/k8s/cluster.ts#L893)

___

### lastUpdateTime

• `Optional` **lastUpdateTime**: [`Time`](../modules/lib_k8s_cluster.md#time)

#### Defined in

[lib/k8s/cluster.ts:894](https://github.com/kubernetes-sigs/headlamp/blob/072d2509b/frontend/src/lib/k8s/cluster.ts#L894)

___

### message

• `Optional` **message**: `string`

#### Defined in

[lib/k8s/cluster.ts:895](https://github.com/kubernetes-sigs/headlamp/blob/072d2509b/frontend/src/lib/k8s/cluster.ts#L895)

___

### reason

• `Optional` **reason**: `string`

Unique, one-word, CamelCase reason for the condition's last transition.

#### Defined in

[lib/k8s/cluster.ts:897](https://github.com/kubernetes-sigs/headlamp/blob/072d2509b/frontend/src/lib/k8s/cluster.ts#L897)

___

### status

• **status**: `string`

Status of the condition, one of True, False, Unknown.

#### Defined in

[lib/k8s/cluster.ts:899](https://github.com/kubernetes-sigs/headlamp/blob/072d2509b/frontend/src/lib/k8s/cluster.ts#L899)

___

### type

• **type**: `string`

#### Defined in

[lib/k8s/cluster.ts:900](https://github.com/kubernetes-sigs/headlamp/blob/072d2509b/frontend/src/lib/k8s/cluster.ts#L900)
