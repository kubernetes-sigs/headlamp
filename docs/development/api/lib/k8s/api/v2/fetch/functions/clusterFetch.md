# Function: clusterFetch()

```ts
function clusterFetch(url: string | URL, init: RequestInit & object): Promise<Response>;
```

Defined in: [lib/k8s/api/v2/fetch.ts:80](https://github.com/kehach07/headlamp/blob/7b4a853c98ea719589ddb64289f86ea94e08b877/frontend/src/lib/k8s/api/v2/fetch.ts#L80)

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
