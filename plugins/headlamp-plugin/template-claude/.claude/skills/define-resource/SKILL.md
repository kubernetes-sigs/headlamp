---
name: define-resource
description: Define a typed custom-resource class for one of the project's CRDs — model its spec/status as a TypeScript interface from the live CRD schema, subclass KubeObject<Interface>, and add typed getters. This is the foundation the list, detail, Map, and action skills all build on. Use first, per CRD, before /add-list-view and /add-detail-view. Works standalone (add a model for a CRD that shipped later).
allowed-tools:
  - mcp__kubernetes__*
  - Bash(kubectl get:*)
  - Bash(kubectl explain:*)
  - Write(src/resources/**)
  - Edit(src/resources/**)
  - Edit(PLAN.md)
---

# define-resource

Every view, Map node, and mutation reads the resource through a **typed class** — so model the CRD
once, here, and everything downstream reads `obj.componentType` instead of `obj.jsonData?.spec?.…?`
soup. One file per CRD: `src/resources/<name>.ts`. Model from the **live CRD schema**, never guessed
shapes.

## The pattern (what every CNCF plugin does)

A typed CRD class is `class X extends KubeObject<XInterface>` with **static** API metadata and typed
getters. This is the standard across the official CNCF plugins (keda, cert-manager, knative, strimzi,
volcano, cluster-api, …) on the current lib.

```ts
// src/resources/component.ts  (Dapr Component example)
import { KubeObject, KubeObjectInterface } from '@kinvolk/headlamp-plugin/lib/k8s/cluster';

export interface ComponentSpec { type: string; version: string; metadata?: { name: string; value?: string }[] }
export interface DaprComponent extends KubeObjectInterface {
  spec: ComponentSpec;
  status?: { conditions?: { type: string; status: string; reason?: string; message?: string }[] };
}

export class Component extends KubeObject<DaprComponent> {
  static apiVersion = 'dapr.io/v1alpha1';   // or an array for multiple served versions
  static kind = 'Component';
  static apiName = 'components';             // the CRD plural
  static isNamespaced = true;

  get spec() { return this.jsonData.spec; }
  // computed getters centralize defaults / optional handling:
  get componentType(): string { return this.spec?.type ?? ''; }
  get readyStatus(): string {
    const c = this.jsonData.status?.conditions ?? [];
    return c.find(x => x.type === 'Ready')?.status ?? 'Unknown';
  }
}
```

The class inherits `.useList()` / `.useGet()` and drops into `resourceClass={Component}`. `KubeObject`
and `KubeObjectInterface` are both value/type from the externalized `@kinvolk/headlamp-plugin/lib/k8s/cluster`
(runtime-safe; CLAUDE.md).

## Steps

1. **Read the CRD schema from the cluster** — don't recall it from memory:
   - `kubectl get crd <plural>.<group> -o yaml` → **group, version(s), `scope` (Namespaced?), kind,
     `names.plural`** (= `apiName`), and `spec.versions[].schema.openAPIV3Schema` (the field shape).
   - `kubectl explain <res>.spec` / `.status` to sanity-check; read a real seeded instance
     (`kubectl get <res>/<name> -o yaml`) so optional/absent fields are obvious.
2. **Write the `spec`/`status` interface** `extends KubeObjectInterface` from that schema — model the
   real shape, mark optional fields `?`, reuse shared enums/types from `src/resources/common.ts`.
3. **Subclass `KubeObject<Interface>`** with the static API metadata + typed getters (above). Add a
   getter whenever a view needs a clean field — that's what the typed class is for.
4. **Shared types → `src/resources/common.ts`** — cross-CRD enums/types (e.g. a `Condition` shape),
   the **status→severity** mapper reused by list + detail, and `PROJECT = { name, docsUrl, installCmd }`
   (the not-installed banner's source of truth, set by `/ensure-dependency`).

## Notes

- **Multiple served versions:** `static apiVersion = ['x.io/v1', 'x.io/v1beta1']` (cluster-api,
  strimzi do this). For version-divergent shapes, normalize in getters/helpers.
- **Cluster-scoped CRDs:** `static isNamespaced = false` and the detail route drops `:namespace`.
- **Alternative — `makeCustomResourceClass({ apiInfo, kind, pluralName, singularName, isNamespaced })`**
  from `@kinvolk/headlamp-plugin/lib/Crd` — use it only when you generate many similar classes **from
  config** (radius, karpenter wrap it in a factory). For a hand-written CRD class, prefer
  `extends KubeObject<Interface>` (simpler, and what 9/10 CNCF plugins use).
- **Verify with a live load** — `extends KubeObject<Interface>` resolves to the externalized
  `pluginLib.K8s.cluster.KubeObject` at runtime; a wrong value-import elsewhere still passes the gates
  and crashes at load, so re-check via `/run-and-verify` whenever you add a new value import or `extends`.

**North star:** keda's `src/resources/*.ts` + `common.ts`, and cluster-api's `src/resources/` for
multi-version handling — https://github.com/headlamp-k8s/plugins/tree/main/keda
