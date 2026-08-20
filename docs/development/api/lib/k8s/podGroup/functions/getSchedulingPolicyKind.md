# Function: getSchedulingPolicyKind()

```ts
function getSchedulingPolicyKind(policy: 
  | {
  basic?: unknown;
  gang?: unknown;
}
  | undefined): string | undefined;
```

Defined in: [lib/k8s/podGroup.ts:119](https://github.com/mishradwaterlaw/headlamp/blob/5944f5d61f18c73406d793336db6720caacb9130/frontend/src/lib/k8s/podGroup.ts#L119)

Human readable name of the policy a scheduling policy describes. Takes the shared
shape of the policy union so that composite templates can use it too.

## Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `policy` | \| \{ `basic?`: `unknown`; `gang?`: `unknown`; \} \| `undefined` | The scheduling policy of a PodGroup or of a Workload's template. |

## Returns

`string` \| `undefined`

'Gang', 'Basic', or undefined when no policy is set.
