# Interface: GRPCRouteMatch

Defined in: [lib/k8s/grpcRoute.ts:26](https://github.com/mishradwaterlaw/headlamp/blob/5944f5d61f18c73406d793336db6720caacb9130/frontend/src/lib/k8s/grpcRoute.ts#L26)

GRPCRouteMatch defines the predicate used to match requests to a given action.

## See

[https://gateway-api.sigs.k8s.io/reference/api-spec/main/spec/#grpcroutematch](https://gateway-api.sigs.k8s.io/reference/api-spec/main/spec/#grpcroutematch) Gateway API reference for GRPCRouteMatch

## Properties

### headers?

```ts
optional headers?: object[];
```

Defined in: [lib/k8s/grpcRoute.ts:32](https://github.com/mishradwaterlaw/headlamp/blob/5944f5d61f18c73406d793336db6720caacb9130/frontend/src/lib/k8s/grpcRoute.ts#L32)

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

Defined in: [lib/k8s/grpcRoute.ts:27](https://github.com/mishradwaterlaw/headlamp/blob/5944f5d61f18c73406d793336db6720caacb9130/frontend/src/lib/k8s/grpcRoute.ts#L27)

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
