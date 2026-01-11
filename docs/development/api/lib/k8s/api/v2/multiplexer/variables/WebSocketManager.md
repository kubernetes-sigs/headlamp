# Variable: WebSocketManager

```ts
const WebSocketManager: object;
```

WebSocket manager to handle connections across the application.
Provides a singleton-like interface for managing WebSocket connections,
subscriptions, and message handling. Implements connection multiplexing
to optimize network usage.

## Type declaration

### activeSubscriptions

```ts
activeSubscriptions: Map<string, object>;
```

Map of active WebSocket subscriptions with their details

### completedPaths

```ts
completedPaths: Set<string>;
```

Set of paths that have received a COMPLETE message

### connecting

```ts
connecting: boolean = false;
```

Flag to track if a connection attempt is in progress

### isReconnecting

```ts
isReconnecting: boolean = false;
```

Flag to track if we're reconnecting after a disconnect

### listeners

```ts
listeners: Map<string, Set<(data: any) => void>>;
```

Map of message handlers for each subscription path

### pendingUnsubscribes

```ts
pendingUnsubscribes: Map<string, Timeout>;
```

Map to track pending unsubscribe operations for debouncing

### socketMultiplexer

```ts
socketMultiplexer: null | WebSocket;
```

Current WebSocket connection instance

### connect()

Establishes or returns an existing WebSocket connection.

This implementation uses a polling approach to handle concurrent connection attempts.
While not ideal, it's a simple solution that works for most cases.

Known limitations:
1. Polls every 100ms which may not be optimal for performance
2. No timeout - could theoretically run forever if connection never opens
3. May miss state changes that happen between polls

A more robust solution would use event listeners and Promise caching,
but that adds complexity and potential race conditions to handle.
The current polling approach, while not perfect, is simple and mostly reliable.

#### Returns

`Promise`\<`WebSocket`\>

Promise resolving to WebSocket connection

### createKey()

Creates a unique key for identifying WebSocket subscriptions

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `clusterId` | `string` | Cluster identifier |
| `path` | `string` | API resource path |
| `query` | `string` | Query parameters |

#### Returns

`string`

Unique subscription key

### handleWebSocketClose()

Handles WebSocket connection close event
Sets up state for potential reconnection

#### Returns

`void`

### handleWebSocketMessage()

Handles incoming WebSocket messages
Processes different message types and notifies appropriate listeners

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `event` | `MessageEvent`\<`any`\> | WebSocket message event |

#### Returns

`void`

### resubscribeAll()

Resubscribes all active subscriptions to a new socket

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `socket` | `WebSocket` | WebSocket connection to subscribe to |

#### Returns

`void`

### subscribe()

Subscribe to WebSocket updates for a specific resource

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `clusterId` | `string` | Cluster identifier |
| `path` | `string` | API resource path |
| `query` | `string` | Query parameters |
| `onMessage` | (`data`: `any`) => `void` | Callback for handling incoming messages |

#### Returns

`Promise`\<() => `void`\>

Promise resolving to cleanup function

### unsubscribe()

Unsubscribes from WebSocket updates with debouncing to prevent rapid subscribe/unsubscribe cycles.

State Management:
- Manages pendingUnsubscribes: Map of timeouts for delayed unsubscription
- Manages listeners: Map of message handlers for each subscription
- Manages activeSubscriptions: Set of currently active WebSocket subscriptions
- Manages completedPaths: Set of paths that have completed their initial data fetch

Debouncing Logic:
1. Clears any pending unsubscribe timeout for the subscription
2. Removes the message handler from listeners
3. If no listeners remain, sets a timeout before actually unsubscribing
4. Only sends CLOSE message if no new listeners are added during timeout

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `key` | `string` | Subscription key that uniquely identifies this subscription |
| `clusterId` | `string` | Cluster identifier for routing to correct cluster |
| `path` | `string` | API resource path being watched |
| `query` | `string` | Query parameters for filtering |
| `onMessage` | (`data`: `any`) => `void` | Message handler to remove from subscription |

#### Returns

`void`

## Defined in

[src/lib/k8s/api/v2/multiplexer.ts:27](https://github.com/kubernetes-sigs/headlamp/blob/4f6ccb46282ab9a5d4439bf075672ad3d4cd1113/frontend/src/lib/k8s/api/v2/multiplexer.ts#L27)
