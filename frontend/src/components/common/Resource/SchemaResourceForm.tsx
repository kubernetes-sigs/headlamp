/*
 * Copyright 2025 The Kubernetes Authors
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import React from 'react';
import { useTranslation } from 'react-i18next';
import getDocDefinitions from '../../../lib/docs';
import Loader from '../Loader';
import CreateResourceForm, { FormField, FormSection } from './CreateResourceForm';

/** Minimal subset of an OpenAPI v2 schema object that this module walks. */
interface SchemaNode {
  type?: string;
  description?: string;
  properties?: Record<string, SchemaNode>;
  required?: string[];
  items?: SchemaNode;
  additionalProperties?: SchemaNode | boolean;
}

/** Minimal class shape the form needs: a Kubernetes object class exposes
 *  `apiVersion` and `kind` (e.g. `ReplicaSet.apiVersion === 'apps/v1'`).
 *  We don't depend on KubeObject itself to keep this form decoupled. */
export interface KubeObjectClassLike {
  apiVersion: string;
  kind: string;
}

/** Props for {@link SchemaResourceForm}. Shares the `{ resource, onChange }`
 *  contract used by all create-resource forms so the YAML editor in the
 *  Create / Apply activity can stay in sync. */
export interface SchemaResourceFormProps {
  /** Kubernetes resource class used to look up the OpenAPI schema. */
  kubeObjectClass: KubeObjectClassLike;
  /** Current resource object (kept in sync with the YAML editor). */
  resource?: Record<string, any>;
  /** Called when the form mutates the resource object. */
  onChange: (resource: Record<string, any>) => void;
}

/** Walk dotted `properties` chain. Returns undefined if any segment is missing. */
function getProp(schema: SchemaNode | undefined, path: string[]): SchemaNode | undefined {
  let cur: SchemaNode | undefined = schema;
  for (const seg of path) {
    if (!cur?.properties) return undefined;
    cur = cur.properties[seg];
    if (!cur) return undefined;
  }
  return cur;
}

/** True when `key` is listed in the parent's `required` array. */
function isRequired(schema: SchemaNode | undefined, parentPath: string[], key: string): boolean {
  const parent = getProp(schema, parentPath);
  return Array.isArray(parent?.required) && parent!.required!.includes(key);
}

/** Known-path renderers for common workload-spec fields. Each entry is added
 *  only when the OpenAPI schema actually exposes the property, so the same
 *  form definition works across ReplicaSet/Deployment/StatefulSet/etc. */
function buildSpecFields(schema: SchemaNode | undefined, t: (key: string) => string): FormField[] {
  const fields: FormField[] = [];
  if (!getProp(schema, ['spec'])) return fields;

  const has = (path: string[]) => !!getProp(schema, path);
  const desc = (path: string[]) => getProp(schema, path)?.description;

  if (has(['spec', 'replicas'])) {
    fields.push({
      key: 'replicas',
      path: 'spec.replicas',
      label: t('translation|Replicas'),
      type: 'number',
      min: 0,
      inline: true,
      required: isRequired(schema, ['spec'], 'replicas'),
      helperText: desc(['spec', 'replicas']),
    });
  }

  if (has(['spec', 'minReadySeconds'])) {
    fields.push({
      key: 'minReadySeconds',
      path: 'spec.minReadySeconds',
      label: t('translation|Min Ready Seconds'),
      type: 'number',
      min: 0,
      inline: true,
      helperText: desc(['spec', 'minReadySeconds']),
    });
  }

  if (has(['spec', 'selector', 'matchLabels'])) {
    fields.push({
      key: 'matchLabels',
      path: 'spec.selector.matchLabels',
      label: t('translation|matchLabels'),
      type: 'labels',
      required: isRequired(schema, ['spec'], 'selector'),
      helperText:
        desc(['spec', 'selector']) ??
        t(
          'translation|Selects which pods are managed by this resource; must match the pod template labels'
        ),
    });
  }

  return fields;
}

/** Pod-template fields, included when the resource has `spec.template`. */
function buildTemplateFields(
  schema: SchemaNode | undefined,
  t: (key: string) => string
): FormField[] {
  const fields: FormField[] = [];
  if (!getProp(schema, ['spec', 'template'])) return fields;

  if (getProp(schema, ['spec', 'template', 'metadata', 'labels'])) {
    fields.push({
      key: 'podLabels',
      path: 'spec.template.metadata.labels',
      label: t('translation|Pod template labels'),
      type: 'labels',
      helperText: t('translation|Labels applied to pods created by this resource'),
    });
  }

  if (getProp(schema, ['spec', 'template', 'spec', 'containers'])) {
    fields.push({
      key: 'containers',
      path: 'spec.template.spec.containers',
      label: t('translation|Containers'),
      type: 'containers',
      required: true,
    });
  }

  if (getProp(schema, ['spec', 'template', 'spec', 'nodeName'])) {
    fields.push({
      key: 'nodeName',
      path: 'spec.template.spec.nodeName',
      label: t('translation|Node Name'),
      helperText: t('translation|Optional: schedule pods on a specific node'),
    });
  }

  return fields;
}

/** Reusable schema-driven create form. Looks up the OpenAPI definition for
 *  `kubeObjectClass` via {@link getDocDefinitions} and derives `sections` from
 *  the schema (which fields exist, which are required, schema descriptions for
 *  helper text). Delegates rendering to {@link CreateResourceForm} so YAML
 *  editor sync, namespace autocomplete, labels and containers editors all keep
 *  working unchanged. */
export default function SchemaResourceForm(props: SchemaResourceFormProps) {
  const { kubeObjectClass, resource, onChange } = props;
  const { t } = useTranslation(['translation', 'glossary']);

  const apiVersion = kubeObjectClass.apiVersion;
  const kind = kubeObjectClass.kind;

  // `undefined` = loading, `null` = no schema found / fetch failed.
  const [schema, setSchema] = React.useState<SchemaNode | null | undefined>(undefined);

  React.useEffect(() => {
    let cancelled = false;
    setSchema(undefined);
    getDocDefinitions(apiVersion, kind)
      .then(def => {
        if (!cancelled) setSchema((def as SchemaNode | undefined) ?? null);
      })
      .catch(() => {
        if (!cancelled) setSchema(null);
      });
    return () => {
      cancelled = true;
    };
  }, [apiVersion, kind]);

  const sections: FormSection[] = React.useMemo(() => {
    const schemaForFields = schema ?? undefined;
    const metadataSchema = getProp(schemaForFields, ['metadata']);

    const metadata: FormSection = {
      title: t('translation|Metadata'),
      fields: [
        {
          key: 'name',
          path: 'metadata.name',
          label: t('translation|Name'),
          required: true,
          helperText: metadataSchema?.properties?.name?.description,
        },
        {
          key: 'namespace',
          path: 'metadata.namespace',
          label: t('glossary|Namespace'),
          type: 'namespace',
          helperText: metadataSchema?.properties?.namespace?.description,
        },
        {
          key: 'labels',
          path: 'metadata.labels',
          label: t('translation|Labels'),
          type: 'labels',
          helperText: metadataSchema?.properties?.labels?.description,
        },
      ],
    };

    const specFields = buildSpecFields(schemaForFields, t);
    const templateFields = buildTemplateFields(schemaForFields, t);

    const out: FormSection[] = [metadata];
    if (specFields.length > 0) {
      out.push({ title: t('translation|Spec'), fields: specFields });
    }
    if (templateFields.length > 0) {
      out.push({ title: t('translation|Pod Template'), fields: templateFields });
    }
    return out;
  }, [schema, t]);

  if (schema === undefined) {
    return <Loader title={t('translation|Loading resource schema')} />;
  }

  return <CreateResourceForm sections={sections} resource={resource ?? {}} onChange={onChange} />;
}
