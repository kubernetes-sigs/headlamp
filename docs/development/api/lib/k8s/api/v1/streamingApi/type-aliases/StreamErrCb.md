# Type Alias: StreamErrCb

```ts
type StreamErrCb = (err: ApiError, cancelStreamFunc?: () => void) => void;
```

Defined in: [lib/k8s/api/v1/streamingApi.ts:43](https://github.com/kehach07/headlamp/blob/7b4a853c98ea719589ddb64289f86ea94e08b877/frontend/src/lib/k8s/api/v1/streamingApi.ts#L43)

## Parameters

| Parameter | Type |
| ------ | ------ |
| `err` | [`ApiError`](../../../v2/ApiError/classes/ApiError.md) |
| `cancelStreamFunc?` | () => `void` |

## Returns

`void`
