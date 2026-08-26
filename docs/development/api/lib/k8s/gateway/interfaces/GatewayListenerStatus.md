# Interface: GatewayListenerStatus

Defined in: [lib/k8s/gateway.ts:52](https://github.com/kehach07/headlamp/blob/7b4a853c98ea719589ddb64289f86ea94e08b877/frontend/src/lib/k8s/gateway.ts#L52)

ListenerStatus is the status associated with a Listener.

## See

[https://gateway-api.sigs.k8s.io/reference/api-spec/main/spec/#listenerstatus](https://gateway-api.sigs.k8s.io/reference/api-spec/main/spec/#listenerstatus) Gateway API reference for ListenerStatus

## Properties

### attachedRoutes

```ts
attachedRoutes: number;
```

Defined in: [lib/k8s/gateway.ts:54](https://github.com/kehach07/headlamp/blob/7b4a853c98ea719589ddb64289f86ea94e08b877/frontend/src/lib/k8s/gateway.ts#L54)

***

### conditions

```ts
conditions: KubeCondition[];
```

Defined in: [lib/k8s/gateway.ts:56](https://github.com/kehach07/headlamp/blob/7b4a853c98ea719589ddb64289f86ea94e08b877/frontend/src/lib/k8s/gateway.ts#L56)

***

### name

```ts
name: string;
```

Defined in: [lib/k8s/gateway.ts:53](https://github.com/kehach07/headlamp/blob/7b4a853c98ea719589ddb64289f86ea94e08b877/frontend/src/lib/k8s/gateway.ts#L53)

***

### supportedKinds

```ts
supportedKinds: any[];
```

Defined in: [lib/k8s/gateway.ts:55](https://github.com/kehach07/headlamp/blob/7b4a853c98ea719589ddb64289f86ea94e08b877/frontend/src/lib/k8s/gateway.ts#L55)
