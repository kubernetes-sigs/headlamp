# Interface: RetryConstraint

Defined in: [lib/k8s/backendTrafficPolicy.ts:57](https://github.com/Rucha0901/headlamp/blob/db946f8d81732ed8fbecf4752fa84b86cab70c8b/frontend/src/lib/k8s/backendTrafficPolicy.ts#L57)

RetryConstraint dynamically constrains client‑side retries using a
percentage‑based budget and a safety‑net minimum rate.

## Properties

### budget?

```ts
optional budget?: BudgetDetails;
```

Defined in: [lib/k8s/backendTrafficPolicy.ts:58](https://github.com/Rucha0901/headlamp/blob/db946f8d81732ed8fbecf4752fa84b86cab70c8b/frontend/src/lib/k8s/backendTrafficPolicy.ts#L58)

***

### minRetryRate?

```ts
optional minRetryRate?: RequestRate;
```

Defined in: [lib/k8s/backendTrafficPolicy.ts:59](https://github.com/Rucha0901/headlamp/blob/db946f8d81732ed8fbecf4752fa84b86cab70c8b/frontend/src/lib/k8s/backendTrafficPolicy.ts#L59)
