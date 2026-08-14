# Interface: RequestParams

Defined in: [lib/k8s/api/v1/clusterRequests.ts:38](https://github.com/SaikiaMan/headlamp/blob/ee95cceb66fcc81536dc274d41f70372e38b6d87/frontend/src/lib/k8s/api/v1/clusterRequests.ts#L38)

Options for the request.

## Extends

- `RequestInit`

## Extended by

- [`ClusterRequestParams`](ClusterRequestParams.md)

## Properties

### autoLogoutOnAuthError?

```ts
optional autoLogoutOnAuthError?: boolean;
```

Defined in: [lib/k8s/api/v1/clusterRequests.ts:46](https://github.com/SaikiaMan/headlamp/blob/ee95cceb66fcc81536dc274d41f70372e38b6d87/frontend/src/lib/k8s/api/v1/clusterRequests.ts#L46)

Whether to automatically log out the user if there is an authentication error.

***

### cluster?

```ts
optional cluster?: string | null;
```

Defined in: [lib/k8s/api/v1/clusterRequests.ts:44](https://github.com/SaikiaMan/headlamp/blob/ee95cceb66fcc81536dc274d41f70372e38b6d87/frontend/src/lib/k8s/api/v1/clusterRequests.ts#L44)

Cluster context name.

***

### isJSON?

```ts
optional isJSON?: boolean;
```

Defined in: [lib/k8s/api/v1/clusterRequests.ts:42](https://github.com/SaikiaMan/headlamp/blob/ee95cceb66fcc81536dc274d41f70372e38b6d87/frontend/src/lib/k8s/api/v1/clusterRequests.ts#L42)

Is the request expected to receive JSON data?

***

### timeout?

```ts
optional timeout?: number;
```

Defined in: [lib/k8s/api/v1/clusterRequests.ts:40](https://github.com/SaikiaMan/headlamp/blob/ee95cceb66fcc81536dc274d41f70372e38b6d87/frontend/src/lib/k8s/api/v1/clusterRequests.ts#L40)

Number of milliseconds to wait for a response.
