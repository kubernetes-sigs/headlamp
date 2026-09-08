# Function: useConnectApi()

```ts
function useConnectApi(...apiCalls: () => CancellablePromise[]): void;
```

Defined in: [lib/k8s/api/v1/hooks.ts:79](https://github.com/Rucha0901/headlamp/blob/db946f8d81732ed8fbecf4752fa84b86cab70c8b/frontend/src/lib/k8s/api/v1/hooks.ts#L79)

Hook to manage multiple cancellable API calls tied to the active cluster.

## Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| ...`apiCalls` | () => [`CancellablePromise`](../type-aliases/CancellablePromise.md)[] | functions returning cancellable promises for API calls. |

## Returns

`void`
