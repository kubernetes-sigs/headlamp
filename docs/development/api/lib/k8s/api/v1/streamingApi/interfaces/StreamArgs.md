# Interface: StreamArgs

Configure a stream with... StreamArgs.

## Extended by

- [`ExecOptions`](../../../../pod/interfaces/ExecOptions.md)

## Properties

### additionalProtocols?

```ts
optional additionalProtocols: string[];
```

Additional WebSocket protocols to use when connecting.

#### Defined in

[src/lib/k8s/api/v1/streamingApi.ts:274](https://github.com/kubernetes-sigs/headlamp/blob/4f6ccb46282ab9a5d4439bf075672ad3d4cd1113/frontend/src/lib/k8s/api/v1/streamingApi.ts#L274)

***

### cluster?

```ts
optional cluster: string;
```

#### Defined in

[src/lib/k8s/api/v1/streamingApi.ts:285](https://github.com/kubernetes-sigs/headlamp/blob/4f6ccb46282ab9a5d4439bf075672ad3d4cd1113/frontend/src/lib/k8s/api/v1/streamingApi.ts#L285)

***

### connectCb()?

```ts
optional connectCb: () => void;
```

A callback function to execute when the WebSocket connection is established.

#### Returns

`void`

#### Defined in

[src/lib/k8s/api/v1/streamingApi.ts:276](https://github.com/kubernetes-sigs/headlamp/blob/4f6ccb46282ab9a5d4439bf075672ad3d4cd1113/frontend/src/lib/k8s/api/v1/streamingApi.ts#L276)

***

### failCb()?

```ts
optional failCb: () => void;
```

A callback function to execute when the WebSocket connection fails.

#### Returns

`void`

#### Defined in

[src/lib/k8s/api/v1/streamingApi.ts:280](https://github.com/kubernetes-sigs/headlamp/blob/4f6ccb46282ab9a5d4439bf075672ad3d4cd1113/frontend/src/lib/k8s/api/v1/streamingApi.ts#L280)

***

### isJson?

```ts
optional isJson: boolean;
```

Whether the stream is expected to receive JSON data.

#### Defined in

[src/lib/k8s/api/v1/streamingApi.ts:272](https://github.com/kubernetes-sigs/headlamp/blob/4f6ccb46282ab9a5d4439bf075672ad3d4cd1113/frontend/src/lib/k8s/api/v1/streamingApi.ts#L272)

***

### reconnectOnFailure?

```ts
optional reconnectOnFailure: boolean;
```

Whether to attempt to reconnect the WebSocket connection if it fails.

#### Defined in

[src/lib/k8s/api/v1/streamingApi.ts:278](https://github.com/kubernetes-sigs/headlamp/blob/4f6ccb46282ab9a5d4439bf075672ad3d4cd1113/frontend/src/lib/k8s/api/v1/streamingApi.ts#L278)

***

### stderr?

```ts
optional stderr: boolean;
```

#### Defined in

[src/lib/k8s/api/v1/streamingApi.ts:284](https://github.com/kubernetes-sigs/headlamp/blob/4f6ccb46282ab9a5d4439bf075672ad3d4cd1113/frontend/src/lib/k8s/api/v1/streamingApi.ts#L284)

***

### stdin?

```ts
optional stdin: boolean;
```

#### Defined in

[src/lib/k8s/api/v1/streamingApi.ts:282](https://github.com/kubernetes-sigs/headlamp/blob/4f6ccb46282ab9a5d4439bf075672ad3d4cd1113/frontend/src/lib/k8s/api/v1/streamingApi.ts#L282)

***

### stdout?

```ts
optional stdout: boolean;
```

#### Defined in

[src/lib/k8s/api/v1/streamingApi.ts:283](https://github.com/kubernetes-sigs/headlamp/blob/4f6ccb46282ab9a5d4439bf075672ad3d4cd1113/frontend/src/lib/k8s/api/v1/streamingApi.ts#L283)

***

### tty?

```ts
optional tty: boolean;
```

#### Defined in

[src/lib/k8s/api/v1/streamingApi.ts:281](https://github.com/kubernetes-sigs/headlamp/blob/4f6ccb46282ab9a5d4439bf075672ad3d4cd1113/frontend/src/lib/k8s/api/v1/streamingApi.ts#L281)
