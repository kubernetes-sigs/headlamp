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

[src/lib/k8s/index.ts:348](https://github.com/zyzzmohit/headlamp/blob/5c039e27e936e8174f45bbfcab8979134d6fb3fc/frontend/src/lib/k8s/index.ts#L348)
