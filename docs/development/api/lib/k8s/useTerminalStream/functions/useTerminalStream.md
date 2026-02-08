# Function: useTerminalStream()

```ts
function useTerminalStream(options: TerminalStreamOptions): object
```

React hook for managing WebSocket-based terminal streams.

Sets up an XTerm.js terminal with WebSocket communication, handles I/O channels,
resizing, and platform-specific keyboard handling. Auto-connects when enabled
and container is available.

## Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `options` | [`TerminalStreamOptions`](../interfaces/TerminalStreamOptions.md) | Configuration for terminal and stream connection |

## Returns

`object`

Terminal refs and send function for stdin

### fitAddonRef

```ts
fitAddonRef: MutableRefObject<null | FitAddon>;
```

### send()

```ts
send: (channel: number, data: string) => void;
```

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `channel` | `number` |
| `data` | `string` |

#### Returns

`void`

### streamRef

```ts
streamRef: MutableRefObject<any>;
```

### xtermRef

```ts
xtermRef: MutableRefObject<null | XTerminalConnected>;
```

## Defined in

[src/lib/k8s/useTerminalStream.ts:91](https://github.com/zyzzmohit/headlamp/blob/5c039e27e936e8174f45bbfcab8979134d6fb3fc/frontend/src/lib/k8s/useTerminalStream.ts#L91)
