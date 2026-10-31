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

/**
 * The Kubernetes API server reports problems on requests it accepted (deprecated APIs,
 * Pod Security and admission policy warnings, unknown fields, ...) in `Warning` response
 * headers. See https://kubernetes.io/blog/2020/09/03/warnings/
 */

/**
 * One `warn-value` of the `Warning` header (RFC 7234): `<code> <agent> "<text>" ["<date>"]`.
 * The text is a quoted string, so it can contain commas and escaped quotes.
 */
const WARN_VALUE_REGEX = /(\d{3})\s+\S+\s+"((?:[^"\\]|\\.)*)"(?:\s+"[^"]*")?/g;

/** The warn-code the Kubernetes API server uses for its warnings. */
const KUBERNETES_WARN_CODE = '299';

/**
 * Gets the warning messages out of the value of a `Warning` response header.
 *
 * `fetch` joins several `Warning` headers into one string separated by `, `, so the value
 * may hold more than one warning. Values that are not Kubernetes warnings, or that are
 * malformed, are ignored. Repeated warnings are returned once.
 *
 * @param header - The value of the `Warning` header, for example from `response.headers.get('Warning')`.
 *
 * @returns The warning messages, in the order they were sent.
 */
export function parseWarningHeader(header?: string | null): string[] {
  const warnings: string[] = [];
  if (!header) {
    return warnings;
  }

  for (const [, code, quotedText] of Array.from(header.matchAll(WARN_VALUE_REGEX))) {
    if (code !== KUBERNETES_WARN_CODE) {
      continue;
    }

    const warning = quotedText.replace(/\\(.)/g, '$1').trim();
    if (warning && !warnings.includes(warning)) {
      warnings.push(warning);
    }
  }

  return warnings;
}

export type ApiWarningsListener = (warnings: string[]) => void;

const listeners = new Set<ApiWarningsListener>();

/**
 * Listens to the warnings the API server returned for write requests (create, update,
 * patch, delete, and their dry runs).
 *
 * @param listener - Called with the warnings of each response that had any.
 *
 * @returns A function that stops listening.
 */
export function subscribeToApiWarnings(listener: ApiWarningsListener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/**
 * Passes warnings from an API response to the listeners.
 *
 * @param warnings - The warning messages of one response.
 */
export function publishApiWarnings(warnings: string[]) {
  if (warnings.length === 0) {
    return;
  }

  listeners.forEach(listener => {
    try {
      listener(warnings);
    } catch (err) {
      console.error('Error in an API warnings listener:', err);
    }
  });
}
