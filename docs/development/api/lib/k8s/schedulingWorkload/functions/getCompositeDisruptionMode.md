# Function: getCompositeDisruptionMode()

```ts
function getCompositeDisruptionMode(mode: 
  | PodGroupDisruptionMode
  | undefined): "Single" | "All" | undefined;
```

Defined in: [lib/k8s/schedulingWorkload.ts:85](https://github.com/mishradwaterlaw/headlamp/blob/5944f5d61f18c73406d793336db6720caacb9130/frontend/src/lib/k8s/schedulingWorkload.ts#L85)

Human readable disruption mode of a composite template. The API describes it as one
of Single or All: disrupt one child group at a time, or the whole composite together.

## Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `mode` | \| [`PodGroupDisruptionMode`](../../podGroup/interfaces/PodGroupDisruptionMode.md) \| `undefined` | The disruptionMode field of a composite template. |

## Returns

`"Single"` \| `"All"` \| `undefined`

'Single', 'All', or undefined when no mode is set.
