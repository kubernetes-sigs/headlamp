# Interface: RetryConstraint

RetryConstraint dynamically constrains client‑side retries using a
percentage‑based budget and a safety‑net minimum rate.

## Properties

### budget?

```ts
optional budget: BudgetDetails;
```

#### Defined in

[src/lib/k8s/backendTrafficPolicy.ts:58](https://github.com/zyzzmohit/headlamp/blob/5c039e27e936e8174f45bbfcab8979134d6fb3fc/frontend/src/lib/k8s/backendTrafficPolicy.ts#L58)

***

### minRetryRate?

```ts
optional minRetryRate: RequestRate;
```

#### Defined in

[src/lib/k8s/backendTrafficPolicy.ts:59](https://github.com/zyzzmohit/headlamp/blob/5c039e27e936e8174f45bbfcab8979134d6fb3fc/frontend/src/lib/k8s/backendTrafficPolicy.ts#L59)
