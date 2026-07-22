# Interface: RevisionInfo

Defined in: [lib/k8s/rollback.ts:55](https://github.com/SaikiaMan/headlamp/blob/ee95cceb66fcc81536dc274d41f70372e38b6d87/frontend/src/lib/k8s/rollback.ts#L55)

Represents a single revision in the history of a rollbackable resource.
Used by RevisionHistorySection and RollbackDialog to display revision details.

## Properties

### createdAt

```ts
createdAt: string;
```

Defined in: [lib/k8s/rollback.ts:59](https://github.com/SaikiaMan/headlamp/blob/ee95cceb66fcc81536dc274d41f70372e38b6d87/frontend/src/lib/k8s/rollback.ts#L59)

When this revision was created

***

### images

```ts
images: string[];
```

Defined in: [lib/k8s/rollback.ts:61](https://github.com/SaikiaMan/headlamp/blob/ee95cceb66fcc81536dc274d41f70372e38b6d87/frontend/src/lib/k8s/rollback.ts#L61)

Container images in this revision's pod template

***

### isCurrent

```ts
isCurrent: boolean;
```

Defined in: [lib/k8s/rollback.ts:63](https://github.com/SaikiaMan/headlamp/blob/ee95cceb66fcc81536dc274d41f70372e38b6d87/frontend/src/lib/k8s/rollback.ts#L63)

Whether this is the current (active) revision

***

### podTemplate?

```ts
optional podTemplate?: object;
```

Defined in: [lib/k8s/rollback.ts:65](https://github.com/SaikiaMan/headlamp/blob/ee95cceb66fcc81536dc274d41f70372e38b6d87/frontend/src/lib/k8s/rollback.ts#L65)

The raw pod template spec from this revision, for diffing

#### metadata?

```ts
optional metadata?: object;
```

##### Index Signature

```ts
[key: string]: any
```

#### spec?

```ts
optional spec?: object;
```

##### Index Signature

```ts
[key: string]: any
```

***

### revision

```ts
revision: number;
```

Defined in: [lib/k8s/rollback.ts:57](https://github.com/SaikiaMan/headlamp/blob/ee95cceb66fcc81536dc274d41f70372e38b6d87/frontend/src/lib/k8s/rollback.ts#L57)

Revision number
