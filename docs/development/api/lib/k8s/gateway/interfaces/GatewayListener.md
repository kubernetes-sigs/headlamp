# Interface: GatewayListener

Listener embodies the concept of a logical endpoint where a Gateway accepts network connections.

## See

[https://gateway-api.sigs.k8s.io/reference/spec/#gateway.networking.k8s.io/v1.Listener](https://gateway-api.sigs.k8s.io/reference/spec/#gateway.networking.k8s.io/v1.Listener) Gateway API reference for Listener

## Indexable

 \[`key`: `string`\]: `any`

## Properties

### hostname

```ts
hostname: string;
```

#### Defined in

[src/lib/k8s/gateway.ts:40](https://github.com/kubernetes-sigs/headlamp/blob/4f6ccb46282ab9a5d4439bf075672ad3d4cd1113/frontend/src/lib/k8s/gateway.ts#L40)

***

### name

```ts
name: string;
```

#### Defined in

[src/lib/k8s/gateway.ts:41](https://github.com/kubernetes-sigs/headlamp/blob/4f6ccb46282ab9a5d4439bf075672ad3d4cd1113/frontend/src/lib/k8s/gateway.ts#L41)

***

### port

```ts
port: number;
```

#### Defined in

[src/lib/k8s/gateway.ts:43](https://github.com/kubernetes-sigs/headlamp/blob/4f6ccb46282ab9a5d4439bf075672ad3d4cd1113/frontend/src/lib/k8s/gateway.ts#L43)

***

### protocol

```ts
protocol: string;
```

#### Defined in

[src/lib/k8s/gateway.ts:42](https://github.com/kubernetes-sigs/headlamp/blob/4f6ccb46282ab9a5d4439bf075672ad3d4cd1113/frontend/src/lib/k8s/gateway.ts#L42)
