# Interface: GatewayL4RouteRule

Defined in: [lib/k8s/gateway.ts:53](https://github.com/Rucha0901/headlamp/blob/db946f8d81732ed8fbecf4752fa84b86cab70c8b/frontend/src/lib/k8s/gateway.ts#L53)

L4RouteRule defines a TCPRoute or UDPRoute rule and its backend references.

## See

[https://gateway-api.sigs.k8s.io/reference/api-spec/main/spec/#tcprouterule](https://gateway-api.sigs.k8s.io/reference/api-spec/main/spec/#tcprouterule) Gateway API reference for TCPRouteRule

## Properties

### backendRefs?

```ts
optional backendRefs?: GatewayBackendReference[];
```

Defined in: [lib/k8s/gateway.ts:55](https://github.com/Rucha0901/headlamp/blob/db946f8d81732ed8fbecf4752fa84b86cab70c8b/frontend/src/lib/k8s/gateway.ts#L55)

***

### name?

```ts
optional name?: string;
```

Defined in: [lib/k8s/gateway.ts:54](https://github.com/Rucha0901/headlamp/blob/db946f8d81732ed8fbecf4752fa84b86cab70c8b/frontend/src/lib/k8s/gateway.ts#L54)
