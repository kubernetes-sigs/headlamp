# Interface: WebSocketMessage

Defined in: [lib/k8s/api/v2/multiplexer.ts:528](https://github.com/SaikiaMan/headlamp/blob/ee95cceb66fcc81536dc274d41f70372e38b6d87/frontend/src/lib/k8s/api/v2/multiplexer.ts#L528)

Message format for WebSocket communication between client and server.
Used to manage subscriptions to Kubernetes resource updates.

## Properties

### clusterId

```ts
clusterId: string;
```

Defined in: [lib/k8s/api/v2/multiplexer.ts:533](https://github.com/SaikiaMan/headlamp/blob/ee95cceb66fcc81536dc274d41f70372e38b6d87/frontend/src/lib/k8s/api/v2/multiplexer.ts#L533)

Cluster identifier used to route messages to the correct Kubernetes cluster.
This is particularly important in multi-cluster environments.

***

### path

```ts
path: string;
```

Defined in: [lib/k8s/api/v2/multiplexer.ts:539](https://github.com/SaikiaMan/headlamp/blob/ee95cceb66fcc81536dc274d41f70372e38b6d87/frontend/src/lib/k8s/api/v2/multiplexer.ts#L539)

API resource path that identifies the Kubernetes resource being watched.
Example: '/api/v1/pods' or '/apis/apps/v1/deployments'

***

### query

```ts
query: string;
```

Defined in: [lib/k8s/api/v2/multiplexer.ts:545](https://github.com/SaikiaMan/headlamp/blob/ee95cceb66fcc81536dc274d41f70372e38b6d87/frontend/src/lib/k8s/api/v2/multiplexer.ts#L545)

Query parameters for filtering or modifying the watch request.
Example: 'labelSelector=app%3Dnginx&fieldSelector=status.phase%3DRunning'

***

### type

```ts
type: "REQUEST" | "CLOSE" | "COMPLETE";
```

Defined in: [lib/k8s/api/v2/multiplexer.ts:559](https://github.com/SaikiaMan/headlamp/blob/ee95cceb66fcc81536dc274d41f70372e38b6d87/frontend/src/lib/k8s/api/v2/multiplexer.ts#L559)

Message type that indicates the purpose of the message:
- REQUEST: Client is requesting to start watching a resource
- CLOSE: Client wants to stop watching a resource
- COMPLETE: Server indicates the watch request has completed (e.g., due to timeout or error)

***

### userId

```ts
userId: string;
```

Defined in: [lib/k8s/api/v2/multiplexer.ts:551](https://github.com/SaikiaMan/headlamp/blob/ee95cceb66fcc81536dc274d41f70372e38b6d87/frontend/src/lib/k8s/api/v2/multiplexer.ts#L551)

User identifier for authentication and authorization.
Used to ensure users only receive updates for resources they have access to.
