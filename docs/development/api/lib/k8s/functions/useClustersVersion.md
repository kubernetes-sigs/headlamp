# Function: useClustersVersion()

```ts
function useClustersVersion(clusters: Cluster[]): [{
[clusterName: string]: StringDict;
}, {
[clusterName: string]: ApiError | null;
}];
```

Defined in: [lib/k8s/index.ts:282](https://github.com/kehach07/headlamp/blob/7b4a853c98ea719589ddb64289f86ea94e08b877/frontend/src/lib/k8s/index.ts#L282)

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
