# lib/k8s/schedulingWorkload

## Classes

| Class | Description |
| ------ | ------ |
| [Workload](classes/Workload.md) | - |

## Interfaces

| Interface | Description |
| ------ | ------ |
| [CompositePodGroupSchedulingPolicy](interfaces/CompositePodGroupSchedulingPolicy.md) | How the child groups of a composite template are scheduled. Mirrors PodGroupSchedulingPolicy, except that the gang policy counts child groups rather than pods. |
| [CompositePodGroupTemplate](interfaces/CompositePodGroupTemplate.md) | A group of pod group templates scheduled together. Served by v1alpha3 and v1beta1, and may nest further composite templates. |
| [KubeSchedulingWorkload](interfaces/KubeSchedulingWorkload.md) | This is the base interface for all Kubernetes resources, i.e. it contains fields that all Kubernetes resources have. |
| [PodGroupTemplate](interfaces/PodGroupTemplate.md) | - |
| [WorkloadSpec](interfaces/WorkloadSpec.md) | - |

## Functions

| Function | Description |
| ------ | ------ |
| [getCompositeDisruptionMode](functions/getCompositeDisruptionMode.md) | Human readable disruption mode of a composite template. The API describes it as one of Single or All: disrupt one child group at a time, or the whole composite together. |
