# Interface: ClusterRequest

## Properties

### certificateAuthorityData?

```ts
optional certificateAuthorityData: string;
```

The certificate authority data

#### Defined in

[src/lib/k8s/api/v1/clusterRequests.ts:56](https://github.com/zyzzmohit/headlamp/blob/5c039e27e936e8174f45bbfcab8979134d6fb3fc/frontend/src/lib/k8s/api/v1/clusterRequests.ts#L56)

***

### insecureTLSVerify?

```ts
optional insecureTLSVerify: boolean;
```

Whether the server's certificate should not be checked for validity

#### Defined in

[src/lib/k8s/api/v1/clusterRequests.ts:54](https://github.com/zyzzmohit/headlamp/blob/5c039e27e936e8174f45bbfcab8979134d6fb3fc/frontend/src/lib/k8s/api/v1/clusterRequests.ts#L54)

***

### kubeconfig?

```ts
optional kubeconfig: string;
```

KubeConfig (base64 encoded)

#### Defined in

[src/lib/k8s/api/v1/clusterRequests.ts:58](https://github.com/zyzzmohit/headlamp/blob/5c039e27e936e8174f45bbfcab8979134d6fb3fc/frontend/src/lib/k8s/api/v1/clusterRequests.ts#L58)

***

### name?

```ts
optional name: string;
```

The name of the cluster (has to be unique, or it will override an existing cluster)

#### Defined in

[src/lib/k8s/api/v1/clusterRequests.ts:50](https://github.com/zyzzmohit/headlamp/blob/5c039e27e936e8174f45bbfcab8979134d6fb3fc/frontend/src/lib/k8s/api/v1/clusterRequests.ts#L50)

***

### server?

```ts
optional server: string;
```

The cluster URL

#### Defined in

[src/lib/k8s/api/v1/clusterRequests.ts:52](https://github.com/zyzzmohit/headlamp/blob/5c039e27e936e8174f45bbfcab8979134d6fb3fc/frontend/src/lib/k8s/api/v1/clusterRequests.ts#L52)
