# Function: makeUrl()

```ts
function makeUrl(urlParts: string | any[], query?: Record<string, any>): string;
```

Defined in: [lib/k8s/api/v2/makeUrl.ts:31](https://github.com/SaikiaMan/headlamp/blob/ee95cceb66fcc81536dc274d41f70372e38b6d87/frontend/src/lib/k8s/api/v2/makeUrl.ts#L31)

Formats URL path

## Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `urlParts` | `string` \| `any`[] | parts of the path, will be separated by / |
| `query` | `Record`\<`string`, `any`\> | query parameters object |

## Returns

`string`

Formatted URL path

## Example

```ts
makeUrl(["my", "path", 5], { name: "hello" })
// returns "/my/path/5?name=hello"
```
