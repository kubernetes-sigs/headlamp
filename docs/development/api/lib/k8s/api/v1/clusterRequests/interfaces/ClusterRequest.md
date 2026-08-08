# Interface: ClusterRequest

Defined in: [lib/k8s/api/v1/clusterRequests.ts:49](https://github.com/SaikiaMan/headlamp/blob/ee95cceb66fcc81536dc274d41f70372e38b6d87/frontend/src/lib/k8s/api/v1/clusterRequests.ts#L49)

## Properties

### certificateAuthorityData?

```ts
optional certificateAuthorityData?: string;
```

Defined in: [lib/k8s/api/v1/clusterRequests.ts:57](https://github.com/SaikiaMan/headlamp/blob/ee95cceb66fcc81536dc274d41f70372e38b6d87/frontend/src/lib/k8s/api/v1/clusterRequests.ts#L57)

The certificate authority data

***

### insecureTLSVerify?

```ts
optional insecureTLSVerify?: boolean;
```

Defined in: [lib/k8s/api/v1/clusterRequests.ts:55](https://github.com/SaikiaMan/headlamp/blob/ee95cceb66fcc81536dc274d41f70372e38b6d87/frontend/src/lib/k8s/api/v1/clusterRequests.ts#L55)

Whether the server's certificate should not be checked for validity

***

### kubeconfig?

```ts
optional kubeconfig?: string;
```

Defined in: [lib/k8s/api/v1/clusterRequests.ts:59](https://github.com/SaikiaMan/headlamp/blob/ee95cceb66fcc81536dc274d41f70372e38b6d87/frontend/src/lib/k8s/api/v1/clusterRequests.ts#L59)

KubeConfig (base64 encoded)

***

### name?

```ts
optional name?: string;
```

Defined in: [lib/k8s/api/v1/clusterRequests.ts:51](https://github.com/SaikiaMan/headlamp/blob/ee95cceb66fcc81536dc274d41f70372e38b6d87/frontend/src/lib/k8s/api/v1/clusterRequests.ts#L51)

The name of the cluster (has to be unique, or it will override an existing cluster)

***

### server?

```ts
optional server?: string;
```

Defined in: [lib/k8s/api/v1/clusterRequests.ts:53](https://github.com/SaikiaMan/headlamp/blob/ee95cceb66fcc81536dc274d41f70372e38b6d87/frontend/src/lib/k8s/api/v1/clusterRequests.ts#L53)

The cluster URL
