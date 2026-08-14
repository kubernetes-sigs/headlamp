# Interface: ExecOptions

Defined in: [lib/k8s/pod.ts:89](https://github.com/SaikiaMan/headlamp/blob/ee95cceb66fcc81536dc274d41f70372e38b6d87/frontend/src/lib/k8s/pod.ts#L89)

Configure a stream with... StreamArgs.

## Extends

- [`StreamArgs`](../../api/v1/streamingApi/interfaces/StreamArgs.md)

## Properties

### additionalProtocols?

```ts
optional additionalProtocols?: string[];
```

Defined in: [lib/k8s/api/v1/streamingApi.ts:294](https://github.com/SaikiaMan/headlamp/blob/ee95cceb66fcc81536dc274d41f70372e38b6d87/frontend/src/lib/k8s/api/v1/streamingApi.ts#L294)

Additional WebSocket protocols to use when connecting.

#### Inherited from

[`StreamArgs`](../../api/v1/streamingApi/interfaces/StreamArgs.md).[`additionalProtocols`](../../api/v1/streamingApi/interfaces/StreamArgs.md#additionalprotocols)

***

### cluster?

```ts
optional cluster?: string;
```

Defined in: [lib/k8s/api/v1/streamingApi.ts:305](https://github.com/SaikiaMan/headlamp/blob/ee95cceb66fcc81536dc274d41f70372e38b6d87/frontend/src/lib/k8s/api/v1/streamingApi.ts#L305)

#### Inherited from

[`StreamArgs`](../../api/v1/streamingApi/interfaces/StreamArgs.md).[`cluster`](../../api/v1/streamingApi/interfaces/StreamArgs.md#cluster)

***

### command?

```ts
optional command?: string[];
```

Defined in: [lib/k8s/pod.ts:90](https://github.com/SaikiaMan/headlamp/blob/ee95cceb66fcc81536dc274d41f70372e38b6d87/frontend/src/lib/k8s/pod.ts#L90)

***

### connectCb?

```ts
optional connectCb?: () => void;
```

Defined in: [lib/k8s/api/v1/streamingApi.ts:296](https://github.com/SaikiaMan/headlamp/blob/ee95cceb66fcc81536dc274d41f70372e38b6d87/frontend/src/lib/k8s/api/v1/streamingApi.ts#L296)

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

Defined in: [lib/k8s/api/v1/streamingApi.ts:300](https://github.com/SaikiaMan/headlamp/blob/ee95cceb66fcc81536dc274d41f70372e38b6d87/frontend/src/lib/k8s/api/v1/streamingApi.ts#L300)

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

Defined in: [lib/k8s/api/v1/streamingApi.ts:292](https://github.com/SaikiaMan/headlamp/blob/ee95cceb66fcc81536dc274d41f70372e38b6d87/frontend/src/lib/k8s/api/v1/streamingApi.ts#L292)

Whether the stream is expected to receive JSON data.

#### Inherited from

[`StreamArgs`](../../api/v1/streamingApi/interfaces/StreamArgs.md).[`isJson`](../../api/v1/streamingApi/interfaces/StreamArgs.md#isjson)

***

### reconnectOnFailure?

```ts
optional reconnectOnFailure?: boolean;
```

Defined in: [lib/k8s/api/v1/streamingApi.ts:298](https://github.com/SaikiaMan/headlamp/blob/ee95cceb66fcc81536dc274d41f70372e38b6d87/frontend/src/lib/k8s/api/v1/streamingApi.ts#L298)

Whether to attempt to reconnect the WebSocket connection if it fails.

#### Inherited from

[`StreamArgs`](../../api/v1/streamingApi/interfaces/StreamArgs.md).[`reconnectOnFailure`](../../api/v1/streamingApi/interfaces/StreamArgs.md#reconnectonfailure)

***

### stderr?

```ts
optional stderr?: boolean;
```

Defined in: [lib/k8s/api/v1/streamingApi.ts:304](https://github.com/SaikiaMan/headlamp/blob/ee95cceb66fcc81536dc274d41f70372e38b6d87/frontend/src/lib/k8s/api/v1/streamingApi.ts#L304)

#### Inherited from

[`StreamArgs`](../../api/v1/streamingApi/interfaces/StreamArgs.md).[`stderr`](../../api/v1/streamingApi/interfaces/StreamArgs.md#stderr)

***

### stdin?

```ts
optional stdin?: boolean;
```

Defined in: [lib/k8s/api/v1/streamingApi.ts:302](https://github.com/SaikiaMan/headlamp/blob/ee95cceb66fcc81536dc274d41f70372e38b6d87/frontend/src/lib/k8s/api/v1/streamingApi.ts#L302)

#### Inherited from

[`StreamArgs`](../../api/v1/streamingApi/interfaces/StreamArgs.md).[`stdin`](../../api/v1/streamingApi/interfaces/StreamArgs.md#stdin)

***

### stdout?

```ts
optional stdout?: boolean;
```

Defined in: [lib/k8s/api/v1/streamingApi.ts:303](https://github.com/SaikiaMan/headlamp/blob/ee95cceb66fcc81536dc274d41f70372e38b6d87/frontend/src/lib/k8s/api/v1/streamingApi.ts#L303)

#### Inherited from

[`StreamArgs`](../../api/v1/streamingApi/interfaces/StreamArgs.md).[`stdout`](../../api/v1/streamingApi/interfaces/StreamArgs.md#stdout)

***

### tty?

```ts
optional tty?: boolean;
```

Defined in: [lib/k8s/api/v1/streamingApi.ts:301](https://github.com/SaikiaMan/headlamp/blob/ee95cceb66fcc81536dc274d41f70372e38b6d87/frontend/src/lib/k8s/api/v1/streamingApi.ts#L301)

#### Inherited from

[`StreamArgs`](../../api/v1/streamingApi/interfaces/StreamArgs.md).[`tty`](../../api/v1/streamingApi/interfaces/StreamArgs.md#tty)
