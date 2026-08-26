# Interface: GatewayBackendReference

Defined in: [lib/k8s/gateway.ts:39](https://github.com/mishradwaterlaw/headlamp/blob/5944f5d61f18c73406d793336db6720caacb9130/frontend/src/lib/k8s/gateway.ts#L39)

BackendObjectReference identifies a backend API object to which a route can forward traffic.

## See

[https://gateway-api.sigs.k8s.io/reference/api-spec/main/spec/#backendobjectreference](https://gateway-api.sigs.k8s.io/reference/api-spec/main/spec/#backendobjectreference) Gateway API reference for BackendObjectReference

## Properties

### group?

```ts
optional group?: string;
```

Defined in: [lib/k8s/gateway.ts:40](https://github.com/mishradwaterlaw/headlamp/blob/5944f5d61f18c73406d793336db6720caacb9130/frontend/src/lib/k8s/gateway.ts#L40)

***

### kind?

```ts
optional kind?: string;
```

Defined in: [lib/k8s/gateway.ts:41](https://github.com/mishradwaterlaw/headlamp/blob/5944f5d61f18c73406d793336db6720caacb9130/frontend/src/lib/k8s/gateway.ts#L41)

***

### name

```ts
name: string;
```

Defined in: [lib/k8s/gateway.ts:42](https://github.com/mishradwaterlaw/headlamp/blob/5944f5d61f18c73406d793336db6720caacb9130/frontend/src/lib/k8s/gateway.ts#L42)

***

### namespace?

```ts
optional namespace?: string;
```

Defined in: [lib/k8s/gateway.ts:43](https://github.com/mishradwaterlaw/headlamp/blob/5944f5d61f18c73406d793336db6720caacb9130/frontend/src/lib/k8s/gateway.ts#L43)

***

### port?

```ts
optional port?: number;
```

Defined in: [lib/k8s/gateway.ts:44](https://github.com/mishradwaterlaw/headlamp/blob/5944f5d61f18c73406d793336db6720caacb9130/frontend/src/lib/k8s/gateway.ts#L44)

***

### weight?

```ts
optional weight?: number;
```

Defined in: [lib/k8s/gateway.ts:45](https://github.com/mishradwaterlaw/headlamp/blob/5944f5d61f18c73406d793336db6720caacb9130/frontend/src/lib/k8s/gateway.ts#L45)
