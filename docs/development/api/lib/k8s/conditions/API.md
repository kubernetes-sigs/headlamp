# lib/k8s/conditions

## Type Aliases

| Type Alias | Description |
| ------ | ------ |
| [ConditionLike](type-aliases/ConditionLike.md) | The part of a status condition these helpers rely on. Kept structural so it accepts both [KubeCondition](../cluster/interfaces/KubeCondition.md) and the looser condition types custom resources declare for themselves. |

## Functions

| Function | Description |
| ------ | ------ |
| [getTopCondition](functions/getTopCondition.md) | Picks the single most meaningful met condition to show in a list column. |
| [isConditionTrue](functions/isConditionTrue.md) | Whether the given conditions report `type` as met. |
