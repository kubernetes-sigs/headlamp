# ~~Interface: KubeManagedFields~~

Defined in: [lib/k8s/cluster.ts:148](https://github.com/mishradwaterlaw/headlamp/blob/5944f5d61f18c73406d793336db6720caacb9130/frontend/src/lib/k8s/cluster.ts#L148)

## Deprecated

For backwards compatibility, please use KubeManagedFieldsEntry

## Extends

- [`KubeManagedFieldsEntry`](KubeManagedFieldsEntry.md)

## Properties

### ~~apiVersion~~

```ts
apiVersion: string;
```

Defined in: [lib/k8s/cluster.ts:108](https://github.com/mishradwaterlaw/headlamp/blob/5944f5d61f18c73406d793336db6720caacb9130/frontend/src/lib/k8s/cluster.ts#L108)

APIVersion defines the version of this resource that this field set applies to.
The format is "group/version" just like the top-level APIVersion field.
It is necessary to track the version of a field set because it cannot be
automatically converted.

#### Inherited from

[`KubeManagedFieldsEntry`](KubeManagedFieldsEntry.md).[`apiVersion`](KubeManagedFieldsEntry.md#apiversion)

***

### ~~fieldsType~~

```ts
fieldsType: string;
```

Defined in: [lib/k8s/cluster.ts:113](https://github.com/mishradwaterlaw/headlamp/blob/5944f5d61f18c73406d793336db6720caacb9130/frontend/src/lib/k8s/cluster.ts#L113)

FieldsType is the discriminator for the different fields format and version.
There is currently only one possible value: "FieldsV1"

#### Inherited from

[`KubeManagedFieldsEntry`](KubeManagedFieldsEntry.md).[`fieldsType`](KubeManagedFieldsEntry.md#fieldstype)

***

### ~~fieldsV1~~

```ts
fieldsV1: object;
```

Defined in: [lib/k8s/cluster.ts:117](https://github.com/mishradwaterlaw/headlamp/blob/5944f5d61f18c73406d793336db6720caacb9130/frontend/src/lib/k8s/cluster.ts#L117)

FieldsV1 holds the first JSON version format as described in the "FieldsV1" type.

#### Inherited from

[`KubeManagedFieldsEntry`](KubeManagedFieldsEntry.md).[`fieldsV1`](KubeManagedFieldsEntry.md#fieldsv1)

***

### ~~manager~~

```ts
manager: string;
```

Defined in: [lib/k8s/cluster.ts:121](https://github.com/mishradwaterlaw/headlamp/blob/5944f5d61f18c73406d793336db6720caacb9130/frontend/src/lib/k8s/cluster.ts#L121)

Manager is an identifier of the workflow managing these fields.

#### Inherited from

[`KubeManagedFieldsEntry`](KubeManagedFieldsEntry.md).[`manager`](KubeManagedFieldsEntry.md#manager)

***

### ~~operation~~

```ts
operation: string;
```

Defined in: [lib/k8s/cluster.ts:126](https://github.com/mishradwaterlaw/headlamp/blob/5944f5d61f18c73406d793336db6720caacb9130/frontend/src/lib/k8s/cluster.ts#L126)

Operation is the type of operation which lead to this ManagedFieldsEntry being
created. The only valid values for this field are 'Apply' and 'Update'.

#### Inherited from

[`KubeManagedFieldsEntry`](KubeManagedFieldsEntry.md).[`operation`](KubeManagedFieldsEntry.md#operation)

***

### ~~subresource~~

```ts
subresource: string;
```

Defined in: [lib/k8s/cluster.ts:135](https://github.com/mishradwaterlaw/headlamp/blob/5944f5d61f18c73406d793336db6720caacb9130/frontend/src/lib/k8s/cluster.ts#L135)

Subresource is the name of the subresource used to update that object, or empty
string if the object was updated through the main resource. The value of this
field is used to distinguish between managers, even if they share the same name.
For example, a status update will be distinct from a regular update using the
same manager name. Note that the APIVersion field is not related to the
Subresource field and it always corresponds to the version of the main resource.

#### Inherited from

[`KubeManagedFieldsEntry`](KubeManagedFieldsEntry.md).[`subresource`](KubeManagedFieldsEntry.md#subresource)

***

### ~~timestamp~~

```ts
timestamp: string;
```

Defined in: [lib/k8s/cluster.ts:142](https://github.com/mishradwaterlaw/headlamp/blob/5944f5d61f18c73406d793336db6720caacb9130/frontend/src/lib/k8s/cluster.ts#L142)

Time is the timestamp of when the ManagedFields entry was added.The timestamp
will also be updated if a field is added, the manager changes any of the owned
fields value or removes a field. The timestamp does not update when a field is
removed from the entry because another manager took it over.

#### Inherited from

[`KubeManagedFieldsEntry`](KubeManagedFieldsEntry.md).[`timestamp`](KubeManagedFieldsEntry.md#timestamp)
