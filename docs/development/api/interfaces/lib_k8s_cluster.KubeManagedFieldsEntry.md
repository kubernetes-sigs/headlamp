[API](../API.md) / [lib/k8s/cluster](../modules/lib_k8s_cluster.md) / KubeManagedFieldsEntry

# Interface: KubeManagedFieldsEntry

[lib/k8s/cluster](../modules/lib_k8s_cluster.md).KubeManagedFieldsEntry

ManagedFieldsEntry is a workflow-id, a FieldSet and the group version of the
resource that the fieldset applies to.

## Hierarchy

- **`KubeManagedFieldsEntry`**

  ↳ [`KubeManagedFields`](lib_k8s_cluster.KubeManagedFields.md)

## Properties

### apiVersion

• **apiVersion**: `string`

APIVersion defines the version of this resource that this field set applies to.
The format is "group/version" just like the top-level APIVersion field.
It is necessary to track the version of a field set because it cannot be
automatically converted.

#### Defined in

[lib/k8s/cluster.ts:249](https://github.com/kubernetes-sigs/headlamp/blob/072d2509b/frontend/src/lib/k8s/cluster.ts#L249)

___

### fieldsType

• **fieldsType**: `string`

FieldsType is the discriminator for the different fields format and version.
There is currently only one possible value: "FieldsV1"

#### Defined in

[lib/k8s/cluster.ts:254](https://github.com/kubernetes-sigs/headlamp/blob/072d2509b/frontend/src/lib/k8s/cluster.ts#L254)

___

### fieldsV1

• **fieldsV1**: `object`

FieldsV1 holds the first JSON version format as described in the "FieldsV1" type.

#### Defined in

[lib/k8s/cluster.ts:258](https://github.com/kubernetes-sigs/headlamp/blob/072d2509b/frontend/src/lib/k8s/cluster.ts#L258)

___

### manager

• **manager**: `string`

Manager is an identifier of the workflow managing these fields.

#### Defined in

[lib/k8s/cluster.ts:262](https://github.com/kubernetes-sigs/headlamp/blob/072d2509b/frontend/src/lib/k8s/cluster.ts#L262)

___

### operation

• **operation**: `string`

Operation is the type of operation which lead to this ManagedFieldsEntry being
created. The only valid values for this field are 'Apply' and 'Update'.

#### Defined in

[lib/k8s/cluster.ts:267](https://github.com/kubernetes-sigs/headlamp/blob/072d2509b/frontend/src/lib/k8s/cluster.ts#L267)

___

### subresource

• **subresource**: `string`

Subresource is the name of the subresource used to update that object, or empty
string if the object was updated through the main resource. The value of this
field is used to distinguish between managers, even if they share the same name.
For example, a status update will be distinct from a regular update using the
same manager name. Note that the APIVersion field is not related to the
Subresource field and it always corresponds to the version of the main resource.

#### Defined in

[lib/k8s/cluster.ts:276](https://github.com/kubernetes-sigs/headlamp/blob/072d2509b/frontend/src/lib/k8s/cluster.ts#L276)

___

### timestamp

• **timestamp**: `string`

Time is the timestamp of when the ManagedFields entry was added.The timestamp
will also be updated if a field is added, the manager changes any of the owned
fields value or removes a field. The timestamp does not update when a field is
removed from the entry because another manager took it over.

#### Defined in

[lib/k8s/cluster.ts:283](https://github.com/kubernetes-sigs/headlamp/blob/072d2509b/frontend/src/lib/k8s/cluster.ts#L283)
