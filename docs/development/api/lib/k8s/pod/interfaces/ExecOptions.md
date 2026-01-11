# Interface: ExecOptions

Configure a stream with... StreamArgs.

## Extends

- [`StreamArgs`](../../api/v1/streamingApi/interfaces/StreamArgs.md)

## Properties

### additionalProtocols?

```ts
optional additionalProtocols: string[];
```

Additional WebSocket protocols to use when connecting.

#### Inherited from

[`StreamArgs`](../../api/v1/streamingApi/interfaces/StreamArgs.md).[`additionalProtocols`](../../api/v1/streamingApi/interfaces/StreamArgs.md#additionalprotocols)

#### Defined in

[src/lib/k8s/api/v1/streamingApi.ts:274](https://github.com/kubernetes-sigs/headlamp/blob/4f6ccb46282ab9a5d4439bf075672ad3d4cd1113/frontend/src/lib/k8s/api/v1/streamingApi.ts#L274)

***

### cluster?

```ts
optional cluster: string;
```

#### Inherited from

[`StreamArgs`](../../api/v1/streamingApi/interfaces/StreamArgs.md).[`cluster`](../../api/v1/streamingApi/interfaces/StreamArgs.md#cluster)

#### Defined in

[src/lib/k8s/api/v1/streamingApi.ts:285](https://github.com/kubernetes-sigs/headlamp/blob/4f6ccb46282ab9a5d4439bf075672ad3d4cd1113/frontend/src/lib/k8s/api/v1/streamingApi.ts#L285)

***

### command?

```ts
optional command: string[];
```

#### Defined in

[src/lib/k8s/pod.ts:69](https://github.com/kubernetes-sigs/headlamp/blob/4f6ccb46282ab9a5d4439bf075672ad3d4cd1113/frontend/src/lib/k8s/pod.ts#L69)

***

### connectCb()?

```ts
optional connectCb: () => void;
```

A callback function to execute when the WebSocket connection is established.

#### Returns

`void`

#### Inherited from

[`StreamArgs`](../../api/v1/streamingApi/interfaces/StreamArgs.md).[`connectCb`](../../api/v1/streamingApi/interfaces/StreamArgs.md#connectcb)

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

#### Inherited from

[`StreamArgs`](../../api/v1/streamingApi/interfaces/StreamArgs.md).[`failCb`](../../api/v1/streamingApi/interfaces/StreamArgs.md#failcb)

#### Defined in

[src/lib/k8s/api/v1/streamingApi.ts:280](https://github.com/kubernetes-sigs/headlamp/blob/4f6ccb46282ab9a5d4439bf075672ad3d4cd1113/frontend/src/lib/k8s/api/v1/streamingApi.ts#L280)

***

### isJson?

```ts
optional isJson: boolean;
```

Whether the stream is expected to receive JSON data.

#### Inherited from

[`StreamArgs`](../../api/v1/streamingApi/interfaces/StreamArgs.md).[`isJson`](../../api/v1/streamingApi/interfaces/StreamArgs.md#isjson)

#### Defined in

[src/lib/k8s/api/v1/streamingApi.ts:272](https://github.com/kubernetes-sigs/headlamp/blob/4f6ccb46282ab9a5d4439bf075672ad3d4cd1113/frontend/src/lib/k8s/api/v1/streamingApi.ts#L272)

***

### reconnectOnFailure?

```ts
optional reconnectOnFailure: boolean;
```

Whether to attempt to reconnect the WebSocket connection if it fails.

#### Inherited from

[`StreamArgs`](../../api/v1/streamingApi/interfaces/StreamArgs.md).[`reconnectOnFailure`](../../api/v1/streamingApi/interfaces/StreamArgs.md#reconnectonfailure)

#### Defined in

[src/lib/k8s/api/v1/streamingApi.ts:278](https://github.com/kubernetes-sigs/headlamp/blob/4f6ccb46282ab9a5d4439bf075672ad3d4cd1113/frontend/src/lib/k8s/api/v1/streamingApi.ts#L278)

***

### stderr?

```ts
optional stderr: boolean;
```

#### Inherited from

[`StreamArgs`](../../api/v1/streamingApi/interfaces/StreamArgs.md).[`stderr`](../../api/v1/streamingApi/interfaces/StreamArgs.md#stderr)

#### Defined in

[src/lib/k8s/api/v1/streamingApi.ts:284](https://github.com/kubernetes-sigs/headlamp/blob/4f6ccb46282ab9a5d4439bf075672ad3d4cd1113/frontend/src/lib/k8s/api/v1/streamingApi.ts#L284)

***

### stdin?

```ts
optional stdin: boolean;
```

#### Inherited from

[`StreamArgs`](../../api/v1/streamingApi/interfaces/StreamArgs.md).[`stdin`](../../api/v1/streamingApi/interfaces/StreamArgs.md#stdin)

#### Defined in

[src/lib/k8s/api/v1/streamingApi.ts:282](https://github.com/kubernetes-sigs/headlamp/blob/4f6ccb46282ab9a5d4439bf075672ad3d4cd1113/frontend/src/lib/k8s/api/v1/streamingApi.ts#L282)

***

### stdout?

```ts
optional stdout: boolean;
```

#### Inherited from

[`StreamArgs`](../../api/v1/streamingApi/interfaces/StreamArgs.md).[`stdout`](../../api/v1/streamingApi/interfaces/StreamArgs.md#stdout)

#### Defined in

[src/lib/k8s/api/v1/streamingApi.ts:283](https://github.com/kubernetes-sigs/headlamp/blob/4f6ccb46282ab9a5d4439bf075672ad3d4cd1113/frontend/src/lib/k8s/api/v1/streamingApi.ts#L283)

***

### tty?

```ts
optional tty: boolean;
```

#### Inherited from

[`StreamArgs`](../../api/v1/streamingApi/interfaces/StreamArgs.md).[`tty`](../../api/v1/streamingApi/interfaces/StreamArgs.md#tty)

#### Defined in

[src/lib/k8s/api/v1/streamingApi.ts:281](https://github.com/kubernetes-sigs/headlamp/blob/4f6ccb46282ab9a5d4439bf075672ad3d4cd1113/frontend/src/lib/k8s/api/v1/streamingApi.ts#L281)
