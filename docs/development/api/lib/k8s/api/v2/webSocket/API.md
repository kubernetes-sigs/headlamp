# lib/k8s/api/v2/webSocket

## Index

### Type Aliases

| Type alias | Description |
| ------ | ------ |
| [WebSocketConnectionRequest](type-aliases/WebSocketConnectionRequest.md) | Configuration for establishing a WebSocket connection to watch Kubernetes resources. Used by the multiplexer to manage multiple WebSocket connections efficiently. |

### Variables

| Variable | Description |
| ------ | ------ |
| [BASE\_WS\_URL](variables/BASE_WS_URL.md) | - |

### Functions

| Function | Description |
| ------ | ------ |
| [getBaseWsUrl](functions/getBaseWsUrl.md) | Get the WebSocket base URL dynamically to support runtime port configuration |
| [openWebSocket](functions/openWebSocket.md) | Create new WebSocket connection to the backend |
| [useWebSockets](functions/useWebSockets.md) | Creates or joins mutiple existing WebSocket connections |
