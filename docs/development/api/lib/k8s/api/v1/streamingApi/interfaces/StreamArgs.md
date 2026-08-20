# Interface: StreamArgs

Defined in: [lib/k8s/api/v1/streamingApi.ts:306](https://github.com/kehach07/headlamp/blob/7b4a853c98ea719589ddb64289f86ea94e08b877/frontend/src/lib/k8s/api/v1/streamingApi.ts#L306)

Configure a stream with... StreamArgs.

## Extended by

- [`ExecOptions`](../../../../pod/interfaces/ExecOptions.md)

## Properties

### additionalProtocols?

```ts
optional additionalProtocols?: string[];
```

Defined in: [lib/k8s/api/v1/streamingApi.ts:310](https://github.com/kehach07/headlamp/blob/7b4a853c98ea719589ddb64289f86ea94e08b877/frontend/src/lib/k8s/api/v1/streamingApi.ts#L310)

Additional WebSocket protocols to use when connecting.

***

### cluster?

```ts
optional cluster?: string;
```

Defined in: [lib/k8s/api/v1/streamingApi.ts:321](https://github.com/kehach07/headlamp/blob/7b4a853c98ea719589ddb64289f86ea94e08b877/frontend/src/lib/k8s/api/v1/streamingApi.ts#L321)

***

### connectCb?

```ts
optional connectCb?: () => void;
```

Defined in: [lib/k8s/api/v1/streamingApi.ts:312](https://github.com/kehach07/headlamp/blob/7b4a853c98ea719589ddb64289f86ea94e08b877/frontend/src/lib/k8s/api/v1/streamingApi.ts#L312)

A callback function to execute when the WebSocket connection is established.

#### Returns

`void`

***

### failCb?

```ts
optional failCb?: () => void;
```

Defined in: [lib/k8s/api/v1/streamingApi.ts:316](https://github.com/kehach07/headlamp/blob/7b4a853c98ea719589ddb64289f86ea94e08b877/frontend/src/lib/k8s/api/v1/streamingApi.ts#L316)

A callback function to execute when the WebSocket connection fails.

#### Returns

`void`

***

### isJson?

```ts
optional isJson?: boolean;
```

Defined in: [lib/k8s/api/v1/streamingApi.ts:308](https://github.com/kehach07/headlamp/blob/7b4a853c98ea719589ddb64289f86ea94e08b877/frontend/src/lib/k8s/api/v1/streamingApi.ts#L308)

Whether the stream is expected to receive JSON data.

***

### reconnectOnFailure?

```ts
optional reconnectOnFailure?: boolean;
```

Defined in: [lib/k8s/api/v1/streamingApi.ts:314](https://github.com/kehach07/headlamp/blob/7b4a853c98ea719589ddb64289f86ea94e08b877/frontend/src/lib/k8s/api/v1/streamingApi.ts#L314)

Whether to attempt to reconnect the WebSocket connection if it fails.

***

### stderr?

```ts
optional stderr?: boolean;
```

Defined in: [lib/k8s/api/v1/streamingApi.ts:320](https://github.com/kehach07/headlamp/blob/7b4a853c98ea719589ddb64289f86ea94e08b877/frontend/src/lib/k8s/api/v1/streamingApi.ts#L320)

***

### stdin?

```ts
optional stdin?: boolean;
```

Defined in: [lib/k8s/api/v1/streamingApi.ts:318](https://github.com/kehach07/headlamp/blob/7b4a853c98ea719589ddb64289f86ea94e08b877/frontend/src/lib/k8s/api/v1/streamingApi.ts#L318)

***

### stdout?

```ts
optional stdout?: boolean;
```

Defined in: [lib/k8s/api/v1/streamingApi.ts:319](https://github.com/kehach07/headlamp/blob/7b4a853c98ea719589ddb64289f86ea94e08b877/frontend/src/lib/k8s/api/v1/streamingApi.ts#L319)

***

### tty?

```ts
optional tty?: boolean;
```

Defined in: [lib/k8s/api/v1/streamingApi.ts:317](https://github.com/kehach07/headlamp/blob/7b4a853c98ea719589ddb64289f86ea94e08b877/frontend/src/lib/k8s/api/v1/streamingApi.ts#L317)
