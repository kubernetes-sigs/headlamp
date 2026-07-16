# Interface: PluginSettingsDetailsProps

Defined in: [plugin/pluginsSlice.ts:23](https://github.com/SaikiaMan/headlamp/blob/ee95cceb66fcc81536dc274d41f70372e38b6d87/frontend/src/plugin/pluginsSlice.ts#L23)

Props for PluginSettingsDetailsProps component.

## Properties

### data?

```ts
readonly optional data?: object;
```

Defined in: [plugin/pluginsSlice.ts:34](https://github.com/SaikiaMan/headlamp/blob/ee95cceb66fcc81536dc274d41f70372e38b6d87/frontend/src/plugin/pluginsSlice.ts#L34)

Data object representing the current state/configuration.
readonly - The data object is readonly and cannot be modified.

#### Index Signature

```ts
[key: string]: any
```

***

### onDataChange?

```ts
optional onDataChange?: (data: object) => void;
```

Defined in: [plugin/pluginsSlice.ts:28](https://github.com/SaikiaMan/headlamp/blob/ee95cceb66fcc81536dc274d41f70372e38b6d87/frontend/src/plugin/pluginsSlice.ts#L28)

Callback function to be triggered when there's a change in data.

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `data` | \{ \[`key`: `string`\]: `any`; \} | The updated data object. |

#### Returns

`void`
