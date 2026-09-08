# lib/k8s/podGroup

## Classes

| Class | Description |
| ------ | ------ |
| [PodGroup](classes/PodGroup.md) | - |

## Interfaces

| Interface | Description |
| ------ | ------ |
| [KubePodGroup](interfaces/KubePodGroup.md) | This is the base interface for all Kubernetes resources, i.e. it contains fields that all Kubernetes resources have. |
| [PodGroupDisruptionMode](interfaces/PodGroupDisruptionMode.md) | How v1alpha3 and v1beta1 describe which pods a disruption affects. Exactly one field is set: `single` matches the v1alpha2 'Pod' mode, `all` matches 'PodGroup'. |
| [PodGroupResourceClaim](interfaces/PodGroupResourceClaim.md) | - |
| [PodGroupSchedulingConstraints](interfaces/PodGroupSchedulingConstraints.md) | Scheduling constraints copied from a PodGroupTemplate. |
| [PodGroupSchedulingPolicy](interfaces/PodGroupSchedulingPolicy.md) | How the pods of a group are scheduled. Exactly one field is set: `gang` for all-or-nothing semantics, `basic` for standard Kubernetes scheduling. |
| [PodGroupSpec](interfaces/PodGroupSpec.md) | - |
| [PodGroupTemplateReference](interfaces/PodGroupTemplateReference.md) | How v1alpha2 references the Workload a group was templated from. |
| [PodGroupWorkloadReference](interfaces/PodGroupWorkloadReference.md) | How v1alpha3 and v1beta1 reference the Workload a group was templated from. |

## Variables

| Variable | Description |
| ------ | ------ |
| [POD\_GROUP\_INITIALLY\_SCHEDULED\_CONDITION](variables/POD_GROUP_INITIALLY_SCHEDULED_CONDITION.md) | The same condition as served by v1alpha3 and v1beta1. |
| [POD\_GROUP\_SCHEDULED\_CONDITION](variables/POD_GROUP_SCHEDULED_CONDITION.md) | Condition reporting whether the group's scheduling requirement has been satisfied. Served by v1alpha2. Later versions renamed it, see the constant below. |

## Functions

| Function | Description |
| ------ | ------ |
| [getDisruptionMode](functions/getDisruptionMode.md) | Human readable disruption mode across API versions. v1alpha2 uses the strings 'Pod'/'PodGroup'; v1alpha3 and v1beta1 use an object with a `single` or `all` field. Both describe the same choice: disrupt one pod at a time, or the whole group together. |
| [getSchedulingPolicyKind](functions/getSchedulingPolicyKind.md) | Human readable name of the policy a scheduling policy describes. Takes the shared shape of the policy union so that composite templates can use it too. |
