# Function: useSelectedClusters()

```ts
function useSelectedClusters(): string[];
```

Defined in: [lib/k8s/api/v1/hooks.ts:59](https://github.com/kehach07/headlamp/blob/7b4a853c98ea719589ddb64289f86ea94e08b877/frontend/src/lib/k8s/api/v1/hooks.ts#L59)

Get a list of selected clusters. Updates when the cluster changes.

## Returns

`string`[]

list of selected clusters. if no clusters are selected, an empty list is returned.
