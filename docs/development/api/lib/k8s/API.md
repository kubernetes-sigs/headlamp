# lib/k8s

## Index

### Type Aliases

| Type alias | Description |
| ------ | ------ |
| [CancellablePromise](type-aliases/CancellablePromise.md) | - |

### Variables

| Variable | Description |
| ------ | ------ |
| [ResourceClasses](variables/ResourceClasses.md) | - |

### Functions

| Function | Description |
| ------ | ------ |
| [getVersion](functions/getVersion.md) | Gets the version of the cluster given by the parameter. |
| [labelSelectorToQuery](functions/labelSelectorToQuery.md) | See [selector examples](https://kubernetes.io/docs/concepts/overview/working-with-objects/labels/#list-and-watch-filtering|Label), [selector example](https://kubernetes.io/docs/concepts/overview/working-with-objects/labels/#resources-that-support-set-based-requirements|deployment), [operators](https://github.com/kubernetes/apimachinery/blob/be3a79b26814a8d7637d70f4d434a4626ee1c1e7/pkg/selection/operator.go#L24|possible), and [rule for expressions](https://github.com/kubernetes/apimachinery/blob/be3a79b26814a8d7637d70f4d434a4626ee1c1e7/pkg/labels/selector.go#L305|Format). |
| [matchExpressionSimplifier](functions/matchExpressionSimplifier.md) | Simplifies a matchExpressions array into an array of string representations. |
| [matchLabelsSimplifier](functions/matchLabelsSimplifier.md) | Simplifies a matchLabels object into an array of string expressions. |
| [useCluster](functions/useCluster.md) | Get the currently selected cluster name. |
| [useClustersConf](functions/useClustersConf.md) | Hook for getting or fetching the clusters configuration. This gets the clusters from the redux store. The redux store is updated when the user changes the configuration. The configuration is stored in the local storage. When stateless clusters are present, it combines the stateless clusters with the clusters from the redux store. |
| [useClustersVersion](functions/useClustersVersion.md) | Hook to get the version of the clusters given by the parameter. |
| [useConnectApi](functions/useConnectApi.md) | Hook to manage multiple cancellable API calls tied to the active cluster. |
| [useSelectedClusters](functions/useSelectedClusters.md) | Get a list of selected clusters. Updates when the cluster changes. |

## References

### cluster

Renames and re-exports [lib/k8s/cluster](cluster/API.md)

***

### clusterRole

Renames and re-exports [lib/k8s/clusterRole](clusterRole/API.md)

***

### clusterRoleBinding

Renames and re-exports [lib/k8s/clusterRoleBinding](clusterRoleBinding/API.md)

***

### configMap

Renames and re-exports [lib/k8s/configMap](configMap/API.md)

***

### crd

Renames and re-exports [lib/k8s/crd](crd/API.md)

***

### cronJob

Renames and re-exports [lib/k8s/cronJob](cronJob/API.md)

***

### daemonSet

Renames and re-exports [lib/k8s/daemonSet](daemonSet/API.md)

***

### deployment

Renames and re-exports [lib/k8s/deployment](deployment/API.md)

***

### event

Renames and re-exports [lib/k8s/event](event/API.md)

***

### ingress

Renames and re-exports [lib/k8s/ingress](ingress/API.md)

***

### ingressClass

Renames and re-exports [lib/k8s/ingressClass](ingressClass/API.md)

***

### job

Renames and re-exports [lib/k8s/job](job/API.md)

***

### namespace

Renames and re-exports [lib/k8s/namespace](namespace/API.md)

***

### node

Renames and re-exports [lib/k8s/node](node/API.md)

***

### persistentVolume

Renames and re-exports [lib/k8s/persistentVolume](persistentVolume/API.md)

***

### persistentVolumeClaim

Renames and re-exports [lib/k8s/persistentVolumeClaim](persistentVolumeClaim/API.md)

***

### pod

Renames and re-exports [lib/k8s/pod](pod/API.md)

***

### replicaSet

Renames and re-exports [lib/k8s/replicaSet](replicaSet/API.md)

***

### role

Renames and re-exports [lib/k8s/role](role/API.md)

***

### roleBinding

Renames and re-exports [lib/k8s/roleBinding](roleBinding/API.md)

***

### secret

Renames and re-exports [lib/k8s/secret](secret/API.md)

***

### service

Renames and re-exports [lib/k8s/service](service/API.md)

***

### serviceAccount

Renames and re-exports [lib/k8s/serviceAccount](serviceAccount/API.md)

***

### statefulSet

Renames and re-exports [lib/k8s/statefulSet](statefulSet/API.md)

***

### storageClass

Renames and re-exports [lib/k8s/storageClass](storageClass/API.md)
