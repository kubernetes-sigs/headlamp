# Function: getClusterPrefixedPath()

```ts
function getClusterPrefixedPath(path?: string | null): string;
```

Defined in: [lib/cluster.ts:27](https://github.com/SaikiaMan/headlamp/blob/ee95cceb66fcc81536dc274d41f70372e38b6d87/frontend/src/lib/cluster.ts#L27)

## Parameters

| Parameter | Type |
| ------ | ------ |
| `path?` | `string` \| `null` |

## Returns

`string`

A path prefixed with cluster path, and the given path.

The given path does not start with a /, it will be added.
