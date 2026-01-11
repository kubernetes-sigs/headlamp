# Interface: BudgetDetails

BudgetDetails limits the share of active requests that may be retries and
the time window for calculating that budget.

## Properties

### interval?

```ts
optional interval: string;
```

Duration string (e.g. "10s") defining the budget interval.

#### Defined in

[src/lib/k8s/backendTrafficPolicy.ts:40](https://github.com/kubernetes-sigs/headlamp/blob/4f6ccb46282ab9a5d4439bf075672ad3d4cd1113/frontend/src/lib/k8s/backendTrafficPolicy.ts#L40)

***

### percent?

```ts
optional percent: number;
```

Maximum percentage of concurrent requests that may be retries (0‑100).

#### Defined in

[src/lib/k8s/backendTrafficPolicy.ts:38](https://github.com/kubernetes-sigs/headlamp/blob/4f6ccb46282ab9a5d4439bf075672ad3d4cd1113/frontend/src/lib/k8s/backendTrafficPolicy.ts#L38)
