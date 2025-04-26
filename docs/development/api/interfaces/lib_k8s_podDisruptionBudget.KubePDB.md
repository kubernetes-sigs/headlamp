[API](../API.md) / [lib/k8s/podDisruptionBudget](../modules/lib_k8s_podDisruptionBudget.md) / KubePDB

# Interface: KubePDB

[lib/k8s/podDisruptionBudget](../modules/lib_k8s_podDisruptionBudget.md).KubePDB

## Hierarchy

- [`KubeObjectInterface`](lib_k8s_cluster.KubeObjectInterface.md)

  ↳ **`KubePDB`**

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

#### Type declaration

| Name | Type |
| :------ | :------ |
| `maxUnavailable?` | `number` |
| `minAvailable?` | `number` |
| `selector` | { `matchExpressions?`: { `key`: `string` ; `operator`: `string` ; `values`: `string`[]  } ; `matchLabels`: { `[key: string]`: `string`;  }  } |
| `selector.matchExpressions?` | { `key`: `string` ; `operator`: `string` ; `values`: `string`[]  } |
| `selector.matchExpressions.key` | `string` |
| `selector.matchExpressions.operator` | `string` |
| `selector.matchExpressions.values` | `string`[] |
| `selector.matchLabels` | { `[key: string]`: `string`;  } |

#### Defined in

[lib/k8s/podDisruptionBudget.ts:5](https://github.com/kubernetes-sigs/headlamp/blob/072d2509b/frontend/src/lib/k8s/podDisruptionBudget.ts#L5)

___

### status

• **status**: `Object`

#### Type declaration

| Name | Type |
| :------ | :------ |
| `conditions` | { `lastTransitionTime`: `string` ; `message`: `string` ; `observedGeneration`: `number` ; `reason`: `string` ; `status`: `string` ; `type`: `string`  }[] |
| `currentHealthy` | `number` |
| `desiredHealthy` | `number` |
| `disruptedPods?` | { `[key: string]`: `string`;  } |
| `disruptionsAllowed` | `number` |
| `expectedPods` | `number` |
| `observedGeneration` | `number` |

#### Defined in

[lib/k8s/podDisruptionBudget.ts:19](https://github.com/kubernetes-sigs/headlamp/blob/072d2509b/frontend/src/lib/k8s/podDisruptionBudget.ts#L19)
