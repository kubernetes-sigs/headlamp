# Function: apiDiscovery()

```ts
function apiDiscovery(clusters: string[]): Promise<ApiResource[]>;
```

Defined in: [lib/k8s/api/v2/apiDiscovery.tsx:264](https://github.com/kehach07/headlamp/blob/7b4a853c98ea719589ddb64289f86ea94e08b877/frontend/src/lib/k8s/api/v2/apiDiscovery.tsx#L264)

Discovers available API resources from Kubernetes clusters.
- Only resources that support the 'list' verb are included in the results

## Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `clusters` | `string`[] | An array of cluster names to discover API resources from |

## Returns

`Promise`\<[`ApiResource`](../../ApiResource/interfaces/ApiResource.md)[]\>

list of API resources
