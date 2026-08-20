# Interface: BackendTrafficPolicySpec

Defined in: [lib/k8s/backendTrafficPolicy.ts:76](https://github.com/mishradwaterlaw/headlamp/blob/5944f5d61f18c73406d793336db6720caacb9130/frontend/src/lib/k8s/backendTrafficPolicy.ts#L76)

BackendTrafficPolicySpec defines the desired policy.

## See

[https://gateway-api.sigs.k8s.io/reference/api-spec/main/specx/#backendtrafficpolicyspec](https://gateway-api.sigs.k8s.io/reference/api-spec/main/specx/#backendtrafficpolicyspec)

## Indexable

```ts
[key: string]: any
```

Allow custom vendor extensions until the API stabilises.

## Properties

### retryConstraint?

```ts
optional retryConstraint?: RetryConstraint;
```

Defined in: [lib/k8s/backendTrafficPolicy.ts:78](https://github.com/mishradwaterlaw/headlamp/blob/5944f5d61f18c73406d793336db6720caacb9130/frontend/src/lib/k8s/backendTrafficPolicy.ts#L78)

***

### sessionPersistence?

```ts
optional sessionPersistence?: SessionPersistence;
```

Defined in: [lib/k8s/backendTrafficPolicy.ts:79](https://github.com/mishradwaterlaw/headlamp/blob/5944f5d61f18c73406d793336db6720caacb9130/frontend/src/lib/k8s/backendTrafficPolicy.ts#L79)

***

### targetRefs

```ts
targetRefs: BackendTrafficPolicyTargetRef[];
```

Defined in: [lib/k8s/backendTrafficPolicy.ts:77](https://github.com/mishradwaterlaw/headlamp/blob/5944f5d61f18c73406d793336db6720caacb9130/frontend/src/lib/k8s/backendTrafficPolicy.ts#L77)
