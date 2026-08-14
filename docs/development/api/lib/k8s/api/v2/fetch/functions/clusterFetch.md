# Function: clusterFetch()

```ts
function clusterFetch(url: string | URL, init: RequestInit & object): Promise<Response>;
```

Defined in: [lib/k8s/api/v2/fetch.ts:80](https://github.com/mishradwaterlaw/headlamp/blob/fa170d1f3805256c3d561c39c317801d0e2be4b3/frontend/src/lib/k8s/api/v2/fetch.ts#L80)

A wrapper around Fetch function
Allows sending requests to a particular cluster

## Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `url` | `string` \| `URL` | URL path |
| `init` | `RequestInit` & `object` | same as second parameter of the Fetch function |

## Returns

`Promise`\<`Response`\>

fetch Response
