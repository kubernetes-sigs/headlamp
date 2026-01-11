# Interface: IngressBackend

## Properties

### resource?

```ts
optional resource: object;
```

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

#### Defined in

[src/lib/k8s/ingress.ts:54](https://github.com/kubernetes-sigs/headlamp/blob/4f6ccb46282ab9a5d4439bf075672ad3d4cd1113/frontend/src/lib/k8s/ingress.ts#L54)

***

### service?

```ts
optional service: object;
```

#### name

```ts
name: string;
```

#### port

```ts
port: object;
```

#### port.name?

```ts
optional name: string;
```

#### port.number?

```ts
optional number: number;
```

#### Defined in

[src/lib/k8s/ingress.ts:47](https://github.com/kubernetes-sigs/headlamp/blob/4f6ccb46282ab9a5d4439bf075672ad3d4cd1113/frontend/src/lib/k8s/ingress.ts#L47)
