# Function: makeListRequests()

```ts
function makeListRequests(
   clusters: string[], 
   getAllowedNamespaces: (cluster: string | null) => string[], 
   isResourceNamespaced: boolean, 
   requestedNamespaces?: string[]): object[];
```

Defined in: [lib/k8s/api/v2/useKubeObjectList.ts:513](https://github.com/Rucha0901/headlamp/blob/db946f8d81732ed8fbecf4752fa84b86cab70c8b/frontend/src/lib/k8s/api/v2/useKubeObjectList.ts#L513)

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
