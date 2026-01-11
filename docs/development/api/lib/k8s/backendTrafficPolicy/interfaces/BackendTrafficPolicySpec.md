# Interface: BackendTrafficPolicySpec

BackendTrafficPolicySpec defines the desired policy.

## See

[https://gateway-api.sigs.k8s.io/api-types/backendtrafficpolicy/#spec](https://gateway-api.sigs.k8s.io/api-types/backendtrafficpolicy/#spec)

## Indexable

 \[`key`: `string`\]: `any`

## Properties

### retryConstraint?

```ts
optional retryConstraint: RetryConstraint;
```

#### Defined in

[src/lib/k8s/backendTrafficPolicy.ts:78](https://github.com/kubernetes-sigs/headlamp/blob/4f6ccb46282ab9a5d4439bf075672ad3d4cd1113/frontend/src/lib/k8s/backendTrafficPolicy.ts#L78)

***

### sessionPersistence?

```ts
optional sessionPersistence: SessionPersistence;
```

#### Defined in

[src/lib/k8s/backendTrafficPolicy.ts:79](https://github.com/kubernetes-sigs/headlamp/blob/4f6ccb46282ab9a5d4439bf075672ad3d4cd1113/frontend/src/lib/k8s/backendTrafficPolicy.ts#L79)

***

### targetRefs

```ts
targetRefs: BackendTrafficPolicyTargetRef[];
```

#### Defined in

[src/lib/k8s/backendTrafficPolicy.ts:77](https://github.com/kubernetes-sigs/headlamp/blob/4f6ccb46282ab9a5d4439bf075672ad3d4cd1113/frontend/src/lib/k8s/backendTrafficPolicy.ts#L77)
