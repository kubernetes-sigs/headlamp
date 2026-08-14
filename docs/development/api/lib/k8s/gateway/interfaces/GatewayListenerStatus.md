# Interface: GatewayListenerStatus

Defined in: [lib/k8s/gateway.ts:52](https://github.com/mishradwaterlaw/headlamp/blob/fa170d1f3805256c3d561c39c317801d0e2be4b3/frontend/src/lib/k8s/gateway.ts#L52)

ListenerStatus is the status associated with a Listener.

## See

[https://gateway-api.sigs.k8s.io/reference/api-spec/main/spec/#listenerstatus](https://gateway-api.sigs.k8s.io/reference/api-spec/main/spec/#listenerstatus) Gateway API reference for ListenerStatus

## Properties

### attachedRoutes

```ts
attachedRoutes: number;
```

Defined in: [lib/k8s/gateway.ts:54](https://github.com/mishradwaterlaw/headlamp/blob/fa170d1f3805256c3d561c39c317801d0e2be4b3/frontend/src/lib/k8s/gateway.ts#L54)

***

### conditions

```ts
conditions: KubeCondition[];
```

Defined in: [lib/k8s/gateway.ts:56](https://github.com/mishradwaterlaw/headlamp/blob/fa170d1f3805256c3d561c39c317801d0e2be4b3/frontend/src/lib/k8s/gateway.ts#L56)

***

### name

```ts
name: string;
```

Defined in: [lib/k8s/gateway.ts:53](https://github.com/mishradwaterlaw/headlamp/blob/fa170d1f3805256c3d561c39c317801d0e2be4b3/frontend/src/lib/k8s/gateway.ts#L53)

***

### supportedKinds

```ts
supportedKinds: any[];
```

Defined in: [lib/k8s/gateway.ts:55](https://github.com/mishradwaterlaw/headlamp/blob/fa170d1f3805256c3d561c39c317801d0e2be4b3/frontend/src/lib/k8s/gateway.ts#L55)
