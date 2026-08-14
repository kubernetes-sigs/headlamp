# Function: useConnectApi()

```ts
function useConnectApi(...apiCalls: () => CancellablePromise[]): void;
```

Defined in: [lib/k8s/api/v1/hooks.ts:79](https://github.com/mishradwaterlaw/headlamp/blob/fa170d1f3805256c3d561c39c317801d0e2be4b3/frontend/src/lib/k8s/api/v1/hooks.ts#L79)

Hook to manage multiple cancellable API calls tied to the active cluster.

## Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| ...`apiCalls` | () => [`CancellablePromise`](../type-aliases/CancellablePromise.md)[] | functions returning cancellable promises for API calls. |

## Returns

`void`
