# Type Alias: StreamErrCb

```ts
type StreamErrCb = (err: Error & object, cancelStreamFunc?: () => void) => void;
```

Defined in: [lib/k8s/api/v1/streamingApi.ts:43](https://github.com/mishradwaterlaw/headlamp/blob/fa170d1f3805256c3d561c39c317801d0e2be4b3/frontend/src/lib/k8s/api/v1/streamingApi.ts#L43)

## Parameters

| Parameter | Type |
| ------ | ------ |
| `err` | `Error` & `object` |
| `cancelStreamFunc?` | () => `void` |

## Returns

`void`
