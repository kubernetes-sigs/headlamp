# Interface: AppTheme

Headlamp App Theme definition

## Properties

### background?

```ts
optional background: object;
```

#### default?

```ts
optional default: string;
```

Background color of the page

#### muted?

```ts
optional muted: string;
```

Shaded background color

#### surface?

```ts
optional surface: string;
```

Background color of popups and menus

#### Defined in

[src/lib/AppTheme.ts:36](https://github.com/kubernetes-sigs/headlamp/blob/4f6ccb46282ab9a5d4439bf075672ad3d4cd1113/frontend/src/lib/AppTheme.ts#L36)

***

### base?

```ts
optional base: "light" | "dark";
```

Base theme to extend

#### Defined in

[src/lib/AppTheme.ts:23](https://github.com/kubernetes-sigs/headlamp/blob/4f6ccb46282ab9a5d4439bf075672ad3d4cd1113/frontend/src/lib/AppTheme.ts#L23)

***

### buttonTextTransform?

```ts
optional buttonTextTransform: "none" | "uppercase";
```

Text style in buttons

#### Defined in

[src/lib/AppTheme.ts:65](https://github.com/kubernetes-sigs/headlamp/blob/4f6ccb46282ab9a5d4439bf075672ad3d4cd1113/frontend/src/lib/AppTheme.ts#L65)

***

### fontFamily?

```ts
optional fontFamily: string[];
```

Font family of the app

#### Defined in

[src/lib/AppTheme.ts:67](https://github.com/kubernetes-sigs/headlamp/blob/4f6ccb46282ab9a5d4439bf075672ad3d4cd1113/frontend/src/lib/AppTheme.ts#L67)

***

### link?

```ts
optional link: object;
```

#### color?

```ts
optional color: string;
```

Link text color

#### Defined in

[src/lib/AppTheme.ts:32](https://github.com/kubernetes-sigs/headlamp/blob/4f6ccb46282ab9a5d4439bf075672ad3d4cd1113/frontend/src/lib/AppTheme.ts#L32)

***

### name

```ts
name: string;
```

#### Defined in

[src/lib/AppTheme.ts:21](https://github.com/kubernetes-sigs/headlamp/blob/4f6ccb46282ab9a5d4439bf075672ad3d4cd1113/frontend/src/lib/AppTheme.ts#L21)

***

### navbar?

```ts
optional navbar: object;
```

#### background?

```ts
optional background: string;
```

Background color of the navbar

#### color?

```ts
optional color: string;
```

Text and icon color of the navbar

#### Defined in

[src/lib/AppTheme.ts:56](https://github.com/kubernetes-sigs/headlamp/blob/4f6ccb46282ab9a5d4439bf075672ad3d4cd1113/frontend/src/lib/AppTheme.ts#L56)

***

### primary?

```ts
optional primary: string;
```

Primary theme color

#### Defined in

[src/lib/AppTheme.ts:25](https://github.com/kubernetes-sigs/headlamp/blob/4f6ccb46282ab9a5d4439bf075672ad3d4cd1113/frontend/src/lib/AppTheme.ts#L25)

***

### radius?

```ts
optional radius: number;
```

General shape radius (things like buttons, popups, etc)

#### Defined in

[src/lib/AppTheme.ts:63](https://github.com/kubernetes-sigs/headlamp/blob/4f6ccb46282ab9a5d4439bf075672ad3d4cd1113/frontend/src/lib/AppTheme.ts#L63)

***

### secondary?

```ts
optional secondary: string;
```

Secondary theme color

#### Defined in

[src/lib/AppTheme.ts:27](https://github.com/kubernetes-sigs/headlamp/blob/4f6ccb46282ab9a5d4439bf075672ad3d4cd1113/frontend/src/lib/AppTheme.ts#L27)

***

### sidebar?

```ts
optional sidebar: object;
```

#### actionBackground?

```ts
optional actionBackground: string;
```

Background color of sidebar action button

#### background?

```ts
optional background: string;
```

Background color of the sidebar

#### color?

```ts
optional color: string;
```

Text and icon color of the sidebar

#### selectedBackground?

```ts
optional selectedBackground: string;
```

Background color for the selected item

#### selectedColor?

```ts
optional selectedColor: string;
```

Text color for the selected item

#### Defined in

[src/lib/AppTheme.ts:44](https://github.com/kubernetes-sigs/headlamp/blob/4f6ccb46282ab9a5d4439bf075672ad3d4cd1113/frontend/src/lib/AppTheme.ts#L44)

***

### text?

```ts
optional text: object;
```

#### primary?

```ts
optional primary: string;
```

Primary text color

#### Defined in

[src/lib/AppTheme.ts:28](https://github.com/kubernetes-sigs/headlamp/blob/4f6ccb46282ab9a5d4439bf075672ad3d4cd1113/frontend/src/lib/AppTheme.ts#L28)
