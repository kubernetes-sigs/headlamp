# Function: useClustersConf()

```ts
function useClustersConf(): 
  | {
[clusterName: string]: Cluster;
}
  | null;
```

Defined in: [lib/k8s/index.ts:129](https://github.com/Rucha0901/headlamp/blob/db946f8d81732ed8fbecf4752fa84b86cab70c8b/frontend/src/lib/k8s/index.ts#L129)

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
