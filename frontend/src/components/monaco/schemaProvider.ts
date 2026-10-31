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

import type { Monaco } from '@monaco-editor/react';
import * as yaml from 'js-yaml';
import type { editor } from 'monaco-editor';
import getDocDefinitions from '../../lib/docs';
import { request } from '../../lib/k8s/api/v1/clusterRequests';

// In-memory cache for fetched resource schemas
const schemaCache = new Map<string, object | null>();

/**
 * Reset the in-memory schema cache (useful for testing or when cluster context changes)
 */
export function resetSchemaCache() {
  schemaCache.clear();
}

/**
 * Fetch OpenAPI / JSON schema for a Kubernetes resource by apiVersion and kind.
 * Checks core OpenAPI v2 definitions first, then falls back to fetching CRD definitions.
 */
export async function fetchResourceSchema(
  apiVersion: string,
  kind: string
): Promise<object | null> {
  if (!apiVersion || !kind) {
    return null;
  }

  const cacheKey = `${apiVersion}/${kind}`;
  if (schemaCache.has(cacheKey)) {
    return schemaCache.get(cacheKey) || null;
  }

  try {
    // 1. Check core OpenAPI v2 schema via getDocDefinitions
    const coreDef = await getDocDefinitions(apiVersion, kind);
    if (coreDef) {
      schemaCache.set(cacheKey, coreDef);
      return coreDef;
    }
  } catch (err) {
    // Silent fallback to CRD lookup if core OpenAPI lookup fails
  }

  try {
    // 2. Fallback to CRD definitions endpoint
    const [group, version] = apiVersion.includes('/') ? apiVersion.split('/') : ['', apiVersion];
    const crdList = await request('/apis/apiextensions.k8s.io/v1/customresourcedefinitions');

    if (crdList && Array.isArray(crdList.items)) {
      const crd = crdList.items.find((item: any) => {
        const specGroup = item.spec?.group || '';
        const specKind = item.spec?.names?.kind || '';
        return specGroup === group && specKind === kind;
      });

      if (crd && crd.spec && Array.isArray(crd.spec.versions)) {
        const matchedVersion =
          crd.spec.versions.find((v: any) => v.name === version) || crd.spec.versions[0];
        const openAPISchema = matchedVersion?.schema?.openAPIV3Schema;
        if (openAPISchema) {
          schemaCache.set(cacheKey, openAPISchema);
          return openAPISchema;
        }
      }
    }
  } catch (err) {
    // CRD lookup failed or user lacks permissions
  }

  schemaCache.set(cacheKey, null);
  return null;
}

export interface SchemaValidationError {
  path: string;
  message: string;
  line: number;
  column: number;
}

/**
 * Validate a JavaScript object parsed from YAML/JSON against an OpenAPI/JSON Schema properties structure.
 */
export function validateObjectAgainstSchema(
  obj: any,
  schema: any,
  yamlText: string,
  currentPath = ''
): SchemaValidationError[] {
  const errors: SchemaValidationError[] = [];
  if (!obj || typeof obj !== 'object' || !schema) {
    return errors;
  }

  const properties = schema.properties || {};
  const required = Array.isArray(schema.required) ? schema.required : [];

  // Check missing required properties
  for (const reqProp of required) {
    if (obj[reqProp] === undefined) {
      const fullPath = currentPath ? `${currentPath}.${reqProp}` : reqProp;
      const { line, column } = findKeyLocationInYaml(yamlText, currentPath || reqProp);
      errors.push({
        path: fullPath,
        message: `Missing required property '${reqProp}'`,
        line,
        column,
      });
    }
  }

  // Check property types and unknown properties
  for (const key of Object.keys(obj)) {
    const fullPath = currentPath ? `${currentPath}.${key}` : key;
    const propSchema = properties[key];

    if (!propSchema) {
      // Unknown field check if properties schema is defined
      if (Object.keys(properties).length > 0 && key !== 'apiVersion' && key !== 'kind') {
        const { line, column } = findKeyLocationInYaml(yamlText, key);
        errors.push({
          path: fullPath,
          message: `Unknown property '${key}' for schema '${schema.title || 'resource'}'`,
          line,
          column,
        });
      }
      continue;
    }

    // Type check
    const value = obj[key];
    if (propSchema.type) {
      const expectedType = propSchema.type;
      const actualType = Array.isArray(value) ? 'array' : typeof value;

      if (expectedType === 'integer' || expectedType === 'number') {
        if (typeof value !== 'number') {
          const { line, column } = findKeyLocationInYaml(yamlText, key);
          errors.push({
            path: fullPath,
            message: `Invalid type for '${key}': expected ${expectedType}, got ${actualType}`,
            line,
            column,
          });
        }
      } else if (expectedType === 'string' && typeof value !== 'string') {
        const { line, column } = findKeyLocationInYaml(yamlText, key);
        errors.push({
          path: fullPath,
          message: `Invalid type for '${key}': expected string, got ${actualType}`,
          line,
          column,
        });
      } else if (expectedType === 'boolean' && typeof value !== 'boolean') {
        const { line, column } = findKeyLocationInYaml(yamlText, key);
        errors.push({
          path: fullPath,
          message: `Invalid type for '${key}': expected boolean, got ${actualType}`,
          line,
          column,
        });
      } else if (expectedType === 'array' && !Array.isArray(value)) {
        const { line, column } = findKeyLocationInYaml(yamlText, key);
        errors.push({
          path: fullPath,
          message: `Invalid type for '${key}': expected array, got ${actualType}`,
          line,
          column,
        });
      }
    }

    // Recurse into nested object properties
    if (propSchema.type === 'object' && typeof value === 'object' && value !== null) {
      errors.push(...validateObjectAgainstSchema(value, propSchema, yamlText, fullPath));
    }
  }

  return errors;
}

/**
 * Locate line and column number of a key in YAML source code.
 */
function findKeyLocationInYaml(
  yamlText: string,
  keyName: string
): { line: number; column: number } {
  const targetKey = keyName.includes('.') ? keyName.split('.').pop()! : keyName;
  const lines = yamlText.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const matchIndex = line.indexOf(targetKey + ':');
    if (matchIndex !== -1) {
      return { line: i + 1, column: matchIndex + 1 };
    }
  }

  return { line: 1, column: 1 };
}

/**
 * Register schema into Monaco JSON/YAML language defaults and set editor model markers.
 */
export async function applyMonacoSchemaValidation(
  monaco: Monaco,
  editorInstance: editor.IStandaloneCodeEditor,
  yamlText: string
) {
  if (!monaco || !editorInstance) {
    return;
  }

  const model = editorInstance.getModel();
  if (!model) {
    return;
  }

  let parsedObj: any = null;
  try {
    parsedObj = yaml.load(yamlText);
  } catch (e) {
    // If syntax error, skip schema validation markers (handled by headlamp-yaml-parse)
    return;
  }

  if (!parsedObj || typeof parsedObj !== 'object' || Array.isArray(parsedObj)) {
    monaco.editor.setModelMarkers(model, 'headlamp-schema-validation', []);
    return;
  }

  const apiVersion = parsedObj.apiVersion;
  const kind = parsedObj.kind;

  if (!apiVersion || !kind) {
    monaco.editor.setModelMarkers(model, 'headlamp-schema-validation', []);
    return;
  }

  const schema = await fetchResourceSchema(apiVersion, kind);
  if (!schema) {
    monaco.editor.setModelMarkers(model, 'headlamp-schema-validation', []);
    return;
  }

  // Register schema in monaco jsonDefaults for hover and completion support
  const schemaUri = `inmemory://k8s-schemas/${apiVersion}/${kind}.json`;
  if (monaco.languages?.json?.jsonDefaults?.setDiagnosticsOptions) {
    monaco.languages.json.jsonDefaults.setDiagnosticsOptions({
      validate: true,
      schemas: [
        {
          uri: schemaUri,
          fileMatch: [model.uri.toString()],
          schema: schema as any,
        },
      ],
    });
  }

  // Validate parsed YAML object against schema and set markers
  const errors = validateObjectAgainstSchema(parsedObj, schema, yamlText);
  const markers: editor.IMarkerData[] = errors.map(err => ({
    startLineNumber: err.line,
    startColumn: err.column,
    endLineNumber: err.line,
    endColumn: err.column + 20,
    message: err.message,
    severity: monaco.MarkerSeverity.Error,
  }));

  monaco.editor.setModelMarkers(model, 'headlamp-schema-validation', markers);
}
