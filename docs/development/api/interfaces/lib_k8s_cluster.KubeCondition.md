[API](../API.md) / [lib/k8s/cluster](../modules/lib_k8s_cluster.md) / KubeCondition

# Type alias: KubeCondition

[lib/k8s/cluster](../modules/lib_k8s_cluster.md).KubeCondition

Ƭ **KubeCondition**: ([`PodCondition`](lib_k8s_cluster.PodCondition.md) \| [`NodeCondition`](lib_k8s_cluster.NodeCondition.md) \| [`WorkloadCondition`](lib_k8s_cluster.WorkloadCondition.md)) & { `lastHeartbeatTime?`: `string`; `lastProbeTime?`: [`Time`](../modules/lib_k8s_cluster.md#time); `lastUpdateTime?`: [`Time`](../modules/lib_k8s_cluster.md#time) }

A pod, node, or workload condition with resource-specific timestamp fields preserved.
