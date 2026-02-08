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

[src/lib/k8s/api/v1/streamingApi.ts:43](https://github.com/zyzzmohit/headlamp/blob/5c039e27e936e8174f45bbfcab8979134d6fb3fc/frontend/src/lib/k8s/api/v1/streamingApi.ts#L43)
