# Function: makeListRequests()

```ts
function makeListRequests(
   clusters: string[], 
   getAllowedNamespaces: (cluster: string | null) => string[], 
   isResourceNamespaced: boolean, 
   requestedNamespaces?: string[]): object[];
```

Defined in: [lib/k8s/api/v2/useKubeObjectList.ts:393](https://github.com/SaikiaMan/headlamp/blob/ee95cceb66fcc81536dc274d41f70372e38b6d87/frontend/src/lib/k8s/api/v2/useKubeObjectList.ts#L393)

Creates multiple requests to list Kube objects
Handles multiple clusters, namespaces and allowed namespaces

## Parameters

| Parameter | Type | Default value | Description |
| ------ | ------ | ------ | ------ |
| `clusters` | `string`[] | `undefined` | list of clusters |
| `getAllowedNamespaces` | (`cluster`: `string` \| `null`) => `string`[] | `undefined` | function to get allowed namespaces for a cluster |
| `isResourceNamespaced` | `boolean` | `undefined` | if the resource is namespaced |
| `requestedNamespaces` | `string`[] | `[]` | requested namespaces(optional) |

## Returns

`object`[]

list of requests for clusters and appropriate namespaces
