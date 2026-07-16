# Interface: AppMenu

Defined in: [plugin/lib.ts:88](https://github.com/SaikiaMan/headlamp/blob/ee95cceb66fcc81536dc274d41f70372e38b6d87/frontend/src/plugin/lib.ts#L88)

The members of AppMenu should be the same as the options for the MenuItem in https://www.electronjs.org/docs/latest/api/menu-item
except for the "submenu" (which is the AppMenu type) and "click" (which is not supported here, use the
"url" field instead).

## Indexable

```ts
[key: string]: any
```

Any other members from Electron's MenuItem.

## Properties

### submenu?

```ts
optional submenu?: AppMenu[];
```

Defined in: [plugin/lib.ts:92](https://github.com/SaikiaMan/headlamp/blob/ee95cceb66fcc81536dc274d41f70372e38b6d87/frontend/src/plugin/lib.ts#L92)

The submenus of this menu

***

### url?

```ts
optional url?: string;
```

Defined in: [plugin/lib.ts:90](https://github.com/SaikiaMan/headlamp/blob/ee95cceb66fcc81536dc274d41f70372e38b6d87/frontend/src/plugin/lib.ts#L90)

A URL to open (if not starting with http, then it'll be opened in the external browser)
