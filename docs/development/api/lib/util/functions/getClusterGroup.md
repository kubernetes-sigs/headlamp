# Function: getClusterGroup()

```ts
function getClusterGroup(returnWhenNoClusters: string[]): string[]
```

Gets clusters.

## Parameters

| Parameter | Type | Default value | Description |
| ------ | ------ | ------ | ------ |
| `returnWhenNoClusters` | `string`[] | `[]` | return this value when no clusters are found. |

## Returns

`string`[]

the cluster group from the URL.

## Defined in

[src/lib/cluster.ts:95](https://github.com/kubernetes-sigs/headlamp/blob/4f6ccb46282ab9a5d4439bf075672ad3d4cd1113/frontend/src/lib/cluster.ts#L95)
