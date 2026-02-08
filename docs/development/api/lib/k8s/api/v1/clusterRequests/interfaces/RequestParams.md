# Interface: RequestParams

Options for the request.

## Extends

- `RequestInit`

## Extended by

- [`ClusterRequestParams`](ClusterRequestParams.md)

## Properties

### autoLogoutOnAuthError?

```ts
optional autoLogoutOnAuthError: boolean;
```

Whether to automatically log out the user if there is an authentication error.

#### Defined in

[src/lib/k8s/api/v1/clusterRequests.ts:45](https://github.com/zyzzmohit/headlamp/blob/5c039e27e936e8174f45bbfcab8979134d6fb3fc/frontend/src/lib/k8s/api/v1/clusterRequests.ts#L45)

***

### cluster?

```ts
optional cluster: null | string;
```

Cluster context name.

#### Defined in

[src/lib/k8s/api/v1/clusterRequests.ts:43](https://github.com/zyzzmohit/headlamp/blob/5c039e27e936e8174f45bbfcab8979134d6fb3fc/frontend/src/lib/k8s/api/v1/clusterRequests.ts#L43)

***

### isJSON?

```ts
optional isJSON: boolean;
```

Is the request expected to receive JSON data?

#### Defined in

[src/lib/k8s/api/v1/clusterRequests.ts:41](https://github.com/zyzzmohit/headlamp/blob/5c039e27e936e8174f45bbfcab8979134d6fb3fc/frontend/src/lib/k8s/api/v1/clusterRequests.ts#L41)

***

### timeout?

```ts
optional timeout: number;
```

Number of milliseconds to wait for a response.

#### Defined in

[src/lib/k8s/api/v1/clusterRequests.ts:39](https://github.com/zyzzmohit/headlamp/blob/5c039e27e936e8174f45bbfcab8979134d6fb3fc/frontend/src/lib/k8s/api/v1/clusterRequests.ts#L39)
