# Interface: StreamConnection

Defined in: [lib/k8s/api/v1/streamingApi.ts:296](https://github.com/kehach07/headlamp/blob/7b4a853c98ea719589ddb64289f86ea94e08b877/frontend/src/lib/k8s/api/v1/streamingApi.ts#L296)

The connection handle returned by the stream connection helpers.

## Properties

### close

```ts
close: () => void;
```

Defined in: [lib/k8s/api/v1/streamingApi.ts:298](https://github.com/kehach07/headlamp/blob/7b4a853c98ea719589ddb64289f86ea94e08b877/frontend/src/lib/k8s/api/v1/streamingApi.ts#L298)

Closes the underlying WebSocket connection.

#### Returns

`void`

***

### socket

```ts
socket: WebSocket | null;
```

Defined in: [lib/k8s/api/v1/streamingApi.ts:300](https://github.com/kehach07/headlamp/blob/7b4a853c98ea719589ddb64289f86ea94e08b877/frontend/src/lib/k8s/api/v1/streamingApi.ts#L300)

The underlying WebSocket, or null if it could not be created.
