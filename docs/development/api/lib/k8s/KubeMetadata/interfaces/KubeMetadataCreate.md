# Interface: KubeMetadataCreate

Defined in: [lib/k8s/KubeMetadata.ts:156](https://github.com/SaikiaMan/headlamp/blob/ee95cceb66fcc81536dc274d41f70372e38b6d87/frontend/src/lib/k8s/KubeMetadata.ts#L156)

KubeMetadataCreate is a version of KubeMetadata for creating objects where uid, creationTimestamp, etc. are optional

## Extends

- `Omit`\<[`KubeMetadata`](KubeMetadata.md), `"uid"` \| `"creationTimestamp"`\>

## Properties

### annotations?

```ts
optional annotations?: StringDict;
```

Defined in: [lib/k8s/KubeMetadata.ts:31](https://github.com/SaikiaMan/headlamp/blob/ee95cceb66fcc81536dc274d41f70372e38b6d87/frontend/src/lib/k8s/KubeMetadata.ts#L31)

A map of string keys and values that can be used by external tooling to store and
retrieve arbitrary metadata about this object

#### See

[annotations docs](https://kubernetes.io/docs/concepts/overview/working-with-objects/annotations/) for more details.

#### Inherited from

[`KubeMetadata`](KubeMetadata.md).[`annotations`](KubeMetadata.md#annotations)

***

### apiVersion?

```ts
optional apiVersion?: any;
```

Defined in: [lib/k8s/KubeMetadata.ts:150](https://github.com/SaikiaMan/headlamp/blob/ee95cceb66fcc81536dc274d41f70372e38b6d87/frontend/src/lib/k8s/KubeMetadata.ts#L150)

#### Inherited from

[`KubeMetadata`](KubeMetadata.md).[`apiVersion`](KubeMetadata.md#apiversion)

***

### creationTimestamp?

```ts
optional creationTimestamp?: string;
```

Defined in: [lib/k8s/KubeMetadata.ts:172](https://github.com/SaikiaMan/headlamp/blob/ee95cceb66fcc81536dc274d41f70372e38b6d87/frontend/src/lib/k8s/KubeMetadata.ts#L172)

An RFC 3339 date of the date and time an object was created

This is optional when creating an object; the server will set it for you.

***

### deletionGracePeriodSeconds?

```ts
optional deletionGracePeriodSeconds?: number;
```

Defined in: [lib/k8s/KubeMetadata.ts:42](https://github.com/SaikiaMan/headlamp/blob/ee95cceb66fcc81536dc274d41f70372e38b6d87/frontend/src/lib/k8s/KubeMetadata.ts#L42)

Number of seconds allowed for this object to gracefully terminate before it
will be removed from the system. Only set when deletionTimestamp is also set.
May only be shortened.
Read-only.

#### Inherited from

[`KubeMetadata`](KubeMetadata.md).[`deletionGracePeriodSeconds`](KubeMetadata.md#deletiongraceperiodseconds)

***

### deletionTimestamp?

```ts
optional deletionTimestamp?: string;
```

Defined in: [lib/k8s/KubeMetadata.ts:54](https://github.com/SaikiaMan/headlamp/blob/ee95cceb66fcc81536dc274d41f70372e38b6d87/frontend/src/lib/k8s/KubeMetadata.ts#L54)

An RFC 3339 date of the date and time after which this resource will be deleted.
This field is set by the server when a graceful deletion is requested by the
user, and is not directly settable by a client. The resource will be deleted
(no longer visible from resource lists, and not reachable by name) after the
time in this field except when the object has a finalizer set. In case the
finalizer is set the deletion of the object is postponed at least until the
finalizer is removed. Once the deletionTimestamp is set, this value may not
be unset or be set further into the future, although it may be shortened or
the resource may be deleted prior to this time.

#### Inherited from

[`KubeMetadata`](KubeMetadata.md).[`deletionTimestamp`](KubeMetadata.md#deletiontimestamp)

***

### finalizers?

```ts
optional finalizers?: string[];
```

Defined in: [lib/k8s/KubeMetadata.ts:71](https://github.com/SaikiaMan/headlamp/blob/ee95cceb66fcc81536dc274d41f70372e38b6d87/frontend/src/lib/k8s/KubeMetadata.ts#L71)

Must be empty before the object is deleted from the registry. Each entry is
an identifier for the responsible component that will remove the entry from
the list. If the deletionTimestamp of the object is non-nil, entries in this
list can only be removed. Finalizers may be processed and removed in any order.
Order is NOT enforced because it introduces significant risk of stuck finalizers.
finalizers is a shared field, any actor with permission can reorder it.
If the finalizer list is processed in order, then this can lead to a situation
in which the component responsible for the first finalizer in the list is
waiting for a signal (field value, external system, or other) produced by a
component responsible for a finalizer later in the list, resulting in a deadlock.
Without enforced ordering finalizers are free to order amongst themselves and
are not vulnerable to ordering changes in the list.

patch strategy: merge

#### Inherited from

[`KubeMetadata`](KubeMetadata.md).[`finalizers`](KubeMetadata.md#finalizers)

***

### generateName?

```ts
optional generateName?: string;
```

Defined in: [lib/k8s/KubeMetadata.ts:84](https://github.com/SaikiaMan/headlamp/blob/ee95cceb66fcc81536dc274d41f70372e38b6d87/frontend/src/lib/k8s/KubeMetadata.ts#L84)

GenerateName is an optional prefix, used by the server, to generate a unique
name ONLY IF the Name field has not been provided. If this field is used,
the name returned to the client will be different than the name passed.
This value will also be combined with a unique suffix. The provided value
has the same validation rules as the Name field, and may be truncated by
the length of the suffix required to make the value unique on the server.
If this field is specified and the generated name exists, the server will
return a 409. Applied only if Name is not specified.

#### See

[more info](https://git.k8s.io/community/contributors/devel/sig-architecture/api-conventions.md#idempotency)

#### Inherited from

[`KubeMetadata`](KubeMetadata.md).[`generateName`](KubeMetadata.md#generatename)

***

### generation?

```ts
optional generation?: number;
```

Defined in: [lib/k8s/KubeMetadata.ts:90](https://github.com/SaikiaMan/headlamp/blob/ee95cceb66fcc81536dc274d41f70372e38b6d87/frontend/src/lib/k8s/KubeMetadata.ts#L90)

A sequence number representing a specific generation of the desired state.
Populated by the system.
Read-only.

#### Inherited from

[`KubeMetadata`](KubeMetadata.md).[`generation`](KubeMetadata.md#generation)

***

### labels?

```ts
optional labels?: StringDict;
```

Defined in: [lib/k8s/KubeMetadata.ts:96](https://github.com/SaikiaMan/headlamp/blob/ee95cceb66fcc81536dc274d41f70372e38b6d87/frontend/src/lib/k8s/KubeMetadata.ts#L96)

A map of string keys and values that can be used to organize and categorize objects

#### See

https://kubernetes.io/docs/concepts/overview/working-with-objects/labels/

#### Inherited from

[`KubeMetadata`](KubeMetadata.md).[`labels`](KubeMetadata.md#labels)

***

### managedFields?

```ts
optional managedFields?: KubeManagedFieldsEntry[];
```

Defined in: [lib/k8s/KubeMetadata.ts:104](https://github.com/SaikiaMan/headlamp/blob/ee95cceb66fcc81536dc274d41f70372e38b6d87/frontend/src/lib/k8s/KubeMetadata.ts#L104)

Maps workflow-id and version to the set of fields that are managed by that workflow.
This is mostly for internal housekeeping, and users typically shouldn't need to set
or understand this field. A workflow can be the user's name, a controller's name, or
the name of a specific apply path like "ci-cd". The set of fields is always in the
version that the workflow used when modifying the object.

#### Inherited from

[`KubeMetadata`](KubeMetadata.md).[`managedFields`](KubeMetadata.md#managedfields)

***

### name

```ts
name: string;
```

Defined in: [lib/k8s/KubeMetadata.ts:111](https://github.com/SaikiaMan/headlamp/blob/ee95cceb66fcc81536dc274d41f70372e38b6d87/frontend/src/lib/k8s/KubeMetadata.ts#L111)

Uniquely identifies this object within the current namespace (see the identifiers docs).
This value is used in the path when retrieving an individual object.

#### See

[Names docs](https://kubernetes.io/docs/concepts/overview/working-with-objects/names/) for more details.

#### Inherited from

[`KubeMetadata`](KubeMetadata.md).[`name`](KubeMetadata.md#name)

***

### namespace?

```ts
optional namespace?: string;
```

Defined in: [lib/k8s/KubeMetadata.ts:120](https://github.com/SaikiaMan/headlamp/blob/ee95cceb66fcc81536dc274d41f70372e38b6d87/frontend/src/lib/k8s/KubeMetadata.ts#L120)

Namespace defines the space within which each name must be unique. An empty namespace is
equivalent to the "default" namespace, but "default" is the canonical representation.
Not all objects are required to be scoped to a namespace - the value of this field for
those objects will be empty. Must be a DNS_LABEL. Cannot be updated.

#### See

[Namespaces docs](https://kubernetes.io/docs/concepts/overview/working-with-objects/namespaces/) for more details.

#### Inherited from

[`KubeMetadata`](KubeMetadata.md).[`namespace`](KubeMetadata.md#namespace)

***

### ownerReferences?

```ts
optional ownerReferences?: KubeOwnerReference[];
```

Defined in: [lib/k8s/KubeMetadata.ts:127](https://github.com/SaikiaMan/headlamp/blob/ee95cceb66fcc81536dc274d41f70372e38b6d87/frontend/src/lib/k8s/KubeMetadata.ts#L127)

List of objects depended by this object. If ALL objects in the list have been deleted,
this object will be garbage collected. If this object is managed by a controller,
then an entry in this list will point to this controller, with the controller field
set to true. There cannot be more than one managing controller.

#### Inherited from

[`KubeMetadata`](KubeMetadata.md).[`ownerReferences`](KubeMetadata.md#ownerreferences)

***

### resourceVersion?

```ts
optional resourceVersion?: string;
```

Defined in: [lib/k8s/KubeMetadata.ts:137](https://github.com/SaikiaMan/headlamp/blob/ee95cceb66fcc81536dc274d41f70372e38b6d87/frontend/src/lib/k8s/KubeMetadata.ts#L137)

Identifies the internal version of this object that can be used by clients to
determine when objects have changed. This value MUST be treated as opaque by
clients and passed unmodified back to the server. Clients should not assume
that the resource version has meaning across namespaces, different kinds of
resources, or different servers.

#### See

[concurrency control docs](https://github.com/kubernetes/community/blob/master/contributors/devel/sig-architecture/api-conventions.md#concurrency-control-and-consistency) for more details

#### Inherited from

[`KubeMetadata`](KubeMetadata.md).[`resourceVersion`](KubeMetadata.md#resourceversion)

***

### selfLink?

```ts
optional selfLink?: string;
```

Defined in: [lib/k8s/KubeMetadata.ts:141](https://github.com/SaikiaMan/headlamp/blob/ee95cceb66fcc81536dc274d41f70372e38b6d87/frontend/src/lib/k8s/KubeMetadata.ts#L141)

Deprecated: selfLink is a legacy read-only field that is no longer populated by the system.

#### Inherited from

[`KubeMetadata`](KubeMetadata.md).[`selfLink`](KubeMetadata.md#selflink)

***

### uid?

```ts
optional uid?: string;
```

Defined in: [lib/k8s/KubeMetadata.ts:166](https://github.com/SaikiaMan/headlamp/blob/ee95cceb66fcc81536dc274d41f70372e38b6d87/frontend/src/lib/k8s/KubeMetadata.ts#L166)

UID is the unique in time and space value for this object. It is typically generated by
the server on successful creation of a resource and is not allowed to change on PUT
operations. Populated by the system. Read-only.

#### See

[UIDs docs](https://kubernetes.io/docs/concepts/overview/working-with-objects/names#uids) for more details.

This is typically generated by the server on successful creation of a resource.
