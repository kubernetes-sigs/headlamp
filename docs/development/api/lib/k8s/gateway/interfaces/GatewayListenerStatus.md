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

[src/lib/k8s/gateway.ts:54](https://github.com/zyzzmohit/headlamp/blob/5c039e27e936e8174f45bbfcab8979134d6fb3fc/frontend/src/lib/k8s/gateway.ts#L54)

***

### conditions

```ts
conditions: KubeCondition[];
```

#### Defined in

[src/lib/k8s/gateway.ts:56](https://github.com/zyzzmohit/headlamp/blob/5c039e27e936e8174f45bbfcab8979134d6fb3fc/frontend/src/lib/k8s/gateway.ts#L56)

***

### name

```ts
name: string;
```

#### Defined in

[src/lib/k8s/gateway.ts:53](https://github.com/zyzzmohit/headlamp/blob/5c039e27e936e8174f45bbfcab8979134d6fb3fc/frontend/src/lib/k8s/gateway.ts#L53)

***

### supportedKinds

```ts
supportedKinds: any[];
```

#### Defined in

[src/lib/k8s/gateway.ts:55](https://github.com/zyzzmohit/headlamp/blob/5c039e27e936e8174f45bbfcab8979134d6fb3fc/frontend/src/lib/k8s/gateway.ts#L55)
