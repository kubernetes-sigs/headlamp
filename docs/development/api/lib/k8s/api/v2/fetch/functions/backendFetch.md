# Function: backendFetch()

```ts
function backendFetch(url: string | URL, init?: RequestInit): Promise<Response>;
```

Defined in: [lib/k8s/api/v2/fetch.ts:38](https://github.com/mishradwaterlaw/headlamp/blob/5944f5d61f18c73406d793336db6720caacb9130/frontend/src/lib/k8s/api/v2/fetch.ts#L38)

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
