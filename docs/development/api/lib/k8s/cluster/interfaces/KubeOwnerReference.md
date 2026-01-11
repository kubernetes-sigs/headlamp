# Interface: KubeOwnerReference

## Properties

### apiVersion

```ts
apiVersion: string;
```

API version of the referent.

#### Defined in

[src/lib/k8s/cluster.ts:75](https://github.com/kubernetes-sigs/headlamp/blob/4f6ccb46282ab9a5d4439bf075672ad3d4cd1113/frontend/src/lib/k8s/cluster.ts#L75)

***

### blockOwnerDeletion

```ts
blockOwnerDeletion: boolean;
```

If true, AND if the owner has the "foregroundDeletion" finalizer, then the owner cannot
be deleted from the key-value store until this reference is removed.

#### See

[foreground deletion](https://kubernetes.io/docs/concepts/architecture/garbage-collection/#foreground-deletion)
for how the garbage collector interacts with this field and enforces the foreground deletion.

Defaults to false. To set this field, a user needs "delete" permission of the owner,
otherwise 422 (Unprocessable Entity) will be returned.

#### Defined in

[src/lib/k8s/cluster.ts:87](https://github.com/kubernetes-sigs/headlamp/blob/4f6ccb46282ab9a5d4439bf075672ad3d4cd1113/frontend/src/lib/k8s/cluster.ts#L87)

***

### controller

```ts
controller: boolean;
```

If true, this reference points to the managing controller.

#### Defined in

[src/lib/k8s/cluster.ts:89](https://github.com/kubernetes-sigs/headlamp/blob/4f6ccb46282ab9a5d4439bf075672ad3d4cd1113/frontend/src/lib/k8s/cluster.ts#L89)

***

### kind

```ts
kind: string;
```

Kind of the referent.

#### Defined in

[src/lib/k8s/cluster.ts:91](https://github.com/kubernetes-sigs/headlamp/blob/4f6ccb46282ab9a5d4439bf075672ad3d4cd1113/frontend/src/lib/k8s/cluster.ts#L91)

***

### name

```ts
name: string;
```

Name of the referent.

#### Defined in

[src/lib/k8s/cluster.ts:93](https://github.com/kubernetes-sigs/headlamp/blob/4f6ccb46282ab9a5d4439bf075672ad3d4cd1113/frontend/src/lib/k8s/cluster.ts#L93)

***

### uid

```ts
uid: string;
```

UID of the referent.

#### Defined in

[src/lib/k8s/cluster.ts:95](https://github.com/kubernetes-sigs/headlamp/blob/4f6ccb46282ab9a5d4439bf075672ad3d4cd1113/frontend/src/lib/k8s/cluster.ts#L95)
