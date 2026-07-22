# Interface: StreamConnection

Defined in: [lib/k8s/api/v1/streamingApi.ts:280](https://github.com/SaikiaMan/headlamp/blob/ee95cceb66fcc81536dc274d41f70372e38b6d87/frontend/src/lib/k8s/api/v1/streamingApi.ts#L280)

The connection handle returned by the stream connection helpers.

## Properties

### close

```ts
close: () => void;
```

Defined in: [lib/k8s/api/v1/streamingApi.ts:282](https://github.com/SaikiaMan/headlamp/blob/ee95cceb66fcc81536dc274d41f70372e38b6d87/frontend/src/lib/k8s/api/v1/streamingApi.ts#L282)

Closes the underlying WebSocket connection.

#### Returns

`void`

***

### socket

```ts
socket: WebSocket | null;
```

Defined in: [lib/k8s/api/v1/streamingApi.ts:284](https://github.com/SaikiaMan/headlamp/blob/ee95cceb66fcc81536dc274d41f70372e38b6d87/frontend/src/lib/k8s/api/v1/streamingApi.ts#L284)

The underlying WebSocket, or null if it could not be created.
