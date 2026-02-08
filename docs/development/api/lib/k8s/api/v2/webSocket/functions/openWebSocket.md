# Function: openWebSocket()

```ts
function openWebSocket<T>(url: string, options: object): Promise<WebSocket>
```

Create new WebSocket connection to the backend

## Type Parameters

| Type Parameter |
| ------ |
| `T` |

## Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `url` | `string` | WebSocket URL |
| `options` | `object` | Connection options |
| `options.cluster`? | `string` | Cluster name |
| `options.onMessage` | (`data`: `T`) => `void` | Message callback |
| `options.protocols`? | `string` \| `string`[] | Any additional protocols to include in WebSocket connection |
| `options.type` | `"json"` \| `"binary"` |  |

## Returns

`Promise`\<`WebSocket`\>

WebSocket connection

## Defined in

[src/lib/k8s/api/v2/webSocket.ts:77](https://github.com/zyzzmohit/headlamp/blob/5c039e27e936e8174f45bbfcab8979134d6fb3fc/frontend/src/lib/k8s/api/v2/webSocket.ts#L77)
