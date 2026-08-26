# Function: useTerminalStream()

```ts
function useTerminalStream(options: TerminalStreamOptions): object;
```

Defined in: [lib/k8s/useTerminalStream.ts:93](https://github.com/kehach07/headlamp/blob/7b4a853c98ea719589ddb64289f86ea94e08b877/frontend/src/lib/k8s/useTerminalStream.ts#L93)

React hook for managing WebSocket-based terminal streams.

Sets up an XTerm.js terminal with WebSocket communication, handles I/O channels,
resizing, and platform-specific keyboard handling. Auto-connects when enabled
and container is available.

## Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `options` | [`TerminalStreamOptions`](../interfaces/TerminalStreamOptions.md) | Configuration for terminal and stream connection |

## Returns

Terminal refs and send function for stdin

### fitAddonRef

```ts
fitAddonRef: MutableRefObject<FitAddon | null>;
```

### send

```ts
send: (channel: number, data: string) => void;
```

Sends data to the terminal stream on the specified channel.

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `channel` | `number` | I/O channel (stdin, resize, etc.) |
| `data` | `string` | Data string to send |

#### Returns

`void`

### streamRef

```ts
streamRef: MutableRefObject<any>;
```

### xtermRef

```ts
xtermRef: MutableRefObject<XTerminalConnected | null>;
```
