# Function: useConnectApi()

```ts
function useConnectApi(...apiCalls: () => CancellablePromise[]): void;
```

Defined in: [lib/k8s/api/v1/hooks.ts:79](https://github.com/kehach07/headlamp/blob/7b4a853c98ea719589ddb64289f86ea94e08b877/frontend/src/lib/k8s/api/v1/hooks.ts#L79)

Hook to manage multiple cancellable API calls tied to the active cluster.

## Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| ...`apiCalls` | () => [`CancellablePromise`](../type-aliases/CancellablePromise.md)[] | functions returning cancellable promises for API calls. |

## Returns

`void`
