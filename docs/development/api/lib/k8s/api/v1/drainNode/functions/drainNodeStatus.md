# Function: drainNodeStatus()

```ts
function drainNodeStatus(cluster: string, nodeName: string): Promise<DrainNodeStatus>;
```

Defined in: [lib/k8s/api/v1/drainNode.ts:80](https://github.com/Rucha0901/headlamp/blob/db946f8d81732ed8fbecf4752fa84b86cab70c8b/frontend/src/lib/k8s/api/v1/drainNode.ts#L80)

Get the status of the drain node process.

It is used in the node detail page.
As draining a node is a long running process, we poll this endpoint to get
the status of the drain node process.

## Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `cluster` | `string` | The cluster to get the status of the drain node process for. |
| `nodeName` | `string` | The node name to get the status of the drain node process for. |

## Returns

`Promise`\<`DrainNodeStatus`\>

A promise that resolves to the current status of the drain node process.

## Throws

if the request fails

## Throws

if the response is not ok
