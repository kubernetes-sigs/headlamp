# Interface: CreateResourceEvent

Defined in: [redux/headlampEventSlice.ts:268](https://github.com/mishradwaterlaw/headlamp/blob/fa170d1f3805256c3d561c39c317801d0e2be4b3/frontend/src/redux/headlampEventSlice.ts#L268)

Event fired when creating a resource.

## Properties

### data

```ts
data: object;
```

Defined in: [redux/headlampEventSlice.ts:270](https://github.com/mishradwaterlaw/headlamp/blob/fa170d1f3805256c3d561c39c317801d0e2be4b3/frontend/src/redux/headlampEventSlice.ts#L270)

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

Defined in: [redux/headlampEventSlice.ts:269](https://github.com/mishradwaterlaw/headlamp/blob/fa170d1f3805256c3d561c39c317801d0e2be4b3/frontend/src/redux/headlampEventSlice.ts#L269)
