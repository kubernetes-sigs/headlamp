# Interface: PluginSettingsDetailsProps

Defined in: [plugin/pluginsSlice.ts:23](https://github.com/Rucha0901/headlamp/blob/db946f8d81732ed8fbecf4752fa84b86cab70c8b/frontend/src/plugin/pluginsSlice.ts#L23)

Props for PluginSettingsDetailsProps component.

## Properties

### data?

```ts
readonly optional data?: object;
```

Defined in: [plugin/pluginsSlice.ts:34](https://github.com/Rucha0901/headlamp/blob/db946f8d81732ed8fbecf4752fa84b86cab70c8b/frontend/src/plugin/pluginsSlice.ts#L34)

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

Defined in: [plugin/pluginsSlice.ts:28](https://github.com/Rucha0901/headlamp/blob/db946f8d81732ed8fbecf4752fa84b86cab70c8b/frontend/src/plugin/pluginsSlice.ts#L28)

Callback function to be triggered when there's a change in data.

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `data` | \{ \[`key`: `string`\]: `any`; \} | The updated data object. |

#### Returns

`void`
