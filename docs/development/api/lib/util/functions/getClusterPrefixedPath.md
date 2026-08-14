# Function: getClusterPrefixedPath()

```ts
function getClusterPrefixedPath(path?: string | null): string;
```

Defined in: [lib/cluster.ts:27](https://github.com/mishradwaterlaw/headlamp/blob/fa170d1f3805256c3d561c39c317801d0e2be4b3/frontend/src/lib/cluster.ts#L27)

## Parameters

| Parameter | Type |
| ------ | ------ |
| `path?` | `string` \| `null` |

## Returns

`string`

A path prefixed with cluster path, and the given path.

The given path does not start with a /, it will be added.
