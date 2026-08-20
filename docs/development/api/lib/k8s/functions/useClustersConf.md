# Function: useClustersConf()

```ts
function useClustersConf(): 
  | {
[clusterName: string]: Cluster;
}
  | null;
```

Defined in: [lib/k8s/index.ts:119](https://github.com/kehach07/headlamp/blob/7b4a853c98ea719589ddb64289f86ea94e08b877/frontend/src/lib/k8s/index.ts#L119)

Hook for getting or fetching the clusters configuration.
This gets the clusters from the redux store. The redux store is updated
when the user changes the configuration. The configuration is stored in
the local storage. When stateless clusters are present, it combines the
stateless clusters with the clusters from the redux store.

## Returns

  \| \{
\[`clusterName`: `string`\]: [`Cluster`](../cluster/interfaces/Cluster.md);
\}
  \| `null`

the clusters configuration.
