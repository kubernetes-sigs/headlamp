# Interface: GatewayL4RouteSpec

Defined in: [lib/k8s/gateway.ts:70](https://github.com/Rucha0901/headlamp/blob/db946f8d81732ed8fbecf4752fa84b86cab70c8b/frontend/src/lib/k8s/gateway.ts#L70)

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

Defined in: [lib/k8s/gateway.ts:71](https://github.com/Rucha0901/headlamp/blob/db946f8d81732ed8fbecf4752fa84b86cab70c8b/frontend/src/lib/k8s/gateway.ts#L71)

***

### rules?

```ts
optional rules?: GatewayL4RouteRule[];
```

Defined in: [lib/k8s/gateway.ts:72](https://github.com/Rucha0901/headlamp/blob/db946f8d81732ed8fbecf4752fa84b86cab70c8b/frontend/src/lib/k8s/gateway.ts#L72)
