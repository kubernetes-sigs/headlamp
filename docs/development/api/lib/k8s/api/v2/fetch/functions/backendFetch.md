# Function: backendFetch()

```ts
function backendFetch(url: string | URL, init?: RequestInit): Promise<Response>;
```

Defined in: [lib/k8s/api/v2/fetch.ts:38](https://github.com/mishradwaterlaw/headlamp/blob/fa170d1f3805256c3d561c39c317801d0e2be4b3/frontend/src/lib/k8s/api/v2/fetch.ts#L38)

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
