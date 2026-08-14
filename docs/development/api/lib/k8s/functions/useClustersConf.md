# Function: useClustersConf()

```ts
function useClustersConf(): 
  | {
[clusterName: string]: Cluster;
}
  | null;
```

Defined in: [lib/k8s/index.ts:117](https://github.com/SaikiaMan/headlamp/blob/ee95cceb66fcc81536dc274d41f70372e38b6d87/frontend/src/lib/k8s/index.ts#L117)

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
