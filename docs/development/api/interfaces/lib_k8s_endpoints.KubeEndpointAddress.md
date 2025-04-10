[API](../API.md) / [lib/k8s/endpoints](../modules/lib_k8s_endpoints.md) / KubeEndpointAddress

# Interface: KubeEndpointAddress

[lib/k8s/endpoints](../modules/lib_k8s_endpoints.md).KubeEndpointAddress

## Properties

### hostname

• **hostname**: `string`

#### Defined in

[lib/k8s/endpoints.ts:12](https://github.com/kubernetes-sigs/headlamp/blob/072d2509b/frontend/src/lib/k8s/endpoints.ts#L12)

___

### ip

• **ip**: `string`

#### Defined in

[lib/k8s/endpoints.ts:13](https://github.com/kubernetes-sigs/headlamp/blob/072d2509b/frontend/src/lib/k8s/endpoints.ts#L13)

___

### nodeName

• `Optional` **nodeName**: `string`

#### Defined in

[lib/k8s/endpoints.ts:14](https://github.com/kubernetes-sigs/headlamp/blob/072d2509b/frontend/src/lib/k8s/endpoints.ts#L14)

___

### targetRef

• `Optional` **targetRef**: `Pick`<[`KubeObjectInterface`](lib_k8s_cluster.KubeObjectInterface.md), ``"kind"`` \| ``"apiVersion"``\> & `Pick`<[`KubeMetadata`](lib_k8s_cluster.KubeMetadata.md), ``"name"`` \| ``"namespace"`` \| ``"resourceVersion"`` \| ``"uid"``\> & { `fieldPath`: `string`  }

#### Defined in

[lib/k8s/endpoints.ts:15](https://github.com/kubernetes-sigs/headlamp/blob/072d2509b/frontend/src/lib/k8s/endpoints.ts#L15)
