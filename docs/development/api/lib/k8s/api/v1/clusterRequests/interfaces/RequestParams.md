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

[src/lib/k8s/api/v1/clusterRequests.ts:45](https://github.com/kubernetes-sigs/headlamp/blob/4f6ccb46282ab9a5d4439bf075672ad3d4cd1113/frontend/src/lib/k8s/api/v1/clusterRequests.ts#L45)

***

### cluster?

```ts
optional cluster: null | string;
```

Cluster context name.

#### Defined in

[src/lib/k8s/api/v1/clusterRequests.ts:43](https://github.com/kubernetes-sigs/headlamp/blob/4f6ccb46282ab9a5d4439bf075672ad3d4cd1113/frontend/src/lib/k8s/api/v1/clusterRequests.ts#L43)

***

### isJSON?

```ts
optional isJSON: boolean;
```

Is the request expected to receive JSON data?

#### Defined in

[src/lib/k8s/api/v1/clusterRequests.ts:41](https://github.com/kubernetes-sigs/headlamp/blob/4f6ccb46282ab9a5d4439bf075672ad3d4cd1113/frontend/src/lib/k8s/api/v1/clusterRequests.ts#L41)

***

### timeout?

```ts
optional timeout: number;
```

Number of milliseconds to wait for a response.

#### Defined in

[src/lib/k8s/api/v1/clusterRequests.ts:39](https://github.com/kubernetes-sigs/headlamp/blob/4f6ccb46282ab9a5d4439bf075672ad3d4cd1113/frontend/src/lib/k8s/api/v1/clusterRequests.ts#L39)
