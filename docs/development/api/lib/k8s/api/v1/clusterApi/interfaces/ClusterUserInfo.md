# Interface: ClusterUserInfo

Defined in: [lib/k8s/api/v1/clusterApi.ts:48](https://github.com/SaikiaMan/headlamp/blob/ee95cceb66fcc81536dc274d41f70372e38b6d87/frontend/src/lib/k8s/api/v1/clusterApi.ts#L48)

User info returned from SelfSubjectReview or derived from cluster config

## Properties

### extra?

```ts
optional extra?: Record<string, string[]>;
```

Defined in: [lib/k8s/api/v1/clusterApi.ts:56](https://github.com/SaikiaMan/headlamp/blob/ee95cceb66fcc81536dc274d41f70372e38b6d87/frontend/src/lib/k8s/api/v1/clusterApi.ts#L56)

Extra info about the user

***

### groups?

```ts
optional groups?: string[];
```

Defined in: [lib/k8s/api/v1/clusterApi.ts:54](https://github.com/SaikiaMan/headlamp/blob/ee95cceb66fcc81536dc274d41f70372e38b6d87/frontend/src/lib/k8s/api/v1/clusterApi.ts#L54)

Groups the user belongs to

***

### uid?

```ts
optional uid?: string;
```

Defined in: [lib/k8s/api/v1/clusterApi.ts:52](https://github.com/SaikiaMan/headlamp/blob/ee95cceb66fcc81536dc274d41f70372e38b6d87/frontend/src/lib/k8s/api/v1/clusterApi.ts#L52)

UID of the authenticated user

***

### username?

```ts
optional username?: string;
```

Defined in: [lib/k8s/api/v1/clusterApi.ts:50](https://github.com/SaikiaMan/headlamp/blob/ee95cceb66fcc81536dc274d41f70372e38b6d87/frontend/src/lib/k8s/api/v1/clusterApi.ts#L50)

Username of the authenticated user
