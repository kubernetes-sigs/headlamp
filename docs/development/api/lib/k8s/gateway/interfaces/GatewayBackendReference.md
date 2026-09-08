# Interface: GatewayBackendReference

Defined in: [lib/k8s/gateway.ts:39](https://github.com/Rucha0901/headlamp/blob/db946f8d81732ed8fbecf4752fa84b86cab70c8b/frontend/src/lib/k8s/gateway.ts#L39)

BackendObjectReference identifies a backend API object to which a route can forward traffic.

## See

[https://gateway-api.sigs.k8s.io/reference/api-spec/main/spec/#backendobjectreference](https://gateway-api.sigs.k8s.io/reference/api-spec/main/spec/#backendobjectreference) Gateway API reference for BackendObjectReference

## Properties

### group?

```ts
optional group?: string;
```

Defined in: [lib/k8s/gateway.ts:40](https://github.com/Rucha0901/headlamp/blob/db946f8d81732ed8fbecf4752fa84b86cab70c8b/frontend/src/lib/k8s/gateway.ts#L40)

***

### kind?

```ts
optional kind?: string;
```

Defined in: [lib/k8s/gateway.ts:41](https://github.com/Rucha0901/headlamp/blob/db946f8d81732ed8fbecf4752fa84b86cab70c8b/frontend/src/lib/k8s/gateway.ts#L41)

***

### name

```ts
name: string;
```

Defined in: [lib/k8s/gateway.ts:42](https://github.com/Rucha0901/headlamp/blob/db946f8d81732ed8fbecf4752fa84b86cab70c8b/frontend/src/lib/k8s/gateway.ts#L42)

***

### namespace?

```ts
optional namespace?: string;
```

Defined in: [lib/k8s/gateway.ts:43](https://github.com/Rucha0901/headlamp/blob/db946f8d81732ed8fbecf4752fa84b86cab70c8b/frontend/src/lib/k8s/gateway.ts#L43)

***

### port?

```ts
optional port?: number;
```

Defined in: [lib/k8s/gateway.ts:44](https://github.com/Rucha0901/headlamp/blob/db946f8d81732ed8fbecf4752fa84b86cab70c8b/frontend/src/lib/k8s/gateway.ts#L44)

***

### weight?

```ts
optional weight?: number;
```

Defined in: [lib/k8s/gateway.ts:45](https://github.com/Rucha0901/headlamp/blob/db946f8d81732ed8fbecf4752fa84b86cab70c8b/frontend/src/lib/k8s/gateway.ts#L45)
