[API](../API.md) / [lib/k8s/apiProxy](../modules/lib_k8s_apiProxy.md) / ClusterRequestOptions

# Interface: ClusterRequestOptions

[lib/k8s/apiProxy](../modules/lib_k8s_apiProxy.md).ClusterRequestOptions

The options for `clusterRequest`.

## Hierarchy

- [`RequestOptions`](lib_k8s_apiProxy.RequestOptions.md)

  ↳ **`ClusterRequestOptions`**

## Properties

### autoLogoutOnAuthError

• `Optional` **autoLogoutOnAuthError**: `boolean`

Whether to automatically log out the user if there is an authentication error.

#### Overrides

[RequestOptions](lib_k8s_apiProxy.RequestOptions.md).[autoLogoutOnAuthError](lib_k8s_apiProxy.RequestOptions.md#autologoutonautherror)

#### Defined in

[lib/k8s/apiProxy.ts:334](https://github.com/kubernetes-sigs/headlamp/blob/072d2509b/frontend/src/lib/k8s/apiProxy.ts#L334)

___

### cluster

• `Optional` **cluster**: ``null`` \| `string`

Cluster context name.

#### Overrides

[RequestOptions](lib_k8s_apiProxy.RequestOptions.md).[cluster](lib_k8s_apiProxy.RequestOptions.md#cluster)

#### Defined in

[lib/k8s/apiProxy.ts:333](https://github.com/kubernetes-sigs/headlamp/blob/072d2509b/frontend/src/lib/k8s/apiProxy.ts#L333)

___

### isJSON

• `Optional` **isJSON**: `boolean`

Is the request expected to receive JSON data?

#### Inherited from

[RequestOptions](lib_k8s_apiProxy.RequestOptions.md).[isJSON](lib_k8s_apiProxy.RequestOptions.md#isjson)

#### Defined in

[lib/k8s/apiProxy.ts:62](https://github.com/kubernetes-sigs/headlamp/blob/072d2509b/frontend/src/lib/k8s/apiProxy.ts#L62)

___

### timeout

• `Optional` **timeout**: `number`

Number of milliseconds to wait for a response.

#### Inherited from

[RequestOptions](lib_k8s_apiProxy.RequestOptions.md).[timeout](lib_k8s_apiProxy.RequestOptions.md#timeout)

#### Defined in

[lib/k8s/apiProxy.ts:60](https://github.com/kubernetes-sigs/headlamp/blob/072d2509b/frontend/src/lib/k8s/apiProxy.ts#L60)
