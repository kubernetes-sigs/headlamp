# Interface: GatewayRouteParentStatus

Defined in: [lib/k8s/gateway.ts:63](https://github.com/Rucha0901/headlamp/blob/db946f8d81732ed8fbecf4752fa84b86cab70c8b/frontend/src/lib/k8s/gateway.ts#L63)

RouteParentStatus describes the status of a route as seen by one of its parents.

## See

[https://gateway-api.sigs.k8s.io/reference/api-spec/main/spec/#routeparentstatus](https://gateway-api.sigs.k8s.io/reference/api-spec/main/spec/#routeparentstatus) Gateway API reference for RouteParentStatus

## Properties

### conditions?

```ts
optional conditions?: KubeCondition[];
```

Defined in: [lib/k8s/gateway.ts:66](https://github.com/Rucha0901/headlamp/blob/db946f8d81732ed8fbecf4752fa84b86cab70c8b/frontend/src/lib/k8s/gateway.ts#L66)

***

### controllerName

```ts
controllerName: string;
```

Defined in: [lib/k8s/gateway.ts:65](https://github.com/Rucha0901/headlamp/blob/db946f8d81732ed8fbecf4752fa84b86cab70c8b/frontend/src/lib/k8s/gateway.ts#L65)

***

### parentRef

```ts
parentRef: GatewayParentReference;
```

Defined in: [lib/k8s/gateway.ts:64](https://github.com/Rucha0901/headlamp/blob/db946f8d81732ed8fbecf4752fa84b86cab70c8b/frontend/src/lib/k8s/gateway.ts#L64)
