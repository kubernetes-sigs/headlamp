# Interface: IngressBackend

Defined in: [lib/k8s/ingress.ts:47](https://github.com/Rucha0901/headlamp/blob/db946f8d81732ed8fbecf4752fa84b86cab70c8b/frontend/src/lib/k8s/ingress.ts#L47)

## Properties

### resource?

```ts
optional resource?: object;
```

Defined in: [lib/k8s/ingress.ts:55](https://github.com/Rucha0901/headlamp/blob/db946f8d81732ed8fbecf4752fa84b86cab70c8b/frontend/src/lib/k8s/ingress.ts#L55)

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

Defined in: [lib/k8s/ingress.ts:48](https://github.com/Rucha0901/headlamp/blob/db946f8d81732ed8fbecf4752fa84b86cab70c8b/frontend/src/lib/k8s/ingress.ts#L48)

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
