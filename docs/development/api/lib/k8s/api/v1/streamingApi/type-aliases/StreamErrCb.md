# Type Alias: StreamErrCb

```ts
type StreamErrCb = (err: Error & object, cancelStreamFunc?: () => void) => void;
```

Defined in: [lib/k8s/api/v1/streamingApi.ts:43](https://github.com/SaikiaMan/headlamp/blob/ee95cceb66fcc81536dc274d41f70372e38b6d87/frontend/src/lib/k8s/api/v1/streamingApi.ts#L43)

## Parameters

| Parameter | Type |
| ------ | ------ |
| `err` | `Error` & `object` |
| `cancelStreamFunc?` | () => `void` |

## Returns

`void`
