# Interface: HTTPRouteRule

Defined in: [lib/k8s/httpRoute.ts:28](https://github.com/SaikiaMan/headlamp/blob/ee95cceb66fcc81536dc274d41f70372e38b6d87/frontend/src/lib/k8s/httpRoute.ts#L28)

HTTPRouteRule defines semantics for matching an HTTP request based on conditions (matches), processing it (filters), and forwarding the request to an API object (backendRefs).

## See

 - [https://gateway-api.sigs.k8s.io/reference/spec/#gateway.networking.k8s.io/v1.HTTPRouteRule](https://gateway-api.sigs.k8s.io/reference/spec/#gateway.networking.k8s.io/v1.HTTPRouteRule) Gateway API reference for HTTPRouteRule
 - [https://gateway-api.sigs.k8s.io/api-types/httproute/#rules](https://gateway-api.sigs.k8s.io/api-types/httproute/#rules) Gateway API definition for HTTPRouteRule

## Indexable

```ts
[key: string]: any
```

## Properties

### backendRefs?

```ts
optional backendRefs?: any[];
```

Defined in: [lib/k8s/httpRoute.ts:30](https://github.com/SaikiaMan/headlamp/blob/ee95cceb66fcc81536dc274d41f70372e38b6d87/frontend/src/lib/k8s/httpRoute.ts#L30)

***

### matches?

```ts
optional matches?: any[];
```

Defined in: [lib/k8s/httpRoute.ts:31](https://github.com/SaikiaMan/headlamp/blob/ee95cceb66fcc81536dc274d41f70372e38b6d87/frontend/src/lib/k8s/httpRoute.ts#L31)

***

### name?

```ts
optional name?: string;
```

Defined in: [lib/k8s/httpRoute.ts:29](https://github.com/SaikiaMan/headlamp/blob/ee95cceb66fcc81536dc274d41f70372e38b6d87/frontend/src/lib/k8s/httpRoute.ts#L29)
