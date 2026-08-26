# Function: useClustersVersion()

```ts
function useClustersVersion(clusters: Cluster[]): [{
[clusterName: string]: StringDict;
}, {
[clusterName: string]: ApiError | null;
}];
```

Defined in: [lib/k8s/index.ts:296](https://github.com/mishradwaterlaw/headlamp/blob/5944f5d61f18c73406d793336db6720caacb9130/frontend/src/lib/k8s/index.ts#L296)

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
