# Type Alias: WebSocketConnectionRequest\<T\>

```ts
type WebSocketConnectionRequest<T> = object;
```

Defined in: [lib/k8s/api/v2/webSocket.ts:42](https://github.com/SaikiaMan/headlamp/blob/ee95cceb66fcc81536dc274d41f70372e38b6d87/frontend/src/lib/k8s/api/v2/webSocket.ts#L42)

Configuration for establishing a WebSocket connection to watch Kubernetes resources.
Used by the multiplexer to manage multiple WebSocket connections efficiently.

## Type Parameters

| Type Parameter | Description |
| ------ | ------ |
| `T` | The expected type of data that will be received over the WebSocket |

## Properties

### cluster

```ts
cluster: string;
```

Defined in: [lib/k8s/api/v2/webSocket.ts:47](https://github.com/SaikiaMan/headlamp/blob/ee95cceb66fcc81536dc274d41f70372e38b6d87/frontend/src/lib/k8s/api/v2/webSocket.ts#L47)

The Kubernetes cluster identifier to connect to.
Used for routing WebSocket messages in multi-cluster environments.

***

### onMessage

```ts
onMessage: (data: T) => void;
```

Defined in: [lib/k8s/api/v2/webSocket.ts:60](https://github.com/SaikiaMan/headlamp/blob/ee95cceb66fcc81536dc274d41f70372e38b6d87/frontend/src/lib/k8s/api/v2/webSocket.ts#L60)

Callback function that handles incoming messages from the WebSocket.

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `data` | `T` | The message payload, typed as T (e.g., K8s Pod, Service, etc.) |

#### Returns

`void`

***

### url

```ts
url: string;
```

Defined in: [lib/k8s/api/v2/webSocket.ts:54](https://github.com/SaikiaMan/headlamp/blob/ee95cceb66fcc81536dc274d41f70372e38b6d87/frontend/src/lib/k8s/api/v2/webSocket.ts#L54)

The WebSocket endpoint URL to connect to.
Should be a full URL including protocol and any query parameters.
Example: 'https://cluster.example.com/api/v1/pods/watch'
