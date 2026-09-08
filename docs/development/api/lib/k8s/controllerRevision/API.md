# lib/k8s/controllerRevision

## Classes

| Class | Description |
| ------ | ------ |
| [ControllerRevision](classes/ControllerRevision.md) | ControllerRevision implements an immutable snapshot of state data. Used for rollback operations on DaemonSets and StatefulSets. |

## Interfaces

| Interface | Description |
| ------ | ------ |
| [KubeControllerRevision](interfaces/KubeControllerRevision.md) | ControllerRevision implements an immutable snapshot of state data. Clients are responsible for serializing and deserializing the objects that contain their internal state. |
