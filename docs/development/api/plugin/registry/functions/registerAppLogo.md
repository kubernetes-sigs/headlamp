# Function: registerAppLogo()

```ts
function registerAppLogo(logo: AppLogoType): void;
```

Defined in: [plugin/registry.tsx:694](https://github.com/mishradwaterlaw/headlamp/blob/5944f5d61f18c73406d793336db6720caacb9130/frontend/src/plugin/registry.tsx#L694)

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
