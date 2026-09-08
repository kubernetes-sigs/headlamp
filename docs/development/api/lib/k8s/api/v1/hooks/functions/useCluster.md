# Function: useCluster()

```ts
function useCluster(): string | null;
```

Defined in: [lib/k8s/api/v1/hooks.ts:35](https://github.com/Rucha0901/headlamp/blob/db946f8d81732ed8fbecf4752fa84b86cab70c8b/frontend/src/lib/k8s/api/v1/hooks.ts#L35)

Get the currently selected cluster name.

If more than one cluster is selected it will return:
 - On details pages: the cluster of the currently viewed resource
 - On any other page: one of the selected clusters

To get all currently selected clusters please use [useSelectedClusters](useSelectedClusters.md)

## Returns

`string` \| `null`

currently selected cluster
