# Interface: PluginSettingsDetailsProps

Props for PluginSettingsDetailsProps component.

## Properties

### data?

```ts
readonly optional data: object;
```

Data object representing the current state/configuration.
readonly - The data object is readonly and cannot be modified.

#### Index Signature

 \[`key`: `string`\]: `any`

#### Defined in

[src/plugin/pluginsSlice.ts:34](https://github.com/zyzzmohit/headlamp/blob/5c039e27e936e8174f45bbfcab8979134d6fb3fc/frontend/src/plugin/pluginsSlice.ts#L34)

***

### onDataChange()?

```ts
optional onDataChange: (data: object) => void;
```

Callback function to be triggered when there's a change in data.

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `data` | `object` | The updated data object. |

#### Returns

`void`

#### Defined in

[src/plugin/pluginsSlice.ts:28](https://github.com/zyzzmohit/headlamp/blob/5c039e27e936e8174f45bbfcab8979134d6fb3fc/frontend/src/plugin/pluginsSlice.ts#L28)
