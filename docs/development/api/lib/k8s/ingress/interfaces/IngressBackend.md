# Interface: IngressBackend

Defined in: [lib/k8s/ingress.ts:47](https://github.com/kehach07/headlamp/blob/7b4a853c98ea719589ddb64289f86ea94e08b877/frontend/src/lib/k8s/ingress.ts#L47)

## Properties

### resource?

```ts
optional resource?: object;
```

Defined in: [lib/k8s/ingress.ts:55](https://github.com/kehach07/headlamp/blob/7b4a853c98ea719589ddb64289f86ea94e08b877/frontend/src/lib/k8s/ingress.ts#L55)

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

Defined in: [lib/k8s/ingress.ts:48](https://github.com/kehach07/headlamp/blob/7b4a853c98ea719589ddb64289f86ea94e08b877/frontend/src/lib/k8s/ingress.ts#L48)

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
