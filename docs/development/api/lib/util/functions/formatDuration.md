# Function: formatDuration()

```ts
function formatDuration(duration: number, options?: TimeAgoOptions): string;
```

Defined in: [lib/util.ts:196](https://github.com/mishradwaterlaw/headlamp/blob/fa170d1f3805256c3d561c39c317801d0e2be4b3/frontend/src/lib/util.ts#L196)

Format a duration in milliseconds using either compact or detailed style.

## Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `duration` | `number` | Duration in milliseconds. |
| `options` | [`TimeAgoOptions`](../interfaces/TimeAgoOptions.md) | Options object: - format: 'brief' | 'mini' (default: 'brief') - 'brief': single-unit output (e.g. "5s", "12m", "3h", "2d", "2y") - 'mini': multi-unit output (e.g. "2m30s", "1h15m", "2y2d") |

## Returns

`string`

Formatted duration string.
