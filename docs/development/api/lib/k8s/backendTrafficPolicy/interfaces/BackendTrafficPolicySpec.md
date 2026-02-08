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

[src/lib/k8s/backendTrafficPolicy.ts:78](https://github.com/zyzzmohit/headlamp/blob/5c039e27e936e8174f45bbfcab8979134d6fb3fc/frontend/src/lib/k8s/backendTrafficPolicy.ts#L78)

***

### sessionPersistence?

```ts
optional sessionPersistence: SessionPersistence;
```

#### Defined in

[src/lib/k8s/backendTrafficPolicy.ts:79](https://github.com/zyzzmohit/headlamp/blob/5c039e27e936e8174f45bbfcab8979134d6fb3fc/frontend/src/lib/k8s/backendTrafficPolicy.ts#L79)

***

### targetRefs

```ts
targetRefs: BackendTrafficPolicyTargetRef[];
```

#### Defined in

[src/lib/k8s/backendTrafficPolicy.ts:77](https://github.com/zyzzmohit/headlamp/blob/5c039e27e936e8174f45bbfcab8979134d6fb3fc/frontend/src/lib/k8s/backendTrafficPolicy.ts#L77)
