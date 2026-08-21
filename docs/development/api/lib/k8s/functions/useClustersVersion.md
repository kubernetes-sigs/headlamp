# Function: useClustersVersion()

```ts
function useClustersVersion(clusters: Cluster[]): [{
[clusterName: string]: StringDict;
}, {
[clusterName: string]: ApiError | null;
}];
```

Defined in: [lib/k8s/index.ts:294](https://github.com/Rucha0901/headlamp/blob/db946f8d81732ed8fbecf4752fa84b86cab70c8b/frontend/src/lib/k8s/index.ts#L294)

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
