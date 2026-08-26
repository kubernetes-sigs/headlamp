# Function: getClusterGroup()

```ts
function getClusterGroup(returnWhenNoClusters?: string[]): string[];
```

Defined in: [lib/cluster.ts:95](https://github.com/mishradwaterlaw/headlamp/blob/5944f5d61f18c73406d793336db6720caacb9130/frontend/src/lib/cluster.ts#L95)

Gets clusters.

## Parameters

| Parameter | Type | Default value | Description |
| ------ | ------ | ------ | ------ |
| `returnWhenNoClusters` | `string`[] | `[]` | return this value when no clusters are found. |

## Returns

`string`[]

the cluster group from the URL.
