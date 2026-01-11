# Function: useConnectApi()

```ts
function useConnectApi(...apiCalls: () => CancellablePromise[]): void
```

Hook to manage multiple cancellable API calls tied to the active cluster.

## Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| ...`apiCalls` | () => [`CancellablePromise`](../type-aliases/CancellablePromise.md)[] | functions returning cancellable promises for API calls. |

## Returns

`void`

## Defined in

[src/lib/k8s/index.ts:195](https://github.com/kubernetes-sigs/headlamp/blob/4f6ccb46282ab9a5d4439bf075672ad3d4cd1113/frontend/src/lib/k8s/index.ts#L195)
