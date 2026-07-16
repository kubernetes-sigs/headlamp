# Function: isValidTimezone()

```ts
function isValidTimezone(tz: string): boolean;
```

Defined in: [lib/util.ts:214](https://github.com/SaikiaMan/headlamp/blob/ee95cceb66fcc81536dc274d41f70372e38b6d87/frontend/src/lib/util.ts#L214)

Returns true when tz is a valid IANA timezone string accepted by the
Intl API. Some Linux systems expose TZ=:/etc/localtime which Chrome
resolves to "Etc/Unknown" — an identifier that Node accepts but browsers
reject with a RangeError.

## Parameters

| Parameter | Type |
| ------ | ------ |
| `tz` | `string` |

## Returns

`boolean`
