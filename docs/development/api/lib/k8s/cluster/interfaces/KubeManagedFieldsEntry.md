# Interface: KubeManagedFieldsEntry

ManagedFieldsEntry is a workflow-id, a FieldSet and the group version of the
resource that the fieldset applies to.

## Extended by

- [`KubeManagedFields`](KubeManagedFields.md)

## Properties

### apiVersion

```ts
apiVersion: string;
```

APIVersion defines the version of this resource that this field set applies to.
The format is "group/version" just like the top-level APIVersion field.
It is necessary to track the version of a field set because it cannot be
automatically converted.

#### Defined in

[src/lib/k8s/cluster.ts:109](https://github.com/kubernetes-sigs/headlamp/blob/4f6ccb46282ab9a5d4439bf075672ad3d4cd1113/frontend/src/lib/k8s/cluster.ts#L109)

***

### fieldsType

```ts
fieldsType: string;
```

FieldsType is the discriminator for the different fields format and version.
There is currently only one possible value: "FieldsV1"

#### Defined in

[src/lib/k8s/cluster.ts:114](https://github.com/kubernetes-sigs/headlamp/blob/4f6ccb46282ab9a5d4439bf075672ad3d4cd1113/frontend/src/lib/k8s/cluster.ts#L114)

***

### fieldsV1

```ts
fieldsV1: object;
```

FieldsV1 holds the first JSON version format as described in the "FieldsV1" type.

#### Defined in

[src/lib/k8s/cluster.ts:118](https://github.com/kubernetes-sigs/headlamp/blob/4f6ccb46282ab9a5d4439bf075672ad3d4cd1113/frontend/src/lib/k8s/cluster.ts#L118)

***

### manager

```ts
manager: string;
```

Manager is an identifier of the workflow managing these fields.

#### Defined in

[src/lib/k8s/cluster.ts:122](https://github.com/kubernetes-sigs/headlamp/blob/4f6ccb46282ab9a5d4439bf075672ad3d4cd1113/frontend/src/lib/k8s/cluster.ts#L122)

***

### operation

```ts
operation: string;
```

Operation is the type of operation which lead to this ManagedFieldsEntry being
created. The only valid values for this field are 'Apply' and 'Update'.

#### Defined in

[src/lib/k8s/cluster.ts:127](https://github.com/kubernetes-sigs/headlamp/blob/4f6ccb46282ab9a5d4439bf075672ad3d4cd1113/frontend/src/lib/k8s/cluster.ts#L127)

***

### subresource

```ts
subresource: string;
```

Subresource is the name of the subresource used to update that object, or empty
string if the object was updated through the main resource. The value of this
field is used to distinguish between managers, even if they share the same name.
For example, a status update will be distinct from a regular update using the
same manager name. Note that the APIVersion field is not related to the
Subresource field and it always corresponds to the version of the main resource.

#### Defined in

[src/lib/k8s/cluster.ts:136](https://github.com/kubernetes-sigs/headlamp/blob/4f6ccb46282ab9a5d4439bf075672ad3d4cd1113/frontend/src/lib/k8s/cluster.ts#L136)

***

### timestamp

```ts
timestamp: string;
```

Time is the timestamp of when the ManagedFields entry was added.The timestamp
will also be updated if a field is added, the manager changes any of the owned
fields value or removes a field. The timestamp does not update when a field is
removed from the entry because another manager took it over.

#### Defined in

[src/lib/k8s/cluster.ts:143](https://github.com/kubernetes-sigs/headlamp/blob/4f6ccb46282ab9a5d4439bf075672ad3d4cd1113/frontend/src/lib/k8s/cluster.ts#L143)
