# Interface: GatewayListenerStatus

ListenerStatus is the status associated with a Listener.

## See

[https://gateway-api.sigs.k8s.io/reference/spec/#gateway.networking.k8s.io/v1.ListenerStatus](https://gateway-api.sigs.k8s.io/reference/spec/#gateway.networking.k8s.io/v1.ListenerStatus) Gateway API reference for ListenerStatus

## Properties

### attachedRoutes

```ts
attachedRoutes: number;
```

#### Defined in

[src/lib/k8s/gateway.ts:54](https://github.com/kubernetes-sigs/headlamp/blob/4f6ccb46282ab9a5d4439bf075672ad3d4cd1113/frontend/src/lib/k8s/gateway.ts#L54)

***

### conditions

```ts
conditions: KubeCondition[];
```

#### Defined in

[src/lib/k8s/gateway.ts:56](https://github.com/kubernetes-sigs/headlamp/blob/4f6ccb46282ab9a5d4439bf075672ad3d4cd1113/frontend/src/lib/k8s/gateway.ts#L56)

***

### name

```ts
name: string;
```

#### Defined in

[src/lib/k8s/gateway.ts:53](https://github.com/kubernetes-sigs/headlamp/blob/4f6ccb46282ab9a5d4439bf075672ad3d4cd1113/frontend/src/lib/k8s/gateway.ts#L53)

***

### supportedKinds

```ts
supportedKinds: any[];
```

#### Defined in

[src/lib/k8s/gateway.ts:55](https://github.com/kubernetes-sigs/headlamp/blob/4f6ccb46282ab9a5d4439bf075672ad3d4cd1113/frontend/src/lib/k8s/gateway.ts#L55)
