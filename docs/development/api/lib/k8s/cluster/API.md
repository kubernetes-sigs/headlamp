# lib/k8s/cluster

## Interfaces

| Interface | Description |
| ------ | ------ |
| [Cluster](interfaces/Cluster.md) | - |
| [ContainerState](interfaces/ContainerState.md) | - |
| [KubeCondition](interfaces/KubeCondition.md) | - |
| [KubeContainer](interfaces/KubeContainer.md) | - |
| [KubeContainerProbe](interfaces/KubeContainerProbe.md) | - |
| [KubeContainerStatus](interfaces/KubeContainerStatus.md) | - |
| [~~KubeManagedFields~~](interfaces/KubeManagedFields.md) | - |
| [KubeManagedFieldsEntry](interfaces/KubeManagedFieldsEntry.md) | ManagedFieldsEntry is a workflow-id, a FieldSet and the group version of the resource that the fieldset applies to. |
| [KubeMetrics](interfaces/KubeMetrics.md) | - |
| [KubeOwnerReference](interfaces/KubeOwnerReference.md) | - |
| [LabelSelector](interfaces/LabelSelector.md) | - |
| [StringDict](interfaces/StringDict.md) | - |

## Type Aliases

| Type Alias | Description |
| ------ | ------ |
| [~~KubeObjectIface~~](type-aliases/KubeObjectIface.md) | - |
| [Time](type-aliases/Time.md) | - |

## Variables

| Variable | Description |
| ------ | ------ |
| [HEADLAMP\_ALLOWED\_NAMESPACES](variables/HEADLAMP_ALLOWED_NAMESPACES.md) | - |

## Functions

| Function | Description |
| ------ | ------ |
| [getAllowedNamespaces](functions/getAllowedNamespaces.md) | Gives an optionally configured list of allowed namespaces. |

## References

### ApiListOptions

Re-exports [ApiListOptions](../KubeObject/interfaces/ApiListOptions.md)

***

### ApiListSingleNamespaceOptions

Re-exports [ApiListSingleNamespaceOptions](../KubeObject/interfaces/ApiListSingleNamespaceOptions.md)

***

### AuthRequestResourceAttrs

Re-exports [AuthRequestResourceAttrs](../KubeObject/interfaces/AuthRequestResourceAttrs.md)

***

### KubeMetadata

Re-exports [KubeMetadata](../KubeMetadata/interfaces/KubeMetadata.md)

***

### KubeObject

Re-exports [KubeObject](../KubeObject/classes/KubeObject.md)

***

### KubeObjectClass

Re-exports [KubeObjectClass](../KubeObject/type-aliases/KubeObjectClass.md)

***

### KubeObjectInterface

Re-exports [KubeObjectInterface](../KubeObject/interfaces/KubeObjectInterface.md)

***

### Workload

Re-exports [Workload](../Workload/type-aliases/Workload.md)
