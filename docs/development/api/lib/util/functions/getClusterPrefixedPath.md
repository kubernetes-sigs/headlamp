# Function: getClusterPrefixedPath()

```ts
function getClusterPrefixedPath(path?: string | null): string;
```

Defined in: [lib/cluster.ts:27](https://github.com/kehach07/headlamp/blob/7b4a853c98ea719589ddb64289f86ea94e08b877/frontend/src/lib/cluster.ts#L27)

## Parameters

| Parameter | Type |
| ------ | ------ |
| `path?` | `string` \| `null` |

## Returns

`string`

A path prefixed with cluster path, and the given path.

The given path does not start with a /, it will be added.
