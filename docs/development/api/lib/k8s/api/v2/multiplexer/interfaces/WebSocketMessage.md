# Interface: WebSocketMessage

Message format for WebSocket communication between client and server.
Used to manage subscriptions to Kubernetes resource updates.

## Properties

### clusterId

```ts
clusterId: string;
```

Cluster identifier used to route messages to the correct Kubernetes cluster.
This is particularly important in multi-cluster environments.

#### Defined in

[src/lib/k8s/api/v2/multiplexer.ts:416](https://github.com/kubernetes-sigs/headlamp/blob/4f6ccb46282ab9a5d4439bf075672ad3d4cd1113/frontend/src/lib/k8s/api/v2/multiplexer.ts#L416)

***

### path

```ts
path: string;
```

API resource path that identifies the Kubernetes resource being watched.
Example: '/api/v1/pods' or '/apis/apps/v1/deployments'

#### Defined in

[src/lib/k8s/api/v2/multiplexer.ts:422](https://github.com/kubernetes-sigs/headlamp/blob/4f6ccb46282ab9a5d4439bf075672ad3d4cd1113/frontend/src/lib/k8s/api/v2/multiplexer.ts#L422)

***

### query

```ts
query: string;
```

Query parameters for filtering or modifying the watch request.
Example: 'labelSelector=app%3Dnginx&fieldSelector=status.phase%3DRunning'

#### Defined in

[src/lib/k8s/api/v2/multiplexer.ts:428](https://github.com/kubernetes-sigs/headlamp/blob/4f6ccb46282ab9a5d4439bf075672ad3d4cd1113/frontend/src/lib/k8s/api/v2/multiplexer.ts#L428)

***

### type

```ts
type: "REQUEST" | "CLOSE" | "COMPLETE";
```

Message type that indicates the purpose of the message:
- REQUEST: Client is requesting to start watching a resource
- CLOSE: Client wants to stop watching a resource
- COMPLETE: Server indicates the watch request has completed (e.g., due to timeout or error)

#### Defined in

[src/lib/k8s/api/v2/multiplexer.ts:442](https://github.com/kubernetes-sigs/headlamp/blob/4f6ccb46282ab9a5d4439bf075672ad3d4cd1113/frontend/src/lib/k8s/api/v2/multiplexer.ts#L442)

***

### userId

```ts
userId: string;
```

User identifier for authentication and authorization.
Used to ensure users only receive updates for resources they have access to.

#### Defined in

[src/lib/k8s/api/v2/multiplexer.ts:434](https://github.com/kubernetes-sigs/headlamp/blob/4f6ccb46282ab9a5d4439bf075672ad3d4cd1113/frontend/src/lib/k8s/api/v2/multiplexer.ts#L434)
