[API](../API.md) / [plugin/registry](../modules/plugin_registry.md) / AppLogoProps

# Interface: AppLogoProps

[plugin/registry](../modules/plugin_registry.md).AppLogoProps

## Indexable

▪ [key: `string`]: `any`

## Properties

### className

• `Optional` **className**: `string`

A class to use on your SVG.

#### Defined in

[components/App/AppLogo.tsx:19](https://github.com/kubernetes-sigs/headlamp/blob/072d2509b/frontend/src/components/App/AppLogo.tsx#L19)

___

### logoType

• `Optional` **logoType**: ``"small"`` \| ``"large"``

The size of the logo. 'small' for in mobile view, and 'large' for tablet and desktop sizes. By default the 'large' is used.

#### Defined in

[components/App/AppLogo.tsx:15](https://github.com/kubernetes-sigs/headlamp/blob/072d2509b/frontend/src/components/App/AppLogo.tsx#L15)

___

### sx

• `Optional` **sx**: `SxProps`<`Theme`\>

SxProps to use on your SVG.

#### Defined in

[components/App/AppLogo.tsx:21](https://github.com/kubernetes-sigs/headlamp/blob/072d2509b/frontend/src/components/App/AppLogo.tsx#L21)

___

### themeName

• `Optional` **themeName**: ``"dark"`` \| ``"light"``

User selected theme. By default it checks which is is active.

#### Defined in

[components/App/AppLogo.tsx:17](https://github.com/kubernetes-sigs/headlamp/blob/072d2509b/frontend/src/components/App/AppLogo.tsx#L17)
