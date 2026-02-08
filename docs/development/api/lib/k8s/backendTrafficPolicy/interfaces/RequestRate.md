# Interface: RequestRate

RequestRate expresses “X requests per Y time‑interval”.

## Properties

### count?

```ts
optional count: number;
```

Number of requests allowed within the interval.

#### Defined in

[src/lib/k8s/backendTrafficPolicy.ts:48](https://github.com/zyzzmohit/headlamp/blob/5c039e27e936e8174f45bbfcab8979134d6fb3fc/frontend/src/lib/k8s/backendTrafficPolicy.ts#L48)

***

### interval?

```ts
optional interval: string;
```

Duration string (e.g. "1s") that forms the divisor of the rate.

#### Defined in

[src/lib/k8s/backendTrafficPolicy.ts:50](https://github.com/zyzzmohit/headlamp/blob/5c039e27e936e8174f45bbfcab8979134d6fb3fc/frontend/src/lib/k8s/backendTrafficPolicy.ts#L50)
