# Interface: RequestRate

Defined in: [lib/k8s/backendTrafficPolicy.ts:46](https://github.com/SaikiaMan/headlamp/blob/ee95cceb66fcc81536dc274d41f70372e38b6d87/frontend/src/lib/k8s/backendTrafficPolicy.ts#L46)

RequestRate expresses “X requests per Y time‑interval”.

## Properties

### count?

```ts
optional count?: number;
```

Defined in: [lib/k8s/backendTrafficPolicy.ts:48](https://github.com/SaikiaMan/headlamp/blob/ee95cceb66fcc81536dc274d41f70372e38b6d87/frontend/src/lib/k8s/backendTrafficPolicy.ts#L48)

Number of requests allowed within the interval.

***

### interval?

```ts
optional interval?: string;
```

Defined in: [lib/k8s/backendTrafficPolicy.ts:50](https://github.com/SaikiaMan/headlamp/blob/ee95cceb66fcc81536dc274d41f70372e38b6d87/frontend/src/lib/k8s/backendTrafficPolicy.ts#L50)

Duration string (e.g. "1s") that forms the divisor of the rate.
