# Function: apiDiscovery()

```ts
function apiDiscovery(clusters: string[]): Promise<ApiResource[]>;
```

Defined in: [lib/k8s/api/v2/apiDiscovery.tsx:264](https://github.com/SaikiaMan/headlamp/blob/ee95cceb66fcc81536dc274d41f70372e38b6d87/frontend/src/lib/k8s/api/v2/apiDiscovery.tsx#L264)

Discovers available API resources from Kubernetes clusters.
- Only resources that support the 'list' verb are included in the results

## Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `clusters` | `string`[] | An array of cluster names to discover API resources from |

## Returns

`Promise`\<[`ApiResource`](../../ApiResource/interfaces/ApiResource.md)[]\>

list of API resources
