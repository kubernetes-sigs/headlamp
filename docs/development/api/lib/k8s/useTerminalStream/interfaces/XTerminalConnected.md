# Interface: XTerminalConnected

Terminal instance with connection state.

## Properties

### connected

```ts
connected: boolean;
```

Whether WebSocket is connected

#### Defined in

[src/lib/k8s/useTerminalStream.ts:44](https://github.com/zyzzmohit/headlamp/blob/5c039e27e936e8174f45bbfcab8979134d6fb3fc/frontend/src/lib/k8s/useTerminalStream.ts#L44)

***

### reconnectOnEnter

```ts
reconnectOnEnter: boolean;
```

Whether to reconnect on Enter key

#### Defined in

[src/lib/k8s/useTerminalStream.ts:45](https://github.com/zyzzmohit/headlamp/blob/5c039e27e936e8174f45bbfcab8979134d6fb3fc/frontend/src/lib/k8s/useTerminalStream.ts#L45)

***

### xterm

```ts
xterm: Terminal;
```

XTerm.js terminal instance

#### Defined in

[src/lib/k8s/useTerminalStream.ts:43](https://github.com/zyzzmohit/headlamp/blob/5c039e27e936e8174f45bbfcab8979134d6fb3fc/frontend/src/lib/k8s/useTerminalStream.ts#L43)
