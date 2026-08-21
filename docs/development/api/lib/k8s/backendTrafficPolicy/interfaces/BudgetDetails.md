# Interface: BudgetDetails

Defined in: [lib/k8s/backendTrafficPolicy.ts:36](https://github.com/Rucha0901/headlamp/blob/db946f8d81732ed8fbecf4752fa84b86cab70c8b/frontend/src/lib/k8s/backendTrafficPolicy.ts#L36)

BudgetDetails limits the share of active requests that may be retries and
the time window for calculating that budget.

## Properties

### interval?

```ts
optional interval?: string;
```

Defined in: [lib/k8s/backendTrafficPolicy.ts:40](https://github.com/Rucha0901/headlamp/blob/db946f8d81732ed8fbecf4752fa84b86cab70c8b/frontend/src/lib/k8s/backendTrafficPolicy.ts#L40)

Duration string (e.g. "10s") defining the budget interval.

***

### percent?

```ts
optional percent?: number;
```

Defined in: [lib/k8s/backendTrafficPolicy.ts:38](https://github.com/Rucha0901/headlamp/blob/db946f8d81732ed8fbecf4752fa84b86cab70c8b/frontend/src/lib/k8s/backendTrafficPolicy.ts#L38)

Maximum percentage of concurrent requests that may be retries (0‑100).
