# Interface: IngressBackend

Defined in: [lib/k8s/ingress.ts:47](https://github.com/SaikiaMan/headlamp/blob/ee95cceb66fcc81536dc274d41f70372e38b6d87/frontend/src/lib/k8s/ingress.ts#L47)

## Properties

### resource?

```ts
optional resource?: object;
```

Defined in: [lib/k8s/ingress.ts:55](https://github.com/SaikiaMan/headlamp/blob/ee95cceb66fcc81536dc274d41f70372e38b6d87/frontend/src/lib/k8s/ingress.ts#L55)

#### apiVersion

```ts
apiVersion: string;
```

#### kind

```ts
kind: string;
```

#### name

```ts
name: string;
```

***

### service?

```ts
optional service?: object;
```

Defined in: [lib/k8s/ingress.ts:48](https://github.com/SaikiaMan/headlamp/blob/ee95cceb66fcc81536dc274d41f70372e38b6d87/frontend/src/lib/k8s/ingress.ts#L48)

#### name

```ts
name: string;
```

#### port

```ts
port: object;
```

##### port.name?

```ts
optional name?: string;
```

##### port.number?

```ts
optional number?: number;
```
