# Function: makeListRequests()

```ts
function makeListRequests(
   clusters: string[], 
   getAllowedNamespaces: (cluster: null | string) => string[], 
   isResourceNamespaced: boolean, 
   requestedNamespaces: string[]): object[]
```

Creates multiple requests to list Kube objects
Handles multiple clusters, namespaces and allowed namespaces

## Parameters

| Parameter | Type | Default value | Description |
| ------ | ------ | ------ | ------ |
| `clusters` | `string`[] | `undefined` | list of clusters |
| `getAllowedNamespaces` | (`cluster`: `null` \| `string`) => `string`[] | `undefined` | function to get allowed namespaces for a cluster |
| `isResourceNamespaced` | `boolean` | `undefined` | if the resource is namespaced |
| `requestedNamespaces` | `string`[] | `[]` | requested namespaces(optional) |

## Returns

`object`[]

list of requests for clusters and appropriate namespaces

## Defined in

[src/lib/k8s/api/v2/useKubeObjectList.ts:375](https://github.com/kubernetes-sigs/headlamp/blob/4f6ccb46282ab9a5d4439bf075672ad3d4cd1113/frontend/src/lib/k8s/api/v2/useKubeObjectList.ts#L375)
