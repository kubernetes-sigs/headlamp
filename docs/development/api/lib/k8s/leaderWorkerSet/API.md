# lib/k8s/leaderWorkerSet

## Classes

| Class | Description |
| ------ | ------ |
| [LeaderWorkerSet](classes/LeaderWorkerSet.md) | - |

## Interfaces

| Interface | Description |
| ------ | ------ |
| [KubeLeaderWorkerSet](interfaces/KubeLeaderWorkerSet.md) | This is the base interface for all Kubernetes resources, i.e. it contains fields that all Kubernetes resources have. |

## Variables

| Variable | Description |
| ------ | ------ |
| [LEADER\_WORKER\_SET\_NAME\_LABEL](variables/LEADER_WORKER_SET_NAME_LABEL.md) | Label the leader worker set controller stamps on every stateful set and pod it creates for a leader worker set, set to the leader worker set's name. Owner references can't stand in for it: a group's worker stateful set is owned by that group's leader pod rather than by the leader worker set. |
