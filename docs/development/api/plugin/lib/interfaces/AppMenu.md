# Interface: AppMenu

The members of AppMenu should be the same as the options for the MenuItem in https://www.electronjs.org/docs/latest/api/menu-item
except for the "submenu" (which is the AppMenu type) and "click" (which is not supported here, use the
"url" field instead).

## Indexable

 \[`key`: `string`\]: `any`

## Properties

### submenu?

```ts
optional submenu: AppMenu[];
```

The submenus of this menu

#### Defined in

[src/plugin/lib.ts:92](https://github.com/kubernetes-sigs/headlamp/blob/4f6ccb46282ab9a5d4439bf075672ad3d4cd1113/frontend/src/plugin/lib.ts#L92)

***

### url?

```ts
optional url: string;
```

A URL to open (if not starting with http, then it'll be opened in the external browser)

#### Defined in

[src/plugin/lib.ts:90](https://github.com/kubernetes-sigs/headlamp/blob/4f6ccb46282ab9a5d4439bf075672ad3d4cd1113/frontend/src/plugin/lib.ts#L90)
