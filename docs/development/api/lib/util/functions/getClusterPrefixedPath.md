# Function: getClusterPrefixedPath()

```ts
function getClusterPrefixedPath(path?: string | null): string;
```

Defined in: [lib/cluster.ts:27](https://github.com/mishradwaterlaw/headlamp/blob/5944f5d61f18c73406d793336db6720caacb9130/frontend/src/lib/cluster.ts#L27)

## Parameters

| Parameter | Type |
| ------ | ------ |
| `path?` | `string` \| `null` |

## Returns

`string`

A path prefixed with cluster path, and the given path.

The given path does not start with a /, it will be added.
