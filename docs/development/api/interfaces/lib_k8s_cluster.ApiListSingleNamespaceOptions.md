[API](../API.md) / [lib/k8s/cluster](../modules/lib_k8s_cluster.md) / ApiListSingleNamespaceOptions

# Interface: ApiListSingleNamespaceOptions

[lib/k8s/cluster](../modules/lib_k8s_cluster.md).ApiListSingleNamespaceOptions

## Properties

### cluster

• `Optional` **cluster**: `string`

The cluster to get the object from. By default uses the current cluster being viewed.

#### Defined in

[lib/k8s/cluster.ts:235](https://github.com/kubernetes-sigs/headlamp/blob/072d2509b/frontend/src/lib/k8s/cluster.ts#L235)

___

### namespace

• `Optional` **namespace**: `string`

The namespace to get the object from.

#### Defined in

[lib/k8s/cluster.ts:231](https://github.com/kubernetes-sigs/headlamp/blob/072d2509b/frontend/src/lib/k8s/cluster.ts#L231)

___

### queryParams

• `Optional` **queryParams**: [`QueryParameters`](lib_k8s_apiProxy.QueryParameters.md)

The parameters to be passed to the API endpoint.

#### Defined in

[lib/k8s/cluster.ts:233](https://github.com/kubernetes-sigs/headlamp/blob/072d2509b/frontend/src/lib/k8s/cluster.ts#L233)
