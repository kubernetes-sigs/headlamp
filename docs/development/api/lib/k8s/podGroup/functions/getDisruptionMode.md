# Function: getDisruptionMode()

```ts
function getDisruptionMode(mode: 
  | "PodGroup"
  | "Pod"
  | PodGroupDisruptionMode
  | undefined): "PodGroup" | "Pod" | undefined;
```

Defined in: [lib/k8s/podGroup.ts:138](https://github.com/mishradwaterlaw/headlamp/blob/5944f5d61f18c73406d793336db6720caacb9130/frontend/src/lib/k8s/podGroup.ts#L138)

Human readable disruption mode across API versions. v1alpha2 uses the strings
'Pod'/'PodGroup'; v1alpha3 and v1beta1 use an object with a `single` or `all` field.
Both describe the same choice: disrupt one pod at a time, or the whole group together.

## Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `mode` | \| `"PodGroup"` \| `"Pod"` \| [`PodGroupDisruptionMode`](../interfaces/PodGroupDisruptionMode.md) \| `undefined` | The disruptionMode field of a PodGroup spec. |

## Returns

`"PodGroup"` \| `"Pod"` \| `undefined`

'Pod', 'PodGroup', or undefined when no mode is set.
