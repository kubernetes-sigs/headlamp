# Interface: RetryConstraint

RetryConstraint dynamically constrains client‑side retries using a
percentage‑based budget and a safety‑net minimum rate.

## Properties

### budget?

```ts
optional budget: BudgetDetails;
```

#### Defined in

[src/lib/k8s/backendTrafficPolicy.ts:58](https://github.com/kubernetes-sigs/headlamp/blob/4f6ccb46282ab9a5d4439bf075672ad3d4cd1113/frontend/src/lib/k8s/backendTrafficPolicy.ts#L58)

***

### minRetryRate?

```ts
optional minRetryRate: RequestRate;
```

#### Defined in

[src/lib/k8s/backendTrafficPolicy.ts:59](https://github.com/kubernetes-sigs/headlamp/blob/4f6ccb46282ab9a5d4439bf075672ad3d4cd1113/frontend/src/lib/k8s/backendTrafficPolicy.ts#L59)
