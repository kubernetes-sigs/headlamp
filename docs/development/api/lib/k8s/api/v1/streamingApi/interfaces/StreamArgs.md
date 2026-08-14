# Interface: StreamArgs

Defined in: [lib/k8s/api/v1/streamingApi.ts:290](https://github.com/SaikiaMan/headlamp/blob/ee95cceb66fcc81536dc274d41f70372e38b6d87/frontend/src/lib/k8s/api/v1/streamingApi.ts#L290)

Configure a stream with... StreamArgs.

## Extended by

- [`ExecOptions`](../../../../pod/interfaces/ExecOptions.md)

## Properties

### additionalProtocols?

```ts
optional additionalProtocols?: string[];
```

Defined in: [lib/k8s/api/v1/streamingApi.ts:294](https://github.com/SaikiaMan/headlamp/blob/ee95cceb66fcc81536dc274d41f70372e38b6d87/frontend/src/lib/k8s/api/v1/streamingApi.ts#L294)

Additional WebSocket protocols to use when connecting.

***

### cluster?

```ts
optional cluster?: string;
```

Defined in: [lib/k8s/api/v1/streamingApi.ts:305](https://github.com/SaikiaMan/headlamp/blob/ee95cceb66fcc81536dc274d41f70372e38b6d87/frontend/src/lib/k8s/api/v1/streamingApi.ts#L305)

***

### connectCb?

```ts
optional connectCb?: () => void;
```

Defined in: [lib/k8s/api/v1/streamingApi.ts:296](https://github.com/SaikiaMan/headlamp/blob/ee95cceb66fcc81536dc274d41f70372e38b6d87/frontend/src/lib/k8s/api/v1/streamingApi.ts#L296)

A callback function to execute when the WebSocket connection is established.

#### Returns

`void`

***

### failCb?

```ts
optional failCb?: () => void;
```

Defined in: [lib/k8s/api/v1/streamingApi.ts:300](https://github.com/SaikiaMan/headlamp/blob/ee95cceb66fcc81536dc274d41f70372e38b6d87/frontend/src/lib/k8s/api/v1/streamingApi.ts#L300)

A callback function to execute when the WebSocket connection fails.

#### Returns

`void`

***

### isJson?

```ts
optional isJson?: boolean;
```

Defined in: [lib/k8s/api/v1/streamingApi.ts:292](https://github.com/SaikiaMan/headlamp/blob/ee95cceb66fcc81536dc274d41f70372e38b6d87/frontend/src/lib/k8s/api/v1/streamingApi.ts#L292)

Whether the stream is expected to receive JSON data.

***

### reconnectOnFailure?

```ts
optional reconnectOnFailure?: boolean;
```

Defined in: [lib/k8s/api/v1/streamingApi.ts:298](https://github.com/SaikiaMan/headlamp/blob/ee95cceb66fcc81536dc274d41f70372e38b6d87/frontend/src/lib/k8s/api/v1/streamingApi.ts#L298)

Whether to attempt to reconnect the WebSocket connection if it fails.

***

### stderr?

```ts
optional stderr?: boolean;
```

Defined in: [lib/k8s/api/v1/streamingApi.ts:304](https://github.com/SaikiaMan/headlamp/blob/ee95cceb66fcc81536dc274d41f70372e38b6d87/frontend/src/lib/k8s/api/v1/streamingApi.ts#L304)

***

### stdin?

```ts
optional stdin?: boolean;
```

Defined in: [lib/k8s/api/v1/streamingApi.ts:302](https://github.com/SaikiaMan/headlamp/blob/ee95cceb66fcc81536dc274d41f70372e38b6d87/frontend/src/lib/k8s/api/v1/streamingApi.ts#L302)

***

### stdout?

```ts
optional stdout?: boolean;
```

Defined in: [lib/k8s/api/v1/streamingApi.ts:303](https://github.com/SaikiaMan/headlamp/blob/ee95cceb66fcc81536dc274d41f70372e38b6d87/frontend/src/lib/k8s/api/v1/streamingApi.ts#L303)

***

### tty?

```ts
optional tty?: boolean;
```

Defined in: [lib/k8s/api/v1/streamingApi.ts:301](https://github.com/SaikiaMan/headlamp/blob/ee95cceb66fcc81536dc274d41f70372e38b6d87/frontend/src/lib/k8s/api/v1/streamingApi.ts#L301)
