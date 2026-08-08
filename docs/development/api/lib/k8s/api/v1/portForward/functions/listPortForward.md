# Function: listPortForward()

```ts
function listPortForward(cluster: string): Promise<PortForward[]>;
```

Defined in: [lib/k8s/api/v1/portForward.ts:170](https://github.com/SaikiaMan/headlamp/blob/ee95cceb66fcc81536dc274d41f70372e38b6d87/frontend/src/lib/k8s/api/v1/portForward.ts#L170)

Lists the port forwards for the specified cluster.

## Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `cluster` | `string` | The cluster to list the port forwards. |

## Returns

`Promise`\<[`PortForward`](../interfaces/PortForward.md)[]\>

the list of port forwards for the cluster.
