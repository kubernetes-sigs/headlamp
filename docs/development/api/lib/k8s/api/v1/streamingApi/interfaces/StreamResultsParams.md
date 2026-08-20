# Interface: StreamResultsParams

Defined in: [lib/k8s/api/v1/streamingApi.ts:144](https://github.com/kehach07/headlamp/blob/7b4a853c98ea719589ddb64289f86ea94e08b877/frontend/src/lib/k8s/api/v1/streamingApi.ts#L144)

Configuration options for establishing a stream to a cluster.
Groups the cluster name along with the callbacks used to process incoming data and errors.

## Properties

### cb

```ts
cb: StreamResultsCb;
```

Defined in: [lib/k8s/api/v1/streamingApi.ts:145](https://github.com/kehach07/headlamp/blob/7b4a853c98ea719589ddb64289f86ea94e08b877/frontend/src/lib/k8s/api/v1/streamingApi.ts#L145)

***

### cluster?

```ts
optional cluster?: string;
```

Defined in: [lib/k8s/api/v1/streamingApi.ts:147](https://github.com/kehach07/headlamp/blob/7b4a853c98ea719589ddb64289f86ea94e08b877/frontend/src/lib/k8s/api/v1/streamingApi.ts#L147)

***

### errCb

```ts
errCb: StreamErrCb;
```

Defined in: [lib/k8s/api/v1/streamingApi.ts:146](https://github.com/kehach07/headlamp/blob/7b4a853c98ea719589ddb64289f86ea94e08b877/frontend/src/lib/k8s/api/v1/streamingApi.ts#L146)
