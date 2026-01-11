# Interface: GatewayParentReference

ParentReference identifies an API object (usually a Gateway) that can be considered a parent of this resource (usually a route).

## See

[https://gateway-api.sigs.k8s.io/reference/spec/#gateway.networking.k8s.io/v1.ParentReference](https://gateway-api.sigs.k8s.io/reference/spec/#gateway.networking.k8s.io/v1.ParentReference) Gateway API reference for ParentReference

## Properties

### group?

```ts
optional group: string;
```

#### Defined in

[src/lib/k8s/gateway.ts:26](https://github.com/kubernetes-sigs/headlamp/blob/4f6ccb46282ab9a5d4439bf075672ad3d4cd1113/frontend/src/lib/k8s/gateway.ts#L26)

***

### kind?

```ts
optional kind: string;
```

#### Defined in

[src/lib/k8s/gateway.ts:27](https://github.com/kubernetes-sigs/headlamp/blob/4f6ccb46282ab9a5d4439bf075672ad3d4cd1113/frontend/src/lib/k8s/gateway.ts#L27)

***

### name

```ts
name: string;
```

#### Defined in

[src/lib/k8s/gateway.ts:30](https://github.com/kubernetes-sigs/headlamp/blob/4f6ccb46282ab9a5d4439bf075672ad3d4cd1113/frontend/src/lib/k8s/gateway.ts#L30)

***

### namespace?

```ts
optional namespace: string;
```

#### Defined in

[src/lib/k8s/gateway.ts:28](https://github.com/kubernetes-sigs/headlamp/blob/4f6ccb46282ab9a5d4439bf075672ad3d4cd1113/frontend/src/lib/k8s/gateway.ts#L28)

***

### port?

```ts
optional port: number;
```

#### Defined in

[src/lib/k8s/gateway.ts:31](https://github.com/kubernetes-sigs/headlamp/blob/4f6ccb46282ab9a5d4439bf075672ad3d4cd1113/frontend/src/lib/k8s/gateway.ts#L31)

***

### sectionName?

```ts
optional sectionName: string;
```

#### Defined in

[src/lib/k8s/gateway.ts:29](https://github.com/kubernetes-sigs/headlamp/blob/4f6ccb46282ab9a5d4439bf075672ad3d4cd1113/frontend/src/lib/k8s/gateway.ts#L29)
