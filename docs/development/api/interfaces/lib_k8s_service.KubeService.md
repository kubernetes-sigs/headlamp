[API](../API.md) / [lib/k8s/service](../modules/lib_k8s_service.md) / KubeService

# Interface: KubeService

[lib/k8s/service](../modules/lib_k8s_service.md).KubeService

## Hierarchy

- [`KubeObjectInterface`](lib_k8s_cluster.KubeObjectInterface.md)

  ↳ **`KubeService`**

## Properties

### apiVersion

• `Optional` **apiVersion**: `string`

#### Inherited from

[KubeObjectInterface](lib_k8s_cluster.KubeObjectInterface.md).[apiVersion](lib_k8s_cluster.KubeObjectInterface.md#apiversion)

#### Defined in

[lib/k8s/cluster.ts:56](https://github.com/kubernetes-sigs/headlamp/blob/072d2509b/frontend/src/lib/k8s/cluster.ts#L56)

___

### kind

• **kind**: `string`

Kind is a string value representing the REST resource this object represents.
Servers may infer this from the endpoint the client submits requests to.

In CamelCase.

Cannot be updated.

**`see`** [more info](https://git.k8s.io/community/contributors/devel/sig-architecture/api-conventions.md#types-kinds)

#### Inherited from

[KubeObjectInterface](lib_k8s_cluster.KubeObjectInterface.md).[kind](lib_k8s_cluster.KubeObjectInterface.md#kind)

#### Defined in

[lib/k8s/cluster.ts:55](https://github.com/kubernetes-sigs/headlamp/blob/072d2509b/frontend/src/lib/k8s/cluster.ts#L55)

___

### metadata

• **metadata**: [`KubeMetadata`](lib_k8s_cluster.KubeMetadata.md)

#### Inherited from

[KubeObjectInterface](lib_k8s_cluster.KubeObjectInterface.md).[metadata](lib_k8s_cluster.KubeObjectInterface.md#metadata)

#### Defined in

[lib/k8s/cluster.ts:57](https://github.com/kubernetes-sigs/headlamp/blob/072d2509b/frontend/src/lib/k8s/cluster.ts#L57)

___

### spec

• **spec**: `Object`

#### Index signature

▪ [otherProps: `string`]: `any`

#### Type declaration

| Name | Type |
| :------ | :------ |
| `clusterIP` | `string` |
| `externalIPs` | `string`[] |
| `ports?` | { `name`: `string` ; `nodePort`: `number` ; `port`: `number` ; `protocol`: `string` ; `targetPort`: `string` \| `number`  }[] |
| `selector` | { `[key: string]`: `string`;  } |
| `type` | `string` |

#### Defined in

[lib/k8s/service.ts:18](https://github.com/kubernetes-sigs/headlamp/blob/072d2509b/frontend/src/lib/k8s/service.ts#L18)

___

### status

• **status**: `Object`

#### Type declaration

| Name | Type |
| :------ | :------ |
| `conditions?` | [`KubeCondition`](lib_k8s_cluster.KubeCondition.md)[] |
| `loadBalancer?` | { `ingress`: [`KubeLoadBalancerIngress`](lib_k8s_service.KubeLoadBalancerIngress.md)[]  } |
| `loadBalancer.ingress` | [`KubeLoadBalancerIngress`](lib_k8s_service.KubeLoadBalancerIngress.md)[] |

#### Defined in

[lib/k8s/service.ts:34](https://github.com/kubernetes-sigs/headlamp/blob/072d2509b/frontend/src/lib/k8s/service.ts#L34)
