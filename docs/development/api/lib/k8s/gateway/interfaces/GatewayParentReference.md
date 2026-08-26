# Interface: GatewayParentReference

Defined in: [lib/k8s/gateway.ts:25](https://github.com/mishradwaterlaw/headlamp/blob/5944f5d61f18c73406d793336db6720caacb9130/frontend/src/lib/k8s/gateway.ts#L25)

ParentReference identifies an API object (usually a Gateway) that can be considered a parent of this resource (usually a route).

## See

[https://gateway-api.sigs.k8s.io/reference/api-spec/main/spec/#parentreference](https://gateway-api.sigs.k8s.io/reference/api-spec/main/spec/#parentreference) Gateway API reference for ParentReference

## Properties

### group?

```ts
optional group?: string;
```

Defined in: [lib/k8s/gateway.ts:26](https://github.com/mishradwaterlaw/headlamp/blob/5944f5d61f18c73406d793336db6720caacb9130/frontend/src/lib/k8s/gateway.ts#L26)

***

### kind?

```ts
optional kind?: string;
```

Defined in: [lib/k8s/gateway.ts:27](https://github.com/mishradwaterlaw/headlamp/blob/5944f5d61f18c73406d793336db6720caacb9130/frontend/src/lib/k8s/gateway.ts#L27)

***

### name

```ts
name: string;
```

Defined in: [lib/k8s/gateway.ts:30](https://github.com/mishradwaterlaw/headlamp/blob/5944f5d61f18c73406d793336db6720caacb9130/frontend/src/lib/k8s/gateway.ts#L30)

***

### namespace?

```ts
optional namespace?: string;
```

Defined in: [lib/k8s/gateway.ts:28](https://github.com/mishradwaterlaw/headlamp/blob/5944f5d61f18c73406d793336db6720caacb9130/frontend/src/lib/k8s/gateway.ts#L28)

***

### port?

```ts
optional port?: number;
```

Defined in: [lib/k8s/gateway.ts:31](https://github.com/mishradwaterlaw/headlamp/blob/5944f5d61f18c73406d793336db6720caacb9130/frontend/src/lib/k8s/gateway.ts#L31)

***

### sectionName?

```ts
optional sectionName?: string;
```

Defined in: [lib/k8s/gateway.ts:29](https://github.com/mishradwaterlaw/headlamp/blob/5944f5d61f18c73406d793336db6720caacb9130/frontend/src/lib/k8s/gateway.ts#L29)
