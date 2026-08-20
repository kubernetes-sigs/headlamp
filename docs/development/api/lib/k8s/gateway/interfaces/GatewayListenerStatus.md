# Interface: GatewayListenerStatus

Defined in: [lib/k8s/gateway.ts:106](https://github.com/mishradwaterlaw/headlamp/blob/5944f5d61f18c73406d793336db6720caacb9130/frontend/src/lib/k8s/gateway.ts#L106)

ListenerStatus is the status associated with a Listener.

## See

[https://gateway-api.sigs.k8s.io/reference/api-spec/main/spec/#listenerstatus](https://gateway-api.sigs.k8s.io/reference/api-spec/main/spec/#listenerstatus) Gateway API reference for ListenerStatus

## Properties

### attachedRoutes

```ts
attachedRoutes: number;
```

Defined in: [lib/k8s/gateway.ts:108](https://github.com/mishradwaterlaw/headlamp/blob/5944f5d61f18c73406d793336db6720caacb9130/frontend/src/lib/k8s/gateway.ts#L108)

***

### conditions

```ts
conditions: KubeCondition[];
```

Defined in: [lib/k8s/gateway.ts:110](https://github.com/mishradwaterlaw/headlamp/blob/5944f5d61f18c73406d793336db6720caacb9130/frontend/src/lib/k8s/gateway.ts#L110)

***

### name

```ts
name: string;
```

Defined in: [lib/k8s/gateway.ts:107](https://github.com/mishradwaterlaw/headlamp/blob/5944f5d61f18c73406d793336db6720caacb9130/frontend/src/lib/k8s/gateway.ts#L107)

***

### supportedKinds

```ts
supportedKinds: any[];
```

Defined in: [lib/k8s/gateway.ts:109](https://github.com/mishradwaterlaw/headlamp/blob/5944f5d61f18c73406d793336db6720caacb9130/frontend/src/lib/k8s/gateway.ts#L109)
