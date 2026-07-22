# Interface: GRPCRouteMatch

Defined in: [lib/k8s/grpcRoute.ts:26](https://github.com/SaikiaMan/headlamp/blob/ee95cceb66fcc81536dc274d41f70372e38b6d87/frontend/src/lib/k8s/grpcRoute.ts#L26)

GRPCRouteMatch defines the predicate used to match requests to a given action.

## See

[https://gateway-api.sigs.k8s.io/reference/spec/#gateway.networking.k8s.io/v1.GRPCRouteMatch](https://gateway-api.sigs.k8s.io/reference/spec/#gateway.networking.k8s.io/v1.GRPCRouteMatch) Gateway API reference for GRPCRouteMatch

## Properties

### headers?

```ts
optional headers?: object[];
```

Defined in: [lib/k8s/grpcRoute.ts:32](https://github.com/SaikiaMan/headlamp/blob/ee95cceb66fcc81536dc274d41f70372e38b6d87/frontend/src/lib/k8s/grpcRoute.ts#L32)

#### name

```ts
name: string;
```

#### type?

```ts
optional type?: string;
```

#### value

```ts
value: string;
```

***

### method?

```ts
optional method?: object;
```

Defined in: [lib/k8s/grpcRoute.ts:27](https://github.com/SaikiaMan/headlamp/blob/ee95cceb66fcc81536dc274d41f70372e38b6d87/frontend/src/lib/k8s/grpcRoute.ts#L27)

#### method?

```ts
optional method?: string;
```

#### service?

```ts
optional service?: string;
```

#### type?

```ts
optional type?: string;
```
