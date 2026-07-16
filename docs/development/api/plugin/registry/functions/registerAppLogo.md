# Function: registerAppLogo()

```ts
function registerAppLogo(logo: AppLogoType): void;
```

Defined in: [plugin/registry.tsx:672](https://github.com/SaikiaMan/headlamp/blob/ee95cceb66fcc81536dc274d41f70372e38b6d87/frontend/src/plugin/registry.tsx#L672)

Add a logo for Headlamp to use instead of the default one.

## Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `logo` | [`AppLogoType`](../type-aliases/AppLogoType.md) | is a React Component that takes two required props `logoType` which is a constant string literal that accepts either of the two values `small` or `large` depending on whether the sidebar is in shrink or expanded state so that you can change your logo from small to large and the other optional prop is the `themeName` which is a string with two values 'light' and 'dark' base on which theme is selected. |

## Returns

`void`

## Example

```tsx
import { registerAppLogo } from '@kinvolk/headlamp-plugin/lib';

registerAppLogo(<p>my logo</p>)
```

More complete logo example in plugins/examples/change-logo:

## See

[Change Logo Example](http://github.com/kinvolk/headlamp/plugins/examples/change-logo/)
