[API](../API.md) / [lib/k8s/networkpolicy](../modules/lib_k8s_networkpolicy.md) / KubeNetworkPolicy

# Interface: KubeNetworkPolicy

[lib/k8s/networkpolicy](../modules/lib_k8s_networkpolicy.md).KubeNetworkPolicy

## Hierarchy

- [`KubeObjectInterface`](lib_k8s_cluster.KubeObjectInterface.md)

  ↳ **`KubeNetworkPolicy`**

## Properties

### apiVersion

• `Optional` **apiVersion**: `string`

#### Inherited from

[KubeObjectInterface](lib_k8s_cluster.KubeObjectInterface.md).[apiVersion](lib_k8s_cluster.KubeObjectInterface.md#apiversion)

#### Defined in

[lib/k8s/cluster.ts:56](https://github.com/kubernetes-sigs/headlamp/blob/072d2509b/frontend/src/lib/k8s/cluster.ts#L56)

___

### egress

• **egress**: [`NetworkPolicyEgressRule`](lib_k8s_networkpolicy.NetworkPolicyEgressRule.md)[]

#### Defined in

[lib/k8s/networkpolicy.tsx:32](https://github.com/kubernetes-sigs/headlamp/blob/072d2509b/frontend/src/lib/k8s/networkpolicy.tsx#L32)

___

### ingress

• **ingress**: [`NetworkPolicyIngressRule`](lib_k8s_networkpolicy.NetworkPolicyIngressRule.md)[]

#### Defined in

[lib/k8s/networkpolicy.tsx:33](https://github.com/kubernetes-sigs/headlamp/blob/072d2509b/frontend/src/lib/k8s/networkpolicy.tsx#L33)

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

### podSelector

• **podSelector**: [`LabelSelector`](lib_k8s_cluster.LabelSelector.md)

#### Defined in

[lib/k8s/networkpolicy.tsx:34](https://github.com/kubernetes-sigs/headlamp/blob/072d2509b/frontend/src/lib/k8s/networkpolicy.tsx#L34)

___

### policyTypes

• **policyTypes**: `string`[]

#### Defined in

[lib/k8s/networkpolicy.tsx:35](https://github.com/kubernetes-sigs/headlamp/blob/072d2509b/frontend/src/lib/k8s/networkpolicy.tsx#L35)
