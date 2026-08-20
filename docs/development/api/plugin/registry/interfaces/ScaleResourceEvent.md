# Interface: ScaleResourceEvent

Defined in: [redux/headlampEventSlice.ts:167](https://github.com/mishradwaterlaw/headlamp/blob/5944f5d61f18c73406d793336db6720caacb9130/frontend/src/redux/headlampEventSlice.ts#L167)

Event fired when scaling a resource.

## Properties

### data

```ts
data: object;
```

Defined in: [redux/headlampEventSlice.ts:169](https://github.com/mishradwaterlaw/headlamp/blob/5944f5d61f18c73406d793336db6720caacb9130/frontend/src/redux/headlampEventSlice.ts#L169)

#### resource

```ts
resource: KubeObject;
```

The resource for which the deletion was called.

#### status

```ts
status: CONFIRMED;
```

What exactly this event represents. 'CONFIRMED' when the scaling is selected by the user.
For now only 'CONFIRMED' is sent.

***

### type

```ts
type: SCALE_RESOURCE;
```

Defined in: [redux/headlampEventSlice.ts:168](https://github.com/mishradwaterlaw/headlamp/blob/5944f5d61f18c73406d793336db6720caacb9130/frontend/src/redux/headlampEventSlice.ts#L168)
