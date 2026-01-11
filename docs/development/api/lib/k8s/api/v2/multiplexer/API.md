# lib/k8s/api/v2/multiplexer

## Index

### Interfaces

| Interface | Description |
| ------ | ------ |
| [WebSocketMessage](interfaces/WebSocketMessage.md) | Message format for WebSocket communication between client and server. Used to manage subscriptions to Kubernetes resource updates. |

### Variables

| Variable | Description |
| ------ | ------ |
| [MULTIPLEXER\_ENDPOINT](variables/MULTIPLEXER_ENDPOINT.md) | Multiplexer endpoint for WebSocket connections This endpoint allows multiple subscriptions over a single connection |
| [WebSocketManager](variables/WebSocketManager.md) | WebSocket manager to handle connections across the application. Provides a singleton-like interface for managing WebSocket connections, subscriptions, and message handling. Implements connection multiplexing to optimize network usage. |

### Functions

| Function | Description |
| ------ | ------ |
| [useWebSocket](functions/useWebSocket.md) | React hook for WebSocket subscription to Kubernetes resources |
