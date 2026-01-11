# Function: useClustersVersion()

```ts
function useClustersVersion(clusters: Cluster[]): [object, object]
```

Hook to get the version of the clusters given by the parameter.

## Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `clusters` | [`Cluster`](../cluster/interfaces/Cluster.md)[] |  |

## Returns

[`object`, `object`]

a map with cluster -> version-info, and a map with cluster -> error.

## Defined in

[src/lib/k8s/index.ts:348](https://github.com/kubernetes-sigs/headlamp/blob/4f6ccb46282ab9a5d4439bf075672ad3d4cd1113/frontend/src/lib/k8s/index.ts#L348)
