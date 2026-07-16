# Interface: KubeOwnerReference

Defined in: [lib/k8s/cluster.ts:73](https://github.com/SaikiaMan/headlamp/blob/ee95cceb66fcc81536dc274d41f70372e38b6d87/frontend/src/lib/k8s/cluster.ts#L73)

## Properties

### apiVersion

```ts
apiVersion: string;
```

Defined in: [lib/k8s/cluster.ts:75](https://github.com/SaikiaMan/headlamp/blob/ee95cceb66fcc81536dc274d41f70372e38b6d87/frontend/src/lib/k8s/cluster.ts#L75)

API version of the referent.

***

### blockOwnerDeletion

```ts
blockOwnerDeletion: boolean;
```

Defined in: [lib/k8s/cluster.ts:87](https://github.com/SaikiaMan/headlamp/blob/ee95cceb66fcc81536dc274d41f70372e38b6d87/frontend/src/lib/k8s/cluster.ts#L87)

If true, AND if the owner has the "foregroundDeletion" finalizer, then the owner cannot
be deleted from the key-value store until this reference is removed.

#### See

[foreground deletion](https://kubernetes.io/docs/concepts/architecture/garbage-collection/#foreground-deletion)
for how the garbage collector interacts with this field and enforces the foreground deletion.

Defaults to false. To set this field, a user needs "delete" permission of the owner,
otherwise 422 (Unprocessable Entity) will be returned.

***

### controller

```ts
controller: boolean;
```

Defined in: [lib/k8s/cluster.ts:89](https://github.com/SaikiaMan/headlamp/blob/ee95cceb66fcc81536dc274d41f70372e38b6d87/frontend/src/lib/k8s/cluster.ts#L89)

If true, this reference points to the managing controller.

***

### kind

```ts
kind: string;
```

Defined in: [lib/k8s/cluster.ts:91](https://github.com/SaikiaMan/headlamp/blob/ee95cceb66fcc81536dc274d41f70372e38b6d87/frontend/src/lib/k8s/cluster.ts#L91)

Kind of the referent.

***

### name

```ts
name: string;
```

Defined in: [lib/k8s/cluster.ts:93](https://github.com/SaikiaMan/headlamp/blob/ee95cceb66fcc81536dc274d41f70372e38b6d87/frontend/src/lib/k8s/cluster.ts#L93)

Name of the referent.

***

### uid

```ts
uid: string;
```

Defined in: [lib/k8s/cluster.ts:95](https://github.com/SaikiaMan/headlamp/blob/ee95cceb66fcc81536dc274d41f70372e38b6d87/frontend/src/lib/k8s/cluster.ts#L95)

UID of the referent.
