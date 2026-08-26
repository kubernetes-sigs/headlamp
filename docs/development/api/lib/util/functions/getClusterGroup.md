# Function: getClusterGroup()

```ts
function getClusterGroup(returnWhenNoClusters?: string[]): string[];
```

Defined in: [lib/cluster.ts:95](https://github.com/kehach07/headlamp/blob/7b4a853c98ea719589ddb64289f86ea94e08b877/frontend/src/lib/cluster.ts#L95)

Gets clusters.

## Parameters

| Parameter | Type | Default value | Description |
| ------ | ------ | ------ | ------ |
| `returnWhenNoClusters` | `string`[] | `[]` | return this value when no clusters are found. |

## Returns

`string`[]

the cluster group from the URL.
