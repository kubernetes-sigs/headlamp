# Interface: Activity

Defined in: [components/activity/Activity.tsx:69](https://github.com/mishradwaterlaw/headlamp/blob/5944f5d61f18c73406d793336db6720caacb9130/frontend/src/components/activity/Activity.tsx#L69)

Independent screen or a page rendered on top of the app

## Properties

### cluster?

```ts
optional cluster?: string;
```

Defined in: [components/activity/Activity.tsx:90](https://github.com/mishradwaterlaw/headlamp/blob/5944f5d61f18c73406d793336db6720caacb9130/frontend/src/components/activity/Activity.tsx#L90)

Cluster of the launched activity

***

### content

```ts
content: ReactNode;
```

Defined in: [components/activity/Activity.tsx:73](https://github.com/mishradwaterlaw/headlamp/blob/5944f5d61f18c73406d793336db6720caacb9130/frontend/src/components/activity/Activity.tsx#L73)

Content to display inside the activity

***

### hideTitleInHeader?

```ts
optional hideTitleInHeader?: boolean;
```

Defined in: [components/activity/Activity.tsx:79](https://github.com/mishradwaterlaw/headlamp/blob/5944f5d61f18c73406d793336db6720caacb9130/frontend/src/components/activity/Activity.tsx#L79)

Hides title from the window header

***

### icon?

```ts
optional icon?: ReactNode;
```

Defined in: [components/activity/Activity.tsx:81](https://github.com/mishradwaterlaw/headlamp/blob/5944f5d61f18c73406d793336db6720caacb9130/frontend/src/components/activity/Activity.tsx#L81)

Activity icon, optional but highly recommended

***

### id

```ts
id: string;
```

Defined in: [components/activity/Activity.tsx:71](https://github.com/mishradwaterlaw/headlamp/blob/5944f5d61f18c73406d793336db6720caacb9130/frontend/src/components/activity/Activity.tsx#L71)

Unique ID

***

### location

```ts
location: ActivityLocation;
```

Defined in: [components/activity/Activity.tsx:75](https://github.com/mishradwaterlaw/headlamp/blob/5944f5d61f18c73406d793336db6720caacb9130/frontend/src/components/activity/Activity.tsx#L75)

Current activity location

***

### minimized?

```ts
optional minimized?: boolean;
```

Defined in: [components/activity/Activity.tsx:83](https://github.com/mishradwaterlaw/headlamp/blob/5944f5d61f18c73406d793336db6720caacb9130/frontend/src/components/activity/Activity.tsx#L83)

Whether this activity is minimized to the taskbar

***

### temporary?

```ts
optional temporary?: boolean;
```

Defined in: [components/activity/Activity.tsx:88](https://github.com/mishradwaterlaw/headlamp/blob/5944f5d61f18c73406d793336db6720caacb9130/frontend/src/components/activity/Activity.tsx#L88)

Temporary activity will be closed if another activity is opened
It will turn into permanent one if user interacts with it

***

### title?

```ts
optional title?: ReactNode;
```

Defined in: [components/activity/Activity.tsx:77](https://github.com/mishradwaterlaw/headlamp/blob/5944f5d61f18c73406d793336db6720caacb9130/frontend/src/components/activity/Activity.tsx#L77)

Title to render in the taskbar and in window
