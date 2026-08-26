[API](../API.md) / [lib/k8s/cluster](../modules/lib_k8s_cluster.md) / BaseCondition

# Interface: BaseCondition

[lib/k8s/cluster](../modules/lib_k8s_cluster.md).BaseCondition

Fields shared by Kubernetes resource conditions.

## Properties

### lastTransitionTime

• `Optional` **lastTransitionTime**: [`Time`](../modules/lib_k8s_cluster.md#time)

### message

• `Optional` **message**: `string`

### reason

• `Optional` **reason**: `string`

Unique, one-word, CamelCase reason for the condition's last transition.

### status

• **status**: `string`

Status of the condition, one of True, False, Unknown.

### type

• **type**: `string`
