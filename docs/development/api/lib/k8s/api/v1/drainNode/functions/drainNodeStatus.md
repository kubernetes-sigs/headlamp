# Function: drainNodeStatus()

```ts
function drainNodeStatus(cluster: string, nodeName: string): Promise<DrainNodeStatus>;
```

Defined in: [lib/k8s/api/v1/drainNode.ts:80](https://github.com/SaikiaMan/headlamp/blob/ee95cceb66fcc81536dc274d41f70372e38b6d87/frontend/src/lib/k8s/api/v1/drainNode.ts#L80)

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
