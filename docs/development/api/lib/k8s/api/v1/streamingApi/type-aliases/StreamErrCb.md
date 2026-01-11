# Type Alias: StreamErrCb()

```ts
type StreamErrCb: (err: Error & object, cancelStreamFunc?: () => void) => void;
```

## Parameters

| Parameter | Type |
| ------ | ------ |
| `err` | `Error` & `object` |
| `cancelStreamFunc`? | () => `void` |

## Returns

`void`

## Defined in

[src/lib/k8s/api/v1/streamingApi.ts:43](https://github.com/kubernetes-sigs/headlamp/blob/4f6ccb46282ab9a5d4439bf075672ad3d4cd1113/frontend/src/lib/k8s/api/v1/streamingApi.ts#L43)
