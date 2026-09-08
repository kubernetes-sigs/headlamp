# Function: makeUrl()

```ts
function makeUrl(urlParts: string | any[], query?: Record<string, any>): string;
```

Defined in: [lib/k8s/api/v2/makeUrl.ts:31](https://github.com/Rucha0901/headlamp/blob/db946f8d81732ed8fbecf4752fa84b86cab70c8b/frontend/src/lib/k8s/api/v2/makeUrl.ts#L31)

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
