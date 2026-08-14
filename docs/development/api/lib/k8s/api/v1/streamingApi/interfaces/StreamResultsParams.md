# Interface: StreamResultsParams

Defined in: [lib/k8s/api/v1/streamingApi.ts:136](https://github.com/SaikiaMan/headlamp/blob/ee95cceb66fcc81536dc274d41f70372e38b6d87/frontend/src/lib/k8s/api/v1/streamingApi.ts#L136)

Configuration options for establishing a stream to a cluster.
Groups the cluster name along with the callbacks used to process incoming data and errors.

## Properties

### cb

```ts
cb: StreamResultsCb;
```

Defined in: [lib/k8s/api/v1/streamingApi.ts:137](https://github.com/SaikiaMan/headlamp/blob/ee95cceb66fcc81536dc274d41f70372e38b6d87/frontend/src/lib/k8s/api/v1/streamingApi.ts#L137)

***

### cluster?

```ts
optional cluster?: string;
```

Defined in: [lib/k8s/api/v1/streamingApi.ts:139](https://github.com/SaikiaMan/headlamp/blob/ee95cceb66fcc81536dc274d41f70372e38b6d87/frontend/src/lib/k8s/api/v1/streamingApi.ts#L139)

***

### errCb

```ts
errCb: StreamErrCb;
```

Defined in: [lib/k8s/api/v1/streamingApi.ts:138](https://github.com/SaikiaMan/headlamp/blob/ee95cceb66fcc81536dc274d41f70372e38b6d87/frontend/src/lib/k8s/api/v1/streamingApi.ts#L138)
