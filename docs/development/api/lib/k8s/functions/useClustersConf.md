# Function: useClustersConf()

```ts
function useClustersConf(): ConfigState["allClusters"]
```

Hook for getting or fetching the clusters configuration.
This gets the clusters from the redux store. The redux store is updated
when the user changes the configuration. The configuration is stored in
the local storage. When stateless clusters are present, it combines the
stateless clusters with the clusters from the redux store.

## Returns

`ConfigState`\[`"allClusters"`\]

the clusters configuration.

## Defined in

[src/lib/k8s/index.ts:113](https://github.com/kubernetes-sigs/headlamp/blob/4f6ccb46282ab9a5d4439bf075672ad3d4cd1113/frontend/src/lib/k8s/index.ts#L113)
