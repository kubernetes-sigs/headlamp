# Interface: TerminalStreamOptions

Options for configuring terminal stream behavior.

## Properties

### connectStream()

```ts
connectStream: (onData: (data: ArrayBuffer) => void) => Promise<object>;
```

Function that establishes stream connection

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `onData` | (`data`: `ArrayBuffer`) => `void` |

#### Returns

`Promise`\<`object`\>

##### initialMessage?

```ts
optional initialMessage: string;
```

##### stream

```ts
stream: any;
```

#### Defined in

[src/lib/k8s/useTerminalStream.ts:53](https://github.com/zyzzmohit/headlamp/blob/5c039e27e936e8174f45bbfcab8979134d6fb3fc/frontend/src/lib/k8s/useTerminalStream.ts#L53)

***

### containerRef

```ts
containerRef: null | HTMLElement;
```

Terminal container HTML element

#### Defined in

[src/lib/k8s/useTerminalStream.ts:58](https://github.com/zyzzmohit/headlamp/blob/5c039e27e936e8174f45bbfcab8979134d6fb3fc/frontend/src/lib/k8s/useTerminalStream.ts#L58)

***

### detectOS?

```ts
optional detectOS: boolean;
```

Whether to detect Windows OS

#### Defined in

[src/lib/k8s/useTerminalStream.ts:70](https://github.com/zyzzmohit/headlamp/blob/5c039e27e936e8174f45bbfcab8979134d6fb3fc/frontend/src/lib/k8s/useTerminalStream.ts#L70)

***

### enabled?

```ts
optional enabled: boolean;
```

Whether terminal should be active

#### Defined in

[src/lib/k8s/useTerminalStream.ts:60](https://github.com/zyzzmohit/headlamp/blob/5c039e27e936e8174f45bbfcab8979134d6fb3fc/frontend/src/lib/k8s/useTerminalStream.ts#L60)

***

### errorHandlers?

```ts
optional errorHandlers: object;
```

Custom error handlers

#### isShellNotFound()?

```ts
optional isShellNotFound: (channel: number, text: string) => boolean;
```

##### Parameters

| Parameter | Type |
| ------ | ------ |
| `channel` | `number` |
| `text` | `string` |

##### Returns

`boolean`

#### isSuccessfulExit()?

```ts
optional isSuccessfulExit: (channel: number, text: string) => boolean;
```

##### Parameters

| Parameter | Type |
| ------ | ------ |
| `channel` | `number` |
| `text` | `string` |

##### Returns

`boolean`

#### onConnectionFailed()?

```ts
optional onConnectionFailed: (xtermc: XTerminalConnected) => void;
```

##### Parameters

| Parameter | Type |
| ------ | ------ |
| `xtermc` | [`XTerminalConnected`](XTerminalConnected.md) |

##### Returns

`void`

#### Defined in

[src/lib/k8s/useTerminalStream.ts:64](https://github.com/zyzzmohit/headlamp/blob/5c039e27e936e8174f45bbfcab8979134d6fb3fc/frontend/src/lib/k8s/useTerminalStream.ts#L64)

***

### onClose()?

```ts
optional onClose: () => void;
```

Callback when terminal is closed

#### Returns

`void`

#### Defined in

[src/lib/k8s/useTerminalStream.ts:62](https://github.com/zyzzmohit/headlamp/blob/5c039e27e936e8174f45bbfcab8979134d6fb3fc/frontend/src/lib/k8s/useTerminalStream.ts#L62)

***

### xtermOptions?

```ts
optional xtermOptions: object;
```

Additional xterm configuration

#### cursorBlink?

```ts
optional cursorBlink: boolean;
```

#### cursorStyle?

```ts
optional cursorStyle: "block" | "underline" | "bar";
```

#### rows?

```ts
optional rows: number;
```

#### scrollback?

```ts
optional scrollback: number;
```

#### windowsMode?

```ts
optional windowsMode: boolean;
```

#### Defined in

[src/lib/k8s/useTerminalStream.ts:72](https://github.com/zyzzmohit/headlamp/blob/5c039e27e936e8174f45bbfcab8979134d6fb3fc/frontend/src/lib/k8s/useTerminalStream.ts#L72)
