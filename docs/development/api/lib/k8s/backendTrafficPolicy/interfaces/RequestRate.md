# Interface: RequestRate

RequestRate expresses “X requests per Y time‑interval”.

## Properties

### count?

```ts
optional count: number;
```

Number of requests allowed within the interval.

#### Defined in

[src/lib/k8s/backendTrafficPolicy.ts:48](https://github.com/kubernetes-sigs/headlamp/blob/4f6ccb46282ab9a5d4439bf075672ad3d4cd1113/frontend/src/lib/k8s/backendTrafficPolicy.ts#L48)

***

### interval?

```ts
optional interval: string;
```

Duration string (e.g. "1s") that forms the divisor of the rate.

#### Defined in

[src/lib/k8s/backendTrafficPolicy.ts:50](https://github.com/kubernetes-sigs/headlamp/blob/4f6ccb46282ab9a5d4439bf075672ad3d4cd1113/frontend/src/lib/k8s/backendTrafficPolicy.ts#L50)
