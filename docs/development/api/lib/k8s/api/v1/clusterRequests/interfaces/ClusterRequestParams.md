# Interface: ClusterRequestParams

Defined in: [lib/k8s/api/v1/clusterRequests.ts:65](https://github.com/SaikiaMan/headlamp/blob/ee95cceb66fcc81536dc274d41f70372e38b6d87/frontend/src/lib/k8s/api/v1/clusterRequests.ts#L65)

The options for `clusterRequest`.

## Extends

- [`RequestParams`](RequestParams.md)

## Properties

### autoLogoutOnAuthError?

```ts
optional autoLogoutOnAuthError?: boolean;
```

Defined in: [lib/k8s/api/v1/clusterRequests.ts:67](https://github.com/SaikiaMan/headlamp/blob/ee95cceb66fcc81536dc274d41f70372e38b6d87/frontend/src/lib/k8s/api/v1/clusterRequests.ts#L67)

Whether to automatically log out the user if there is an authentication error.

#### Overrides

[`RequestParams`](RequestParams.md).[`autoLogoutOnAuthError`](RequestParams.md#autologoutonautherror)

***

### cluster?

```ts
optional cluster?: string | null;
```

Defined in: [lib/k8s/api/v1/clusterRequests.ts:66](https://github.com/SaikiaMan/headlamp/blob/ee95cceb66fcc81536dc274d41f70372e38b6d87/frontend/src/lib/k8s/api/v1/clusterRequests.ts#L66)

Cluster context name.

#### Overrides

[`RequestParams`](RequestParams.md).[`cluster`](RequestParams.md#cluster)

***

### isJSON?

```ts
optional isJSON?: boolean;
```

Defined in: [lib/k8s/api/v1/clusterRequests.ts:42](https://github.com/SaikiaMan/headlamp/blob/ee95cceb66fcc81536dc274d41f70372e38b6d87/frontend/src/lib/k8s/api/v1/clusterRequests.ts#L42)

Is the request expected to receive JSON data?

#### Inherited from

[`RequestParams`](RequestParams.md).[`isJSON`](RequestParams.md#isjson)

***

### timeout?

```ts
optional timeout?: number;
```

Defined in: [lib/k8s/api/v1/clusterRequests.ts:40](https://github.com/SaikiaMan/headlamp/blob/ee95cceb66fcc81536dc274d41f70372e38b6d87/frontend/src/lib/k8s/api/v1/clusterRequests.ts#L40)

Number of milliseconds to wait for a response.

#### Inherited from

[`RequestParams`](RequestParams.md).[`timeout`](RequestParams.md#timeout)
