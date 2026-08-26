# Interface: ExecOptions

Defined in: [lib/k8s/pod.ts:89](https://github.com/kehach07/headlamp/blob/7b4a853c98ea719589ddb64289f86ea94e08b877/frontend/src/lib/k8s/pod.ts#L89)

Configure a stream with... StreamArgs.

## Extends

- [`StreamArgs`](../../api/v1/streamingApi/interfaces/StreamArgs.md)

## Properties

### additionalProtocols?

```ts
optional additionalProtocols?: string[];
```

Defined in: [lib/k8s/api/v1/streamingApi.ts:310](https://github.com/kehach07/headlamp/blob/7b4a853c98ea719589ddb64289f86ea94e08b877/frontend/src/lib/k8s/api/v1/streamingApi.ts#L310)

Additional WebSocket protocols to use when connecting.

#### Inherited from

[`StreamArgs`](../../api/v1/streamingApi/interfaces/StreamArgs.md).[`additionalProtocols`](../../api/v1/streamingApi/interfaces/StreamArgs.md#additionalprotocols)

***

### cluster?

```ts
optional cluster?: string;
```

Defined in: [lib/k8s/api/v1/streamingApi.ts:321](https://github.com/kehach07/headlamp/blob/7b4a853c98ea719589ddb64289f86ea94e08b877/frontend/src/lib/k8s/api/v1/streamingApi.ts#L321)

#### Inherited from

[`StreamArgs`](../../api/v1/streamingApi/interfaces/StreamArgs.md).[`cluster`](../../api/v1/streamingApi/interfaces/StreamArgs.md#cluster)

***

### command?

```ts
optional command?: string[];
```

Defined in: [lib/k8s/pod.ts:90](https://github.com/kehach07/headlamp/blob/7b4a853c98ea719589ddb64289f86ea94e08b877/frontend/src/lib/k8s/pod.ts#L90)

***

### connectCb?

```ts
optional connectCb?: () => void;
```

Defined in: [lib/k8s/api/v1/streamingApi.ts:312](https://github.com/kehach07/headlamp/blob/7b4a853c98ea719589ddb64289f86ea94e08b877/frontend/src/lib/k8s/api/v1/streamingApi.ts#L312)

A callback function to execute when the WebSocket connection is established.

#### Returns

`void`

#### Inherited from

[`StreamArgs`](../../api/v1/streamingApi/interfaces/StreamArgs.md).[`connectCb`](../../api/v1/streamingApi/interfaces/StreamArgs.md#connectcb)

***

### failCb?

```ts
optional failCb?: () => void;
```

Defined in: [lib/k8s/api/v1/streamingApi.ts:316](https://github.com/kehach07/headlamp/blob/7b4a853c98ea719589ddb64289f86ea94e08b877/frontend/src/lib/k8s/api/v1/streamingApi.ts#L316)

A callback function to execute when the WebSocket connection fails.

#### Returns

`void`

#### Inherited from

[`StreamArgs`](../../api/v1/streamingApi/interfaces/StreamArgs.md).[`failCb`](../../api/v1/streamingApi/interfaces/StreamArgs.md#failcb)

***

### isJson?

```ts
optional isJson?: boolean;
```

Defined in: [lib/k8s/api/v1/streamingApi.ts:308](https://github.com/kehach07/headlamp/blob/7b4a853c98ea719589ddb64289f86ea94e08b877/frontend/src/lib/k8s/api/v1/streamingApi.ts#L308)

Whether the stream is expected to receive JSON data.

#### Inherited from

[`StreamArgs`](../../api/v1/streamingApi/interfaces/StreamArgs.md).[`isJson`](../../api/v1/streamingApi/interfaces/StreamArgs.md#isjson)

***

### reconnectOnFailure?

```ts
optional reconnectOnFailure?: boolean;
```

Defined in: [lib/k8s/api/v1/streamingApi.ts:314](https://github.com/kehach07/headlamp/blob/7b4a853c98ea719589ddb64289f86ea94e08b877/frontend/src/lib/k8s/api/v1/streamingApi.ts#L314)

Whether to attempt to reconnect the WebSocket connection if it fails.

#### Inherited from

[`StreamArgs`](../../api/v1/streamingApi/interfaces/StreamArgs.md).[`reconnectOnFailure`](../../api/v1/streamingApi/interfaces/StreamArgs.md#reconnectonfailure)

***

### stderr?

```ts
optional stderr?: boolean;
```

Defined in: [lib/k8s/api/v1/streamingApi.ts:320](https://github.com/kehach07/headlamp/blob/7b4a853c98ea719589ddb64289f86ea94e08b877/frontend/src/lib/k8s/api/v1/streamingApi.ts#L320)

#### Inherited from

[`StreamArgs`](../../api/v1/streamingApi/interfaces/StreamArgs.md).[`stderr`](../../api/v1/streamingApi/interfaces/StreamArgs.md#stderr)

***

### stdin?

```ts
optional stdin?: boolean;
```

Defined in: [lib/k8s/api/v1/streamingApi.ts:318](https://github.com/kehach07/headlamp/blob/7b4a853c98ea719589ddb64289f86ea94e08b877/frontend/src/lib/k8s/api/v1/streamingApi.ts#L318)

#### Inherited from

[`StreamArgs`](../../api/v1/streamingApi/interfaces/StreamArgs.md).[`stdin`](../../api/v1/streamingApi/interfaces/StreamArgs.md#stdin)

***

### stdout?

```ts
optional stdout?: boolean;
```

Defined in: [lib/k8s/api/v1/streamingApi.ts:319](https://github.com/kehach07/headlamp/blob/7b4a853c98ea719589ddb64289f86ea94e08b877/frontend/src/lib/k8s/api/v1/streamingApi.ts#L319)

#### Inherited from

[`StreamArgs`](../../api/v1/streamingApi/interfaces/StreamArgs.md).[`stdout`](../../api/v1/streamingApi/interfaces/StreamArgs.md#stdout)

***

### tty?

```ts
optional tty?: boolean;
```

Defined in: [lib/k8s/api/v1/streamingApi.ts:317](https://github.com/kehach07/headlamp/blob/7b4a853c98ea719589ddb64289f86ea94e08b877/frontend/src/lib/k8s/api/v1/streamingApi.ts#L317)

#### Inherited from

[`StreamArgs`](../../api/v1/streamingApi/interfaces/StreamArgs.md).[`tty`](../../api/v1/streamingApi/interfaces/StreamArgs.md#tty)
