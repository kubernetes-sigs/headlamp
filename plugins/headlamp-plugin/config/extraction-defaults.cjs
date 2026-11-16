/*
 * Copyright 2026 The Kubernetes Authors
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

// @ts-check

/** @typedef {{key: string, ns?: string | false, defaultValue?: string, explicitDefault?: boolean}} DefaultEntry */
/** @typedef {{type: string, value?: unknown, expression?: SourceNode, arguments?: {expression: SourceNode}[], expressions?: SourceNode[], quasis?: {cooked?: string | null}[]}} SourceNode */

function createDefaultValuePlugin() {
  /** @type {Map<string, { value: string, explicit: boolean, priority: number }>} */
  const sourceDefaults = new Map();
  /** @type {Set<string>} */
  const fallbackKeys = new Set();
  let nodeType = '';
  /** @type {string | undefined} */
  let shorthandDefault;

  return {
    name: 'headlamp-key-defaults',
    setup() {
      sourceDefaults.clear();
      fallbackKeys.clear();
      nodeType = '';
      shorthandDefault = undefined;
    },
    onLoad() {
      nodeType = '';
      shorthandDefault = undefined;
      return undefined;
    },
    /** @param {SourceNode} node */
    onVisitNode(node) {
      // The native visitor identifies the source node before submitting its keys.
      nodeType = node.type;
      shorthandDefault = undefined;
      if (node.type !== 'CallExpression' && node.type !== 'NewExpression') return;
      let value = node.arguments?.[1]?.expression;
      while (value?.type === 'ParenthesisExpression') value = value.expression;
      if (value?.type === 'StringLiteral' && typeof value.value === 'string') {
        shorthandDefault = value.value;
      } else if (value?.type === 'TemplateLiteral' && value.expressions?.length === 0) {
        shorthandDefault = value.quasis?.[0]?.cooked ?? undefined;
      }
    },
    /** @param {Readonly<DefaultEntry>} entry */
    onKeySubmitted(entry) {
      if (entry.defaultValue === undefined) return;
      const id = JSON.stringify([entry.ns, entry.key]);
      const explicit = entry.explicitDefault === true;
      const fromCall = explicit || entry.defaultValue === shorthandDefault;
      if (!fromCall && (nodeType !== 'JSXElement' || entry.defaultValue === '')) {
        fallbackKeys.add(id);
        return;
      }
      const previous = sourceDefaults.get(id);
      const priority = fromCall ? 2 : 1;
      // Source priority is separate from the CLI flag that protects existing plural text.
      if (!previous || priority > previous.priority) {
        sourceDefaults.set(id, { value: entry.defaultValue, explicit, priority });
      }
    },
    /** @param {Map<string, DefaultEntry>} keys */
    onEnd(keys) {
      for (const entry of keys.values()) {
        const id = JSON.stringify([entry.ns, entry.key]);
        const chosen = sourceDefaults.get(id);
        if (chosen) {
          entry.defaultValue = chosen.value;
          entry.explicitDefault = chosen.explicit;
          continue;
        }
        const prefix = `${entry.ns}|`;
        if (entry.defaultValue?.startsWith(prefix) && fallbackKeys.has(id)) {
          entry.defaultValue = entry.defaultValue.slice(prefix.length);
        }
      }
    },
  };
}

module.exports = { createDefaultValuePlugin };
