# Function: useClustersConf()

```ts
function useClustersConf(): 
  | {
[clusterName: string]: Cluster;
}
  | null;
```

Defined in: [lib/k8s/index.ts:129](https://github.com/mishradwaterlaw/headlamp/blob/5944f5d61f18c73406d793336db6720caacb9130/frontend/src/lib/k8s/index.ts#L129)

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
