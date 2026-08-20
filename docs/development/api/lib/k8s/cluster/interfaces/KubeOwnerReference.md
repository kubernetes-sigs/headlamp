# Interface: KubeOwnerReference

Defined in: [lib/k8s/cluster.ts:72](https://github.com/mishradwaterlaw/headlamp/blob/5944f5d61f18c73406d793336db6720caacb9130/frontend/src/lib/k8s/cluster.ts#L72)

## Properties

### apiVersion

```ts
apiVersion: string;
```

Defined in: [lib/k8s/cluster.ts:74](https://github.com/mishradwaterlaw/headlamp/blob/5944f5d61f18c73406d793336db6720caacb9130/frontend/src/lib/k8s/cluster.ts#L74)

API version of the referent.

***

### blockOwnerDeletion

```ts
blockOwnerDeletion: boolean;
```

Defined in: [lib/k8s/cluster.ts:86](https://github.com/mishradwaterlaw/headlamp/blob/5944f5d61f18c73406d793336db6720caacb9130/frontend/src/lib/k8s/cluster.ts#L86)

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

Defined in: [lib/k8s/cluster.ts:88](https://github.com/mishradwaterlaw/headlamp/blob/5944f5d61f18c73406d793336db6720caacb9130/frontend/src/lib/k8s/cluster.ts#L88)

If true, this reference points to the managing controller.

***

### kind

```ts
kind: string;
```

Defined in: [lib/k8s/cluster.ts:90](https://github.com/mishradwaterlaw/headlamp/blob/5944f5d61f18c73406d793336db6720caacb9130/frontend/src/lib/k8s/cluster.ts#L90)

Kind of the referent.

***

### name

```ts
name: string;
```

Defined in: [lib/k8s/cluster.ts:92](https://github.com/mishradwaterlaw/headlamp/blob/5944f5d61f18c73406d793336db6720caacb9130/frontend/src/lib/k8s/cluster.ts#L92)

Name of the referent.

***

### uid

```ts
uid: string;
```

Defined in: [lib/k8s/cluster.ts:94](https://github.com/mishradwaterlaw/headlamp/blob/5944f5d61f18c73406d793336db6720caacb9130/frontend/src/lib/k8s/cluster.ts#L94)

UID of the referent.
