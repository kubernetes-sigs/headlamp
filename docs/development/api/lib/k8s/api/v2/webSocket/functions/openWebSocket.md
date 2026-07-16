# Function: openWebSocket()

```ts
function openWebSocket<T>(url: string, options: object): Promise<WebSocket>;
```

Defined in: [lib/k8s/api/v2/webSocket.ts:77](https://github.com/SaikiaMan/headlamp/blob/ee95cceb66fcc81536dc274d41f70372e38b6d87/frontend/src/lib/k8s/api/v2/webSocket.ts#L77)

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
