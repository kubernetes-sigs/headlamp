# Interface: KubeGRPCRoute

GRPCRoute is a Gateway API type for specifying routing behavior of gRPC requests from a Gateway listener to an API object, i.e. Service.

## See

 - [https://gateway-api.sigs.k8s.io/reference/spec/#gateway.networking.k8s.io/v1.GRPCRoute](https://gateway-api.sigs.k8s.io/reference/spec/#gateway.networking.k8s.io/v1.GRPCRoute) Gateway API reference for GRPCRoute
 - [https://gateway-api.sigs.k8s.io/api-types/grpcroute/](https://gateway-api.sigs.k8s.io/api-types/grpcroute/) Gateway API definition for GRPCRoute

## Extends

- [`KubeObjectInterface`](../../KubeObject/interfaces/KubeObjectInterface.md)

## Properties

### actionType?

```ts
optional actionType: any;
```

#### Inherited from

[`KubeObjectInterface`](../../KubeObject/interfaces/KubeObjectInterface.md).[`actionType`](../../KubeObject/interfaces/KubeObjectInterface.md#actiontype)

#### Defined in

[src/lib/k8s/KubeObject.ts:728](https://github.com/kubernetes-sigs/headlamp/blob/4f6ccb46282ab9a5d4439bf075672ad3d4cd1113/frontend/src/lib/k8s/KubeObject.ts#L728)

***

### apiVersion?

```ts
optional apiVersion: string;
```

#### Inherited from

[`KubeObjectInterface`](../../KubeObject/interfaces/KubeObjectInterface.md).[`apiVersion`](../../KubeObject/interfaces/KubeObjectInterface.md#apiversion)

#### Defined in

[src/lib/k8s/KubeObject.ts:723](https://github.com/kubernetes-sigs/headlamp/blob/4f6ccb46282ab9a5d4439bf075672ad3d4cd1113/frontend/src/lib/k8s/KubeObject.ts#L723)

***

### items?

```ts
optional items: any[];
```

#### Inherited from

[`KubeObjectInterface`](../../KubeObject/interfaces/KubeObjectInterface.md).[`items`](../../KubeObject/interfaces/KubeObjectInterface.md#items)

#### Defined in

[src/lib/k8s/KubeObject.ts:727](https://github.com/kubernetes-sigs/headlamp/blob/4f6ccb46282ab9a5d4439bf075672ad3d4cd1113/frontend/src/lib/k8s/KubeObject.ts#L727)

***

### key?

```ts
optional key: any;
```

#### Inherited from

[`KubeObjectInterface`](../../KubeObject/interfaces/KubeObjectInterface.md).[`key`](../../KubeObject/interfaces/KubeObjectInterface.md#key)

#### Defined in

[src/lib/k8s/KubeObject.ts:730](https://github.com/kubernetes-sigs/headlamp/blob/4f6ccb46282ab9a5d4439bf075672ad3d4cd1113/frontend/src/lib/k8s/KubeObject.ts#L730)

***

### kind

```ts
kind: string;
```

Kind is a string value representing the REST resource this object represents.
Servers may infer this from the endpoint the client submits requests to.

In CamelCase.

Cannot be updated.

#### See

[more info](https://git.k8s.io/community/contributors/devel/sig-architecture/api-conventions.md#types-kinds)

#### Inherited from

[`KubeObjectInterface`](../../KubeObject/interfaces/KubeObjectInterface.md).[`kind`](../../KubeObject/interfaces/KubeObjectInterface.md#kind)

#### Defined in

[src/lib/k8s/KubeObject.ts:722](https://github.com/kubernetes-sigs/headlamp/blob/4f6ccb46282ab9a5d4439bf075672ad3d4cd1113/frontend/src/lib/k8s/KubeObject.ts#L722)

***

### lastTimestamp?

```ts
optional lastTimestamp: string;
```

#### Inherited from

[`KubeObjectInterface`](../../KubeObject/interfaces/KubeObjectInterface.md).[`lastTimestamp`](../../KubeObject/interfaces/KubeObjectInterface.md#lasttimestamp)

#### Defined in

[src/lib/k8s/KubeObject.ts:729](https://github.com/kubernetes-sigs/headlamp/blob/4f6ccb46282ab9a5d4439bf075672ad3d4cd1113/frontend/src/lib/k8s/KubeObject.ts#L729)

***

### metadata

```ts
metadata: KubeMetadata;
```

#### Inherited from

[`KubeObjectInterface`](../../KubeObject/interfaces/KubeObjectInterface.md).[`metadata`](../../KubeObject/interfaces/KubeObjectInterface.md#metadata)

#### Defined in

[src/lib/k8s/KubeObject.ts:724](https://github.com/kubernetes-sigs/headlamp/blob/4f6ccb46282ab9a5d4439bf075672ad3d4cd1113/frontend/src/lib/k8s/KubeObject.ts#L724)

***

### spec

```ts
spec: object;
```

#### Index Signature

 \[`key`: `string`\]: `any`

#### parentRefs

```ts
parentRefs: GatewayParentReference[];
```

#### Overrides

[`KubeObjectInterface`](../../KubeObject/interfaces/KubeObjectInterface.md).[`spec`](../../KubeObject/interfaces/KubeObjectInterface.md#spec)

#### Defined in

[src/lib/k8s/grpcRoute.ts:29](https://github.com/kubernetes-sigs/headlamp/blob/4f6ccb46282ab9a5d4439bf075672ad3d4cd1113/frontend/src/lib/k8s/grpcRoute.ts#L29)

***

### status?

```ts
optional status: any;
```

#### Inherited from

[`KubeObjectInterface`](../../KubeObject/interfaces/KubeObjectInterface.md).[`status`](../../KubeObject/interfaces/KubeObjectInterface.md#status)

#### Defined in

[src/lib/k8s/KubeObject.ts:726](https://github.com/kubernetes-sigs/headlamp/blob/4f6ccb46282ab9a5d4439bf075672ad3d4cd1113/frontend/src/lib/k8s/KubeObject.ts#L726)
