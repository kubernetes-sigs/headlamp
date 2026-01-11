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

[src/lib/k8s/api/v2/webSocket.ts:77](https://github.com/kubernetes-sigs/headlamp/blob/4f6ccb46282ab9a5d4439bf075672ad3d4cd1113/frontend/src/lib/k8s/api/v2/webSocket.ts#L77)
