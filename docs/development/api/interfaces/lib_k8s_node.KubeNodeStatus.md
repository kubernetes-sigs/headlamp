[API](../API.md) / [lib/k8s/node](../modules/lib_k8s_node.md) / KubeNodeStatus

# Interface: KubeNodeStatus

[lib/k8s/node](../modules/lib_k8s_node.md).KubeNodeStatus

## Properties

### addresses

• `Optional` **addresses**: { `address`: `string` ; `type`: `string`  }[]

#### Defined in

[lib/k8s/node.ts:29](https://github.com/kubernetes-sigs/headlamp/blob/072d2509b/frontend/src/lib/k8s/node.ts#L29)

___

### allocatable

• `Optional` **allocatable**: { [key: `string`]: `string`  }

Resource quantities keyed by their k8s name (e.g. cpu, memory, pods, ephemeral-storage).
Note: keys are kebab-case as returned by the API, not camelCase.

#### Defined in

[lib/k8s/node.ts:37](https://github.com/kubernetes-sigs/headlamp/blob/072d2509b/frontend/src/lib/k8s/node.ts#L37)

___

### capacity

• `Optional` **capacity**: { [key: `string`]: `string`  }

#### Defined in

[lib/k8s/node.ts:38](https://github.com/kubernetes-sigs/headlamp/blob/072d2509b/frontend/src/lib/k8s/node.ts#L38)

___

### conditions

• `Optional` **conditions**: (`Omit`<[`KubeCondition`](lib_k8s_cluster.KubeCondition.md), ``"lastProbeTime"`` \| ``"lastUpdateTime"``\> & { `lastHeartbeatTime`: `string`  })[]

#### Defined in

[lib/k8s/node.ts:39](https://github.com/kubernetes-sigs/headlamp/blob/072d2509b/frontend/src/lib/k8s/node.ts#L39)

___

### nodeInfo

• `Optional` **nodeInfo**: `Object`

#### Type declaration

| Name | Type |
| :------ | :------ |
| `architecture` | `string` |
| `bootID` | `string` |
| `containerRuntimeVersion` | `string` |
| `kernelVersion` | `string` |
| `kubeProxyVersion` | `string` |
| `kubeletVersion` | `string` |
| `machineID` | `string` |
| `operatingSystem` | `string` |
| `osImage` | `string` |
| `systemUUID` | `string` |

#### Defined in

[lib/k8s/node.ts:42](https://github.com/kubernetes-sigs/headlamp/blob/072d2509b/frontend/src/lib/k8s/node.ts#L42)
