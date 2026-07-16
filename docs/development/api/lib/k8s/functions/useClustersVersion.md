# Function: useClustersVersion()

```ts
function useClustersVersion(clusters: Cluster[]): [{
[clusterName: string]: StringDict;
}, {
[clusterName: string]: ApiError | null;
}];
```

Defined in: [lib/k8s/index.ts:280](https://github.com/SaikiaMan/headlamp/blob/ee95cceb66fcc81536dc274d41f70372e38b6d87/frontend/src/lib/k8s/index.ts#L280)

Hook to get the version of the clusters given by the parameter.

## Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `clusters` | [`Cluster`](../cluster/interfaces/Cluster.md)[] | - |

## Returns

\[\{
\[`clusterName`: `string`\]: [`StringDict`](../cluster/interfaces/StringDict.md);
\}, \{
\[`clusterName`: `string`\]: [`ApiError`](../api/v2/ApiError/classes/ApiError.md) \| `null`;
\}\]

a map with cluster -> version-info, and a map with cluster -> error.
