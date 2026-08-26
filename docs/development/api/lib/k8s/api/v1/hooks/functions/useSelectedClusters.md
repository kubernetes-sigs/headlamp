# Function: useSelectedClusters()

```ts
function useSelectedClusters(): string[];
```

Defined in: [lib/k8s/api/v1/hooks.ts:59](https://github.com/mishradwaterlaw/headlamp/blob/5944f5d61f18c73406d793336db6720caacb9130/frontend/src/lib/k8s/api/v1/hooks.ts#L59)

Get a list of selected clusters. Updates when the cluster changes.

## Returns

`string`[]

list of selected clusters. if no clusters are selected, an empty list is returned.
