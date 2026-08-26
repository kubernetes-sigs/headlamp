# Interface: GatewayL4RouteRule

Defined in: [lib/k8s/gateway.ts:53](https://github.com/mishradwaterlaw/headlamp/blob/5944f5d61f18c73406d793336db6720caacb9130/frontend/src/lib/k8s/gateway.ts#L53)

L4RouteRule defines a TCPRoute or UDPRoute rule and its backend references.

## See

[https://gateway-api.sigs.k8s.io/reference/api-spec/main/spec/#tcprouterule](https://gateway-api.sigs.k8s.io/reference/api-spec/main/spec/#tcprouterule) Gateway API reference for TCPRouteRule

## Properties

### backendRefs?

```ts
optional backendRefs?: GatewayBackendReference[];
```

Defined in: [lib/k8s/gateway.ts:55](https://github.com/mishradwaterlaw/headlamp/blob/5944f5d61f18c73406d793336db6720caacb9130/frontend/src/lib/k8s/gateway.ts#L55)

***

### name?

```ts
optional name?: string;
```

Defined in: [lib/k8s/gateway.ts:54](https://github.com/mishradwaterlaw/headlamp/blob/5944f5d61f18c73406d793336db6720caacb9130/frontend/src/lib/k8s/gateway.ts#L54)
