# Interface: AppTheme

Defined in: [lib/AppTheme.ts:20](https://github.com/SaikiaMan/headlamp/blob/ee95cceb66fcc81536dc274d41f70372e38b6d87/frontend/src/lib/AppTheme.ts#L20)

Headlamp App Theme definition

## Properties

### background?

```ts
optional background?: object;
```

Defined in: [lib/AppTheme.ts:36](https://github.com/SaikiaMan/headlamp/blob/ee95cceb66fcc81536dc274d41f70372e38b6d87/frontend/src/lib/AppTheme.ts#L36)

#### default?

```ts
optional default?: string;
```

Background color of the page

#### muted?

```ts
optional muted?: string;
```

Shaded background color

#### surface?

```ts
optional surface?: string;
```

Background color of popups and menus

***

### base?

```ts
optional base?: "light" | "dark";
```

Defined in: [lib/AppTheme.ts:23](https://github.com/SaikiaMan/headlamp/blob/ee95cceb66fcc81536dc274d41f70372e38b6d87/frontend/src/lib/AppTheme.ts#L23)

Base theme to extend

***

### buttonTextTransform?

```ts
optional buttonTextTransform?: "none" | "uppercase";
```

Defined in: [lib/AppTheme.ts:120](https://github.com/SaikiaMan/headlamp/blob/ee95cceb66fcc81536dc274d41f70372e38b6d87/frontend/src/lib/AppTheme.ts#L120)

Text style in buttons

***

### fontFamily?

```ts
optional fontFamily?: string[];
```

Defined in: [lib/AppTheme.ts:122](https://github.com/SaikiaMan/headlamp/blob/ee95cceb66fcc81536dc274d41f70372e38b6d87/frontend/src/lib/AppTheme.ts#L122)

Font family of the app

***

### link?

```ts
optional link?: object;
```

Defined in: [lib/AppTheme.ts:32](https://github.com/SaikiaMan/headlamp/blob/ee95cceb66fcc81536dc274d41f70372e38b6d87/frontend/src/lib/AppTheme.ts#L32)

#### color?

```ts
optional color?: string;
```

Link text color

***

### name

```ts
name: string;
```

Defined in: [lib/AppTheme.ts:21](https://github.com/SaikiaMan/headlamp/blob/ee95cceb66fcc81536dc274d41f70372e38b6d87/frontend/src/lib/AppTheme.ts#L21)

***

### navbar?

```ts
optional navbar?: object;
```

Defined in: [lib/AppTheme.ts:56](https://github.com/SaikiaMan/headlamp/blob/ee95cceb66fcc81536dc274d41f70372e38b6d87/frontend/src/lib/AppTheme.ts#L56)

#### background?

```ts
optional background?: string;
```

Background color of the navbar

#### color?

```ts
optional color?: string;
```

Text and icon color of the navbar

#### searchHint?

```ts
optional searchHint?: string;
```

Global search shortcut hint (falls back in createMuiTheme if omitted)

***

### primary?

```ts
optional primary?: string;
```

Defined in: [lib/AppTheme.ts:25](https://github.com/SaikiaMan/headlamp/blob/ee95cceb66fcc81536dc274d41f70372e38b6d87/frontend/src/lib/AppTheme.ts#L25)

Primary theme color

***

### radius?

```ts
optional radius?: number;
```

Defined in: [lib/AppTheme.ts:118](https://github.com/SaikiaMan/headlamp/blob/ee95cceb66fcc81536dc274d41f70372e38b6d87/frontend/src/lib/AppTheme.ts#L118)

General shape radius (things like buttons, popups, etc)

***

### secondary?

```ts
optional secondary?: string;
```

Defined in: [lib/AppTheme.ts:27](https://github.com/SaikiaMan/headlamp/blob/ee95cceb66fcc81536dc274d41f70372e38b6d87/frontend/src/lib/AppTheme.ts#L27)

Secondary theme color

***

### sidebar?

```ts
optional sidebar?: object;
```

Defined in: [lib/AppTheme.ts:44](https://github.com/SaikiaMan/headlamp/blob/ee95cceb66fcc81536dc274d41f70372e38b6d87/frontend/src/lib/AppTheme.ts#L44)

#### actionBackground?

```ts
optional actionBackground?: string;
```

Background color of sidebar action button

#### background?

```ts
optional background?: string;
```

Background color of the sidebar

#### color?

```ts
optional color?: string;
```

Text and icon color of the sidebar

#### selectedBackground?

```ts
optional selectedBackground?: string;
```

Background color for the selected item

#### selectedColor?

```ts
optional selectedColor?: string;
```

Text color for the selected item

***

### terminal?

```ts
optional terminal?: object;
```

Defined in: [lib/AppTheme.ts:85](https://github.com/SaikiaMan/headlamp/blob/ee95cceb66fcc81536dc274d41f70372e38b6d87/frontend/src/lib/AppTheme.ts#L85)

Optional terminal (xterm.js) color overrides.

The pod log viewer, pod exec terminal and node shell all render with
xterm.js. By default Headlamp picks readable colors out of the surrounding
MUI palette and an auto-selected ANSI palette. Plugins that swap the rest
of the palette can also set specific terminal colors here without having
to call any extra function.

Anything left undefined is filled in by Headlamp:
  - `background` falls back to the MUI muted/default surface,
  - `foreground` and `cursor` fall back to the MUI primary text color,
  - each missing `ansi.*` entry is taken from a built-in 16-color palette
    auto-selected (and contrast-clamped) for the actual terminal
    background luminance, so light-on-light or dark-on-dark output is
    never invisible.

Tip: plugin authors should make sure `foreground` keeps a 4.5:1 contrast
ratio against `background` (WCAG 2.1 AA), so that the terminal stays
readable.

#### ansi?

```ts
optional ansi?: object;
```

16-color ANSI palette used by program output. Each entry is optional;
any color that's left out is filled from a built-in palette
auto-selected for the terminal background's luminance, then nudged
darker/lighter as needed so it stays visible against that background.

##### ansi.black?

```ts
optional black?: string;
```

##### ansi.blue?

```ts
optional blue?: string;
```

##### ansi.brightBlack?

```ts
optional brightBlack?: string;
```

##### ansi.brightBlue?

```ts
optional brightBlue?: string;
```

##### ansi.brightCyan?

```ts
optional brightCyan?: string;
```

##### ansi.brightGreen?

```ts
optional brightGreen?: string;
```

##### ansi.brightMagenta?

```ts
optional brightMagenta?: string;
```

##### ansi.brightRed?

```ts
optional brightRed?: string;
```

##### ansi.brightWhite?

```ts
optional brightWhite?: string;
```

##### ansi.brightYellow?

```ts
optional brightYellow?: string;
```

##### ansi.cyan?

```ts
optional cyan?: string;
```

##### ansi.green?

```ts
optional green?: string;
```

##### ansi.magenta?

```ts
optional magenta?: string;
```

##### ansi.red?

```ts
optional red?: string;
```

##### ansi.white?

```ts
optional white?: string;
```

##### ansi.yellow?

```ts
optional yellow?: string;
```

#### background?

```ts
optional background?: string;
```

Background color of the terminal/log viewer area.

#### cursor?

```ts
optional cursor?: string;
```

Cursor color.

#### foreground?

```ts
optional foreground?: string;
```

Default foreground (text) color of the terminal.

***

### text?

```ts
optional text?: object;
```

Defined in: [lib/AppTheme.ts:28](https://github.com/SaikiaMan/headlamp/blob/ee95cceb66fcc81536dc274d41f70372e38b6d87/frontend/src/lib/AppTheme.ts#L28)

#### primary?

```ts
optional primary?: string;
```

Primary text color
