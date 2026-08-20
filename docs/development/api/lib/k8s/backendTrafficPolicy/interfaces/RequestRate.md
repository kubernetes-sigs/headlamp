# Interface: RequestRate

Defined in: [lib/k8s/backendTrafficPolicy.ts:46](https://github.com/mishradwaterlaw/headlamp/blob/5944f5d61f18c73406d793336db6720caacb9130/frontend/src/lib/k8s/backendTrafficPolicy.ts#L46)

RequestRate expresses “X requests per Y time‑interval”.

## Properties

### count?

```ts
optional count?: number;
```

Defined in: [lib/k8s/backendTrafficPolicy.ts:48](https://github.com/mishradwaterlaw/headlamp/blob/5944f5d61f18c73406d793336db6720caacb9130/frontend/src/lib/k8s/backendTrafficPolicy.ts#L48)

Number of requests allowed within the interval.

***

### interval?

```ts
optional interval?: string;
```

Defined in: [lib/k8s/backendTrafficPolicy.ts:50](https://github.com/mishradwaterlaw/headlamp/blob/5944f5d61f18c73406d793336db6720caacb9130/frontend/src/lib/k8s/backendTrafficPolicy.ts#L50)

Duration string (e.g. "1s") that forms the divisor of the rate.
