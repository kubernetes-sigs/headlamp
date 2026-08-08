# Interface: LimitRangeSpec

Defined in: [lib/k8s/limitRange.tsx:20](https://github.com/SaikiaMan/headlamp/blob/ee95cceb66fcc81536dc274d41f70372e38b6d87/frontend/src/lib/k8s/limitRange.tsx#L20)

## Properties

### limits

```ts
limits: object[];
```

Defined in: [lib/k8s/limitRange.tsx:21](https://github.com/SaikiaMan/headlamp/blob/ee95cceb66fcc81536dc274d41f70372e38b6d87/frontend/src/lib/k8s/limitRange.tsx#L21)

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
