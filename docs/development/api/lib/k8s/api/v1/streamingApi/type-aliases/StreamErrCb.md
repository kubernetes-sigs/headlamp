# Type Alias: StreamErrCb

```ts
type StreamErrCb = (err: Error & object, cancelStreamFunc?: () => void) => void;
```

Defined in: [lib/k8s/api/v1/streamingApi.ts:43](https://github.com/Rucha0901/headlamp/blob/db946f8d81732ed8fbecf4752fa84b86cab70c8b/frontend/src/lib/k8s/api/v1/streamingApi.ts#L43)

## Parameters

| Parameter | Type |
| ------ | ------ |
| `err` | `Error` & `object` |
| `cancelStreamFunc?` | () => `void` |

## Returns

`void`
