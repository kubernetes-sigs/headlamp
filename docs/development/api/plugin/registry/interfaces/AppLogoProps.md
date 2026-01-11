# Interface: AppLogoProps

## Indexable

 \[`key`: `string`\]: `any`

## Properties

### className?

```ts
optional className: string;
```

A class to use on your SVG.

#### Defined in

[src/components/App/AppLogo.tsx:35](https://github.com/kubernetes-sigs/headlamp/blob/4f6ccb46282ab9a5d4439bf075672ad3d4cd1113/frontend/src/components/App/AppLogo.tsx#L35)

***

### logoType?

```ts
optional logoType: "small" | "large";
```

The size of the logo. 'small' for in mobile view, and 'large' for tablet and desktop sizes. By default the 'large' is used.

#### Defined in

[src/components/App/AppLogo.tsx:31](https://github.com/kubernetes-sigs/headlamp/blob/4f6ccb46282ab9a5d4439bf075672ad3d4cd1113/frontend/src/components/App/AppLogo.tsx#L31)

***

### sx?

```ts
optional sx: SxProps<Theme>;
```

SxProps to use on your SVG.

#### Defined in

[src/components/App/AppLogo.tsx:37](https://github.com/kubernetes-sigs/headlamp/blob/4f6ccb46282ab9a5d4439bf075672ad3d4cd1113/frontend/src/components/App/AppLogo.tsx#L37)

***

### themeName?

```ts
optional themeName: string;
```

User selected theme. By default it checks which is is active.

#### Defined in

[src/components/App/AppLogo.tsx:33](https://github.com/kubernetes-sigs/headlamp/blob/4f6ccb46282ab9a5d4439bf075672ad3d4cd1113/frontend/src/components/App/AppLogo.tsx#L33)
