# Function: openWebSocket()

```ts
function openWebSocket<T>(url: string, options: object): Promise<WebSocket>;
```

Defined in: [lib/k8s/api/v2/webSocket.ts:77](https://github.com/kehach07/headlamp/blob/7b4a853c98ea719589ddb64289f86ea94e08b877/frontend/src/lib/k8s/api/v2/webSocket.ts#L77)

Create new WebSocket connection to the backend

## Type Parameters

| Type Parameter |
| ------ |
| `T` |

## Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `url` | `string` | WebSocket URL |
| `options` | \{ `cluster?`: `string`; `onMessage`: (`data`: `T`) => `void`; `protocols?`: `string` \| `string`[]; `type`: `"json"` \| `"binary"`; \} | Connection options |
| `options.cluster?` | `string` | Cluster name |
| `options.onMessage` | (`data`: `T`) => `void` | Message callback |
| `options.protocols?` | `string` \| `string`[] | Any additional protocols to include in WebSocket connection |
| `options.type` | `"json"` \| `"binary"` | - |

## Returns

`Promise`\<`WebSocket`\>

WebSocket connection
