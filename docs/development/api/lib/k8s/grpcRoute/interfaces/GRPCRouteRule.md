# Interface: GRPCRouteRule

Defined in: [lib/k8s/grpcRoute.ts:45](https://github.com/SaikiaMan/headlamp/blob/ee95cceb66fcc81536dc274d41f70372e38b6d87/frontend/src/lib/k8s/grpcRoute.ts#L45)

GRPCRouteRule defines semantics for matching a gRPC request based on conditions (matches),
processing it (filters), and forwarding the request to an API object (backendRefs).

## See

[https://gateway-api.sigs.k8s.io/reference/spec/#gateway.networking.k8s.io/v1.GRPCRouteRule](https://gateway-api.sigs.k8s.io/reference/spec/#gateway.networking.k8s.io/v1.GRPCRouteRule) Gateway API reference for GRPCRouteRule

## Properties

### backendRefs?

```ts
optional backendRefs?: object[];
```

Defined in: [lib/k8s/grpcRoute.ts:52](https://github.com/SaikiaMan/headlamp/blob/ee95cceb66fcc81536dc274d41f70372e38b6d87/frontend/src/lib/k8s/grpcRoute.ts#L52)

#### group?

```ts
optional group?: string;
```

#### kind?

```ts
optional kind?: string;
```

#### name

```ts
name: string;
```

#### namespace?

```ts
optional namespace?: string;
```

#### port?

```ts
optional port?: number;
```

#### weight?

```ts
optional weight?: number;
```

***

### filters?

```ts
optional filters?: object[];
```

Defined in: [lib/k8s/grpcRoute.ts:48](https://github.com/SaikiaMan/headlamp/blob/ee95cceb66fcc81536dc274d41f70372e38b6d87/frontend/src/lib/k8s/grpcRoute.ts#L48)

#### Index Signature

```ts
[key: string]: any
```

#### type

```ts
type: string;
```

***

### matches?

```ts
optional matches?: GRPCRouteMatch[];
```

Defined in: [lib/k8s/grpcRoute.ts:47](https://github.com/SaikiaMan/headlamp/blob/ee95cceb66fcc81536dc274d41f70372e38b6d87/frontend/src/lib/k8s/grpcRoute.ts#L47)

***

### name?

```ts
optional name?: string;
```

Defined in: [lib/k8s/grpcRoute.ts:46](https://github.com/SaikiaMan/headlamp/blob/ee95cceb66fcc81536dc274d41f70372e38b6d87/frontend/src/lib/k8s/grpcRoute.ts#L46)
