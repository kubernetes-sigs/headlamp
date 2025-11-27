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

export const NAMESPACES = ['translation', 'glossary', 'app'] as const;
export const REFERENCE_LANG = 'en';

export type Namespace = typeof NAMESPACES[number];

export interface TranslationCounts {
  total: number;
  translated: number;
  empty: number;
}

export interface LanguageStats {
  [key: string]: TranslationCounts;
  total: TranslationCounts & { percentage: number };
}

export interface Translations {
  [key: string]: string;
}
