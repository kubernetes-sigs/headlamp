# Function: getVersion()

```ts
function getVersion(clusterName: string): Promise<StringDict>
```

Gets the version of the cluster given by the parameter.

## Parameters

| Parameter | Type | Default value | Description |
| ------ | ------ | ------ | ------ |
| `clusterName` | `string` | `''` | the name of the cluster to query, or the currently selected cluster. |

## Returns

`Promise`\<[`StringDict`](../cluster/interfaces/StringDict.md)\>

a promise that resolves to a dictionary containing version info.

## Defined in

[src/lib/k8s/index.ts:184](https://github.com/zyzzmohit/headlamp/blob/5c039e27e936e8174f45bbfcab8979134d6fb3fc/frontend/src/lib/k8s/index.ts#L184)
