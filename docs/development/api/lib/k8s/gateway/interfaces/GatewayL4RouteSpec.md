# Interface: GatewayL4RouteSpec

Defined in: [lib/k8s/gateway.ts:70](https://github.com/mishradwaterlaw/headlamp/blob/5944f5d61f18c73406d793336db6720caacb9130/frontend/src/lib/k8s/gateway.ts#L70)

The common spec shared by Gateway API L4 route resources.

## Indexable

```ts
[key: string]: any
```

## Properties

### parentRefs?

```ts
optional parentRefs?: GatewayParentReference[];
```

Defined in: [lib/k8s/gateway.ts:71](https://github.com/mishradwaterlaw/headlamp/blob/5944f5d61f18c73406d793336db6720caacb9130/frontend/src/lib/k8s/gateway.ts#L71)

***

### rules?

```ts
optional rules?: GatewayL4RouteRule[];
```

Defined in: [lib/k8s/gateway.ts:72](https://github.com/mishradwaterlaw/headlamp/blob/5944f5d61f18c73406d793336db6720caacb9130/frontend/src/lib/k8s/gateway.ts#L72)
