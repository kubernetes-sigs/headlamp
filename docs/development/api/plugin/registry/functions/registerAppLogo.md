# Function: registerAppLogo()

```ts
function registerAppLogo(logo: AppLogoType): void
```

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

## Defined in

[src/plugin/registry.tsx:641](https://github.com/zyzzmohit/headlamp/blob/5c039e27e936e8174f45bbfcab8979134d6fb3fc/frontend/src/plugin/registry.tsx#L641)
