# Interface: LabelSelector

Defined in: [lib/k8s/cluster.ts:527](https://github.com/mishradwaterlaw/headlamp/blob/5944f5d61f18c73406d793336db6720caacb9130/frontend/src/lib/k8s/cluster.ts#L527)

## Properties

### matchExpressions?

```ts
optional matchExpressions?: object[];
```

Defined in: [lib/k8s/cluster.ts:528](https://github.com/mishradwaterlaw/headlamp/blob/5944f5d61f18c73406d793336db6720caacb9130/frontend/src/lib/k8s/cluster.ts#L528)

#### key

```ts
key: string;
```

#### operator

```ts
operator: string;
```

#### values

```ts
values: string[];
```

***

### matchLabels?

```ts
optional matchLabels?: object;
```

Defined in: [lib/k8s/cluster.ts:533](https://github.com/mishradwaterlaw/headlamp/blob/5944f5d61f18c73406d793336db6720caacb9130/frontend/src/lib/k8s/cluster.ts#L533)

#### Index Signature

```ts
[key: string]: string
```
