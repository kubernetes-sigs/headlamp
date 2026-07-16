# Function: getVersion()

```ts
function getVersion(clusterName?: string): Promise<StringDict>;
```

Defined in: [lib/k8s/index.ts:145](https://github.com/SaikiaMan/headlamp/blob/ee95cceb66fcc81536dc274d41f70372e38b6d87/frontend/src/lib/k8s/index.ts#L145)

Gets the version of the cluster given by the parameter.

## Parameters

| Parameter | Type | Default value | Description |
| ------ | ------ | ------ | ------ |
| `clusterName` | `string` | `''` | the name of the cluster to query, or the currently selected cluster. |

## Returns

`Promise`\<[`StringDict`](../cluster/interfaces/StringDict.md)\>

a promise that resolves to a dictionary containing version info.
