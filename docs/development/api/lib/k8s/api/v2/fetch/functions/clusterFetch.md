# Function: clusterFetch()

```ts
function clusterFetch(url: string | URL, init: RequestInit & object): Promise<Response>
```

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

## Defined in

[src/lib/k8s/api/v2/fetch.ts:75](https://github.com/kubernetes-sigs/headlamp/blob/4f6ccb46282ab9a5d4439bf075672ad3d4cd1113/frontend/src/lib/k8s/api/v2/fetch.ts#L75)
