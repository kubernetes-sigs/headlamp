# Interface: RequestRate

Defined in: [lib/k8s/backendTrafficPolicy.ts:46](https://github.com/mishradwaterlaw/headlamp/blob/fa170d1f3805256c3d561c39c317801d0e2be4b3/frontend/src/lib/k8s/backendTrafficPolicy.ts#L46)

RequestRate expresses “X requests per Y time‑interval”.

## Properties

### count?

```ts
optional count?: number;
```

Defined in: [lib/k8s/backendTrafficPolicy.ts:48](https://github.com/mishradwaterlaw/headlamp/blob/fa170d1f3805256c3d561c39c317801d0e2be4b3/frontend/src/lib/k8s/backendTrafficPolicy.ts#L48)

Number of requests allowed within the interval.

***

### interval?

```ts
optional interval?: string;
```

Defined in: [lib/k8s/backendTrafficPolicy.ts:50](https://github.com/mishradwaterlaw/headlamp/blob/fa170d1f3805256c3d561c39c317801d0e2be4b3/frontend/src/lib/k8s/backendTrafficPolicy.ts#L50)

Duration string (e.g. "1s") that forms the divisor of the rate.
