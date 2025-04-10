[API](../API.md) / [plugin/lib](../modules/plugin_lib.md) / AppMenu

# Interface: AppMenu

[plugin/lib](../modules/plugin_lib.md).AppMenu

The members of AppMenu should be the same as the options for the MenuItem in https://www.electronjs.org/docs/latest/api/menu-item
except for the "submenu" (which is the AppMenu type) and "click" (which is not supported here, use the
"url" field instead).

## Indexable

▪ [key: `string`]: `any`

Any other members from Electron's MenuItem.

## Properties

### submenu

• `Optional` **submenu**: [`AppMenu`](plugin_lib.AppMenu.md)[]

The submenus of this menu

#### Defined in

[plugin/lib.ts:74](https://github.com/kubernetes-sigs/headlamp/blob/072d2509b/frontend/src/plugin/lib.ts#L74)

___

### url

• `Optional` **url**: `string`

A URL to open (if not starting with http, then it'll be opened in the external browser)

#### Defined in

[plugin/lib.ts:72](https://github.com/kubernetes-sigs/headlamp/blob/072d2509b/frontend/src/plugin/lib.ts#L72)
