# Function: timeAgo()

```ts
function timeAgo(date: DateParam, options?: TimeAgoOptions): string;
```

Defined in: [lib/util.ts:172](https://github.com/mishradwaterlaw/headlamp/blob/5944f5d61f18c73406d793336db6720caacb9130/frontend/src/lib/util.ts#L172)

Returns the time elapsed since the given date.

## Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `date` | [`DateParam`](../type-aliases/DateParam.md) | The date from which to calculate elapsed time. |
| `options` | [`TimeAgoOptions`](../interfaces/TimeAgoOptions.md) | Formatting options: - 'brief': single-unit format (e.g. "5m", "2h") - 'mini': multi-unit format (e.g. "2m30s", "1h15m") |

## Returns

`string`

The formatted elapsed duration.
