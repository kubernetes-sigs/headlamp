# Function: useSelectedClusters()

```ts
function useSelectedClusters(): string[];
```

Defined in: [lib/k8s/api/v1/hooks.ts:59](https://github.com/mishradwaterlaw/headlamp/blob/fa170d1f3805256c3d561c39c317801d0e2be4b3/frontend/src/lib/k8s/api/v1/hooks.ts#L59)

Get a list of selected clusters. Updates when the cluster changes.

## Returns

`string`[]

list of selected clusters. if no clusters are selected, an empty list is returned.
