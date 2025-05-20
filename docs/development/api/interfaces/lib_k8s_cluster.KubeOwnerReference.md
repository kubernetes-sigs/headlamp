[API](../API.md) / [lib/k8s/cluster](../modules/lib_k8s_cluster.md) / KubeOwnerReference

# Interface: KubeOwnerReference

[lib/k8s/cluster](../modules/lib_k8s_cluster.md).KubeOwnerReference

## Properties

### apiVersion

• **apiVersion**: `string`

API version of the referent.

#### Defined in

[lib/k8s/cluster.ts:199](https://github.com/kubernetes-sigs/headlamp/blob/072d2509b/frontend/src/lib/k8s/cluster.ts#L199)

___

### blockOwnerDeletion

• **blockOwnerDeletion**: `boolean`

If true, AND if the owner has the "foregroundDeletion" finalizer, then the owner cannot
be deleted from the key-value store until this reference is removed.

**`see`** [foreground deletion](https://kubernetes.io/docs/concepts/architecture/garbage-collection/#foreground-deletion)
for how the garbage collector interacts with this field and enforces the foreground deletion.

Defaults to false. To set this field, a user needs "delete" permission of the owner,
otherwise 422 (Unprocessable Entity) will be returned.

#### Defined in

[lib/k8s/cluster.ts:211](https://github.com/kubernetes-sigs/headlamp/blob/072d2509b/frontend/src/lib/k8s/cluster.ts#L211)

___

### controller

• **controller**: `boolean`

If true, this reference points to the managing controller.

#### Defined in

[lib/k8s/cluster.ts:213](https://github.com/kubernetes-sigs/headlamp/blob/072d2509b/frontend/src/lib/k8s/cluster.ts#L213)

___

### kind

• **kind**: `string`

Kind of the referent.

#### Defined in

[lib/k8s/cluster.ts:215](https://github.com/kubernetes-sigs/headlamp/blob/072d2509b/frontend/src/lib/k8s/cluster.ts#L215)

___

### name

• **name**: `string`

Name of the referent.

#### Defined in

[lib/k8s/cluster.ts:217](https://github.com/kubernetes-sigs/headlamp/blob/072d2509b/frontend/src/lib/k8s/cluster.ts#L217)

___

### uid

• **uid**: `string`

UID of the referent.

#### Defined in

[lib/k8s/cluster.ts:219](https://github.com/kubernetes-sigs/headlamp/blob/072d2509b/frontend/src/lib/k8s/cluster.ts#L219)
