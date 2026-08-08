# Interface: XTerminalConnected

Defined in: [lib/k8s/useTerminalStream.ts:44](https://github.com/SaikiaMan/headlamp/blob/ee95cceb66fcc81536dc274d41f70372e38b6d87/frontend/src/lib/k8s/useTerminalStream.ts#L44)

Terminal instance with connection state.

## Properties

### connected

```ts
connected: boolean;
```

Defined in: [lib/k8s/useTerminalStream.ts:46](https://github.com/SaikiaMan/headlamp/blob/ee95cceb66fcc81536dc274d41f70372e38b6d87/frontend/src/lib/k8s/useTerminalStream.ts#L46)

Whether WebSocket is connected

***

### reconnectOnEnter

```ts
reconnectOnEnter: boolean;
```

Defined in: [lib/k8s/useTerminalStream.ts:47](https://github.com/SaikiaMan/headlamp/blob/ee95cceb66fcc81536dc274d41f70372e38b6d87/frontend/src/lib/k8s/useTerminalStream.ts#L47)

Whether to reconnect on Enter key

***

### xterm

```ts
xterm: Terminal;
```

Defined in: [lib/k8s/useTerminalStream.ts:45](https://github.com/SaikiaMan/headlamp/blob/ee95cceb66fcc81536dc274d41f70372e38b6d87/frontend/src/lib/k8s/useTerminalStream.ts#L45)

XTerm.js terminal instance
