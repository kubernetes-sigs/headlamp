# Function: backendFetch()

```ts
function backendFetch(url: string | URL, init: RequestInit): Promise<Response>
```

Simple wrapper around Fetch function
Sends a request to the backend

## Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `url` | `string` \| `URL` | URL path |
| `init` | `RequestInit` | options parameter for the Fetch function |

## Returns

`Promise`\<`Response`\>

fetch Response

## Defined in

[src/lib/k8s/api/v2/fetch.ts:38](https://github.com/kubernetes-sigs/headlamp/blob/4f6ccb46282ab9a5d4439bf075672ad3d4cd1113/frontend/src/lib/k8s/api/v2/fetch.ts#L38)
