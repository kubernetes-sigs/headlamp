# Function: asQuery()

```ts
function asQuery(queryParams?: QueryParameters): string
```

Converts k8s queryParams to a URL query string.

## Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `queryParams`? | [`QueryParameters`](../../queryParameters/interfaces/QueryParameters.md) | The k8s API query parameters to convert. |

## Returns

`string`

The query string (starting with '?'), or empty string.

## Defined in

[src/lib/k8s/api/v1/formatUrl.ts:51](https://github.com/kubernetes-sigs/headlamp/blob/4f6ccb46282ab9a5d4439bf075672ad3d4cd1113/frontend/src/lib/k8s/api/v1/formatUrl.ts#L51)
