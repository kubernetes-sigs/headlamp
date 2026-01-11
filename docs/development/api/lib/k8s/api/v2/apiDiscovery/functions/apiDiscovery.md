# Function: apiDiscovery()

```ts
function apiDiscovery(clusters: string[]): Promise<ApiResource[]>
```

Discovers available API resources from Kubernetes clusters.
- Only resources that support the 'list' verb are included in the results

## Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `clusters` | `string`[] | An array of cluster names to discover API resources from |

## Returns

`Promise`\<[`ApiResource`](../../ApiResource/interfaces/ApiResource.md)[]\>

list of API resources

## Defined in

[src/lib/k8s/api/v2/apiDiscovery.tsx:133](https://github.com/kubernetes-sigs/headlamp/blob/4f6ccb46282ab9a5d4439bf075672ad3d4cd1113/frontend/src/lib/k8s/api/v2/apiDiscovery.tsx#L133)
