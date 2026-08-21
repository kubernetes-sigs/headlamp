# Interface: LimitRangeSpec

Defined in: [lib/k8s/limitRange.tsx:20](https://github.com/Rucha0901/headlamp/blob/db946f8d81732ed8fbecf4752fa84b86cab70c8b/frontend/src/lib/k8s/limitRange.tsx#L20)

## Properties

### limits

```ts
limits: object[];
```

Defined in: [lib/k8s/limitRange.tsx:21](https://github.com/Rucha0901/headlamp/blob/db946f8d81732ed8fbecf4752fa84b86cab70c8b/frontend/src/lib/k8s/limitRange.tsx#L21)

#### default

```ts
default: object;
```

##### default.cpu

```ts
cpu: string;
```

##### default.memory

```ts
memory: string;
```

#### defaultRequest

```ts
defaultRequest: object;
```

##### defaultRequest.cpu

```ts
cpu: string;
```

##### defaultRequest.memory

```ts
memory: string;
```

#### max

```ts
max: object;
```

##### max.cpu

```ts
cpu: string;
```

##### max.memory

```ts
memory: string;
```

#### maxLimitRequestRatio?

```ts
optional maxLimitRequestRatio?: object;
```

##### Index Signature

```ts
[resourceName: string]: string
```

#### min

```ts
min: object;
```

##### min.cpu

```ts
cpu: string;
```

##### min.memory

```ts
memory: string;
```

#### type

```ts
type: string;
```
