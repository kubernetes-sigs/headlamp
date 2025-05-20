[API](../API.md) / [lib/k8s/apiProxy](../modules/lib_k8s_apiProxy.md) / ClusterRequest

# Interface: ClusterRequest

[lib/k8s/apiProxy](../modules/lib_k8s_apiProxy.md).ClusterRequest

## Properties

### certificateAuthorityData

• `Optional` **certificateAuthorityData**: `string`

The certificate authority data

#### Defined in

[lib/k8s/apiProxy.ts:77](https://github.com/kubernetes-sigs/headlamp/blob/072d2509b/frontend/src/lib/k8s/apiProxy.ts#L77)

___

### insecureTLSVerify

• `Optional` **insecureTLSVerify**: `boolean`

Whether the server's certificate should not be checked for validity

#### Defined in

[lib/k8s/apiProxy.ts:75](https://github.com/kubernetes-sigs/headlamp/blob/072d2509b/frontend/src/lib/k8s/apiProxy.ts#L75)

___

### kubeconfig

• `Optional` **kubeconfig**: `string`

KubeConfig (base64 encoded)

#### Defined in

[lib/k8s/apiProxy.ts:79](https://github.com/kubernetes-sigs/headlamp/blob/072d2509b/frontend/src/lib/k8s/apiProxy.ts#L79)

___

### name

• `Optional` **name**: `string`

The name of the cluster (has to be unique, or it will override an existing cluster)

#### Defined in

[lib/k8s/apiProxy.ts:71](https://github.com/kubernetes-sigs/headlamp/blob/072d2509b/frontend/src/lib/k8s/apiProxy.ts#L71)

___

### server

• `Optional` **server**: `string`

The cluster URL

#### Defined in

[lib/k8s/apiProxy.ts:73](https://github.com/kubernetes-sigs/headlamp/blob/072d2509b/frontend/src/lib/k8s/apiProxy.ts#L73)
