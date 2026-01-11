# Interface: ~~KubeManagedFields~~

## Deprecated

For backwards compatibility, please use KubeManagedFieldsEntry

## Extends

- [`KubeManagedFieldsEntry`](KubeManagedFieldsEntry.md)

## Properties

### ~~apiVersion~~

```ts
apiVersion: string;
```

APIVersion defines the version of this resource that this field set applies to.
The format is "group/version" just like the top-level APIVersion field.
It is necessary to track the version of a field set because it cannot be
automatically converted.

#### Inherited from

[`KubeManagedFieldsEntry`](KubeManagedFieldsEntry.md).[`apiVersion`](KubeManagedFieldsEntry.md#apiversion)

#### Defined in

[src/lib/k8s/cluster.ts:109](https://github.com/kubernetes-sigs/headlamp/blob/4f6ccb46282ab9a5d4439bf075672ad3d4cd1113/frontend/src/lib/k8s/cluster.ts#L109)

***

### ~~fieldsType~~

```ts
fieldsType: string;
```

FieldsType is the discriminator for the different fields format and version.
There is currently only one possible value: "FieldsV1"

#### Inherited from

[`KubeManagedFieldsEntry`](KubeManagedFieldsEntry.md).[`fieldsType`](KubeManagedFieldsEntry.md#fieldstype)

#### Defined in

[src/lib/k8s/cluster.ts:114](https://github.com/kubernetes-sigs/headlamp/blob/4f6ccb46282ab9a5d4439bf075672ad3d4cd1113/frontend/src/lib/k8s/cluster.ts#L114)

***

### ~~fieldsV1~~

```ts
fieldsV1: object;
```

FieldsV1 holds the first JSON version format as described in the "FieldsV1" type.

#### Inherited from

[`KubeManagedFieldsEntry`](KubeManagedFieldsEntry.md).[`fieldsV1`](KubeManagedFieldsEntry.md#fieldsv1)

#### Defined in

[src/lib/k8s/cluster.ts:118](https://github.com/kubernetes-sigs/headlamp/blob/4f6ccb46282ab9a5d4439bf075672ad3d4cd1113/frontend/src/lib/k8s/cluster.ts#L118)

***

### ~~manager~~

```ts
manager: string;
```

Manager is an identifier of the workflow managing these fields.

#### Inherited from

[`KubeManagedFieldsEntry`](KubeManagedFieldsEntry.md).[`manager`](KubeManagedFieldsEntry.md#manager)

#### Defined in

[src/lib/k8s/cluster.ts:122](https://github.com/kubernetes-sigs/headlamp/blob/4f6ccb46282ab9a5d4439bf075672ad3d4cd1113/frontend/src/lib/k8s/cluster.ts#L122)

***

### ~~operation~~

```ts
operation: string;
```

Operation is the type of operation which lead to this ManagedFieldsEntry being
created. The only valid values for this field are 'Apply' and 'Update'.

#### Inherited from

[`KubeManagedFieldsEntry`](KubeManagedFieldsEntry.md).[`operation`](KubeManagedFieldsEntry.md#operation)

#### Defined in

[src/lib/k8s/cluster.ts:127](https://github.com/kubernetes-sigs/headlamp/blob/4f6ccb46282ab9a5d4439bf075672ad3d4cd1113/frontend/src/lib/k8s/cluster.ts#L127)

***

### ~~subresource~~

```ts
subresource: string;
```

Subresource is the name of the subresource used to update that object, or empty
string if the object was updated through the main resource. The value of this
field is used to distinguish between managers, even if they share the same name.
For example, a status update will be distinct from a regular update using the
same manager name. Note that the APIVersion field is not related to the
Subresource field and it always corresponds to the version of the main resource.

#### Inherited from

[`KubeManagedFieldsEntry`](KubeManagedFieldsEntry.md).[`subresource`](KubeManagedFieldsEntry.md#subresource)

#### Defined in

[src/lib/k8s/cluster.ts:136](https://github.com/kubernetes-sigs/headlamp/blob/4f6ccb46282ab9a5d4439bf075672ad3d4cd1113/frontend/src/lib/k8s/cluster.ts#L136)

***

### ~~timestamp~~

```ts
timestamp: string;
```

Time is the timestamp of when the ManagedFields entry was added.The timestamp
will also be updated if a field is added, the manager changes any of the owned
fields value or removes a field. The timestamp does not update when a field is
removed from the entry because another manager took it over.

#### Inherited from

[`KubeManagedFieldsEntry`](KubeManagedFieldsEntry.md).[`timestamp`](KubeManagedFieldsEntry.md#timestamp)

#### Defined in

[src/lib/k8s/cluster.ts:143](https://github.com/kubernetes-sigs/headlamp/blob/4f6ccb46282ab9a5d4439bf075672ad3d4cd1113/frontend/src/lib/k8s/cluster.ts#L143)
