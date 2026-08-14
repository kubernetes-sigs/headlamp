# Function: combinePath()

```ts
function combinePath(base: string, path: string): string;
```

Defined in: [lib/k8s/api/v1/formatUrl.ts:35](https://github.com/mishradwaterlaw/headlamp/blob/fa170d1f3805256c3d561c39c317801d0e2be4b3/frontend/src/lib/k8s/api/v1/formatUrl.ts#L35)

Combines a base path and a path to create a full path.

Doesn't matter if the start or the end has a single slash, the result will always have a single slash.

## Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `base` | `string` | The base path. |
| `path` | `string` | The path to combine with the base path. |

## Returns

`string`

The combined path.
