# Function: getVersion()

```ts
function getVersion(clusterName?: string): Promise<StringDict>;
```

Defined in: [lib/k8s/index.ts:147](https://github.com/kehach07/headlamp/blob/7b4a853c98ea719589ddb64289f86ea94e08b877/frontend/src/lib/k8s/index.ts#L147)

Gets the version of the cluster given by the parameter.

## Parameters

| Parameter | Type | Default value | Description |
| ------ | ------ | ------ | ------ |
| `clusterName` | `string` | `''` | the name of the cluster to query, or the currently selected cluster. |

## Returns

`Promise`\<[`StringDict`](../cluster/interfaces/StringDict.md)\>

a promise that resolves to a dictionary containing version info.
