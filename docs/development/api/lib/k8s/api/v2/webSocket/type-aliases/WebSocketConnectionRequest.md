# Type Alias: WebSocketConnectionRequest\<T\>

```ts
type WebSocketConnectionRequest<T>: object;
```

Configuration for establishing a WebSocket connection to watch Kubernetes resources.
Used by the multiplexer to manage multiple WebSocket connections efficiently.

## Type Parameters

| Type Parameter | Description |
| ------ | ------ |
| `T` | The expected type of data that will be received over the WebSocket |

## Type declaration

### cluster

```ts
cluster: string;
```

The Kubernetes cluster identifier to connect to.
Used for routing WebSocket messages in multi-cluster environments.

### onMessage()

```ts
onMessage: (data: T) => void;
```

Callback function that handles incoming messages from the WebSocket.

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `data` | `T` | The message payload, typed as T (e.g., K8s Pod, Service, etc.) |

#### Returns

`void`

### url

```ts
url: string;
```

The WebSocket endpoint URL to connect to.
Should be a full URL including protocol and any query parameters.
Example: 'https://cluster.example.com/api/v1/pods/watch'

## Defined in

[src/lib/k8s/api/v2/webSocket.ts:42](https://github.com/kubernetes-sigs/headlamp/blob/4f6ccb46282ab9a5d4439bf075672ad3d4cd1113/frontend/src/lib/k8s/api/v2/webSocket.ts#L42)
