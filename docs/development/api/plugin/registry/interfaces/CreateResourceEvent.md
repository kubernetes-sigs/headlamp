# Interface: CreateResourceEvent

Defined in: [redux/headlampEventSlice.ts:288](https://github.com/mishradwaterlaw/headlamp/blob/5944f5d61f18c73406d793336db6720caacb9130/frontend/src/redux/headlampEventSlice.ts#L288)

Event fired when creating a resource.

## Properties

### data

```ts
data: object;
```

Defined in: [redux/headlampEventSlice.ts:290](https://github.com/mishradwaterlaw/headlamp/blob/5944f5d61f18c73406d793336db6720caacb9130/frontend/src/redux/headlampEventSlice.ts#L290)

#### status

```ts
status: CONFIRMED;
```

What exactly this event represents. 'CONFIRMED' when the user chooses to apply the new resource.
For now only 'CONFIRMED' is sent.

***

### type

```ts
type: CREATE_RESOURCE;
```

Defined in: [redux/headlampEventSlice.ts:289](https://github.com/mishradwaterlaw/headlamp/blob/5944f5d61f18c73406d793336db6720caacb9130/frontend/src/redux/headlampEventSlice.ts#L289)
