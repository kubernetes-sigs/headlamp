# Function: getClusterGroup()

```ts
function getClusterGroup(returnWhenNoClusters?: string[]): string[];
```

Defined in: [lib/cluster.ts:95](https://github.com/Rucha0901/headlamp/blob/db946f8d81732ed8fbecf4752fa84b86cab70c8b/frontend/src/lib/cluster.ts#L95)

Gets clusters.

## Parameters

| Parameter | Type | Default value | Description |
| ------ | ------ | ------ | ------ |
| `returnWhenNoClusters` | `string`[] | `[]` | return this value when no clusters are found. |

## Returns

`string`[]

the cluster group from the URL.
