# Interface: RollbackOptions

Defined in: [lib/k8s/rollback.ts:22](https://github.com/mishradwaterlaw/headlamp/blob/5944f5d61f18c73406d793336db6720caacb9130/frontend/src/lib/k8s/rollback.ts#L22)

Options for a rollback operation.

## Properties

### dryRun?

```ts
optional dryRun?: boolean;
```

Defined in: [lib/k8s/rollback.ts:32](https://github.com/mishradwaterlaw/headlamp/blob/5944f5d61f18c73406d793336db6720caacb9130/frontend/src/lib/k8s/rollback.ts#L32)

If true, performs a server-side dry-run: the API server validates and processes
the patch but does not persist it. The resulting resource is returned in
dryRunResult.

#### See

[K8s: Dry-Run](https://kubernetes.io/docs/reference/using-api/api-concepts/#dry-run)

***

### toRevision?

```ts
optional toRevision?: number;
```

Defined in: [lib/k8s/rollback.ts:24](https://github.com/mishradwaterlaw/headlamp/blob/5944f5d61f18c73406d793336db6720caacb9130/frontend/src/lib/k8s/rollback.ts#L24)

Target revision number. If omitted, rolls back to the previous revision.
