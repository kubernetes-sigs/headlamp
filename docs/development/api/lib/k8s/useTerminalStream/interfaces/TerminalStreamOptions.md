# Interface: TerminalStreamOptions

Defined in: [lib/k8s/useTerminalStream.ts:53](https://github.com/SaikiaMan/headlamp/blob/ee95cceb66fcc81536dc274d41f70372e38b6d87/frontend/src/lib/k8s/useTerminalStream.ts#L53)

Options for configuring terminal stream behavior.

## Properties

### connectStream

```ts
connectStream: (onData: (data: ArrayBuffer) => void) => Promise<{
  initialMessage?: string;
  stream: any;
}>;
```

Defined in: [lib/k8s/useTerminalStream.ts:55](https://github.com/SaikiaMan/headlamp/blob/ee95cceb66fcc81536dc274d41f70372e38b6d87/frontend/src/lib/k8s/useTerminalStream.ts#L55)

Function that establishes stream connection

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `onData` | (`data`: `ArrayBuffer`) => `void` |

#### Returns

`Promise`\<\{
  `initialMessage?`: `string`;
  `stream`: `any`;
\}\>

***

### containerRef

```ts
containerRef: HTMLElement | null;
```

Defined in: [lib/k8s/useTerminalStream.ts:60](https://github.com/SaikiaMan/headlamp/blob/ee95cceb66fcc81536dc274d41f70372e38b6d87/frontend/src/lib/k8s/useTerminalStream.ts#L60)

Terminal container HTML element

***

### detectOS?

```ts
optional detectOS?: boolean;
```

Defined in: [lib/k8s/useTerminalStream.ts:72](https://github.com/SaikiaMan/headlamp/blob/ee95cceb66fcc81536dc274d41f70372e38b6d87/frontend/src/lib/k8s/useTerminalStream.ts#L72)

Whether to detect Windows OS

***

### enabled?

```ts
optional enabled?: boolean;
```

Defined in: [lib/k8s/useTerminalStream.ts:62](https://github.com/SaikiaMan/headlamp/blob/ee95cceb66fcc81536dc274d41f70372e38b6d87/frontend/src/lib/k8s/useTerminalStream.ts#L62)

Whether terminal should be active

***

### errorHandlers?

```ts
optional errorHandlers?: object;
```

Defined in: [lib/k8s/useTerminalStream.ts:66](https://github.com/SaikiaMan/headlamp/blob/ee95cceb66fcc81536dc274d41f70372e38b6d87/frontend/src/lib/k8s/useTerminalStream.ts#L66)

Custom error handlers

#### isShellNotFound?

```ts
optional isShellNotFound?: (channel: number, text: string) => boolean;
```

##### Parameters

| Parameter | Type |
| ------ | ------ |
| `channel` | `number` |
| `text` | `string` |

##### Returns

`boolean`

#### isSuccessfulExit?

```ts
optional isSuccessfulExit?: (channel: number, text: string) => boolean;
```

##### Parameters

| Parameter | Type |
| ------ | ------ |
| `channel` | `number` |
| `text` | `string` |

##### Returns

`boolean`

#### onConnectionFailed?

```ts
optional onConnectionFailed?: (xtermc: XTerminalConnected) => void;
```

##### Parameters

| Parameter | Type |
| ------ | ------ |
| `xtermc` | [`XTerminalConnected`](XTerminalConnected.md) |

##### Returns

`void`

***

### onClose?

```ts
optional onClose?: () => void;
```

Defined in: [lib/k8s/useTerminalStream.ts:64](https://github.com/SaikiaMan/headlamp/blob/ee95cceb66fcc81536dc274d41f70372e38b6d87/frontend/src/lib/k8s/useTerminalStream.ts#L64)

Callback when terminal is closed

#### Returns

`void`

***

### xtermOptions?

```ts
optional xtermOptions?: object;
```

Defined in: [lib/k8s/useTerminalStream.ts:74](https://github.com/SaikiaMan/headlamp/blob/ee95cceb66fcc81536dc274d41f70372e38b6d87/frontend/src/lib/k8s/useTerminalStream.ts#L74)

Additional xterm configuration

#### cursorBlink?

```ts
optional cursorBlink?: boolean;
```

#### cursorStyle?

```ts
optional cursorStyle?: "block" | "bar" | "underline";
```

#### rows?

```ts
optional rows?: number;
```

#### scrollback?

```ts
optional scrollback?: number;
```

#### windowsMode?

```ts
optional windowsMode?: boolean;
```
