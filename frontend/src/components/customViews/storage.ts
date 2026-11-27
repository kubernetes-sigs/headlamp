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

export const CUSTOM_VIEWS_STORAGE_KEY = 'headlamp.custom-views';
export const MAX_CUSTOM_VIEWS = 50;

export type CustomViewColSpan = 4 | 6 | 12;

export interface CustomViewWidgetInstance {
  id: string;
  type: string;
  title: string;
  colSpan?: CustomViewColSpan;
  config: Record<string, any>;
}

export interface CustomView {
  id: string;
  name: string;
  description?: string;
  cluster?: string;
  createdAt: number;
  updatedAt: number;
  widgets: CustomViewWidgetInstance[];
}

export function createCustomViewId(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }

  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function normalizeColSpan(value: unknown): CustomViewColSpan {
  if (value === 4 || value === 6 || value === 12) {
    return value;
  }

  return 6;
}

function normalizeWidget(value: unknown): CustomViewWidgetInstance | null {
  if (!value || typeof value !== 'object') {
    return null;
  }

  const candidate = value as Partial<CustomViewWidgetInstance>;
  if (typeof candidate.type !== 'string' || !candidate.type.trim()) {
    return null;
  }

  const id =
    typeof candidate.id === 'string' && candidate.id.trim()
      ? candidate.id.trim()
      : createCustomViewId();
  const title =
    typeof candidate.title === 'string' && candidate.title.trim()
      ? candidate.title.trim()
      : candidate.type;
  const config =
    candidate.config && typeof candidate.config === 'object' && !Array.isArray(candidate.config)
      ? candidate.config
      : {};

  return {
    id,
    type: candidate.type.trim(),
    title,
    colSpan: normalizeColSpan(candidate.colSpan),
    config,
  };
}

export function normalizeCustomView(value: unknown): CustomView | null {
  if (!value || typeof value !== 'object') {
    return null;
  }

  const candidate = value as Partial<CustomView>;
  if (typeof candidate.name !== 'string' || !candidate.name.trim()) {
    return null;
  }

  const now = Date.now();
  const widgets = Array.isArray(candidate.widgets)
    ? candidate.widgets
        .map(normalizeWidget)
        .filter((w): w is CustomViewWidgetInstance => Boolean(w))
    : [];

  return {
    id:
      typeof candidate.id === 'string' && candidate.id.trim()
        ? candidate.id.trim()
        : createCustomViewId(),
    name: candidate.name.trim(),
    description:
      typeof candidate.description === 'string' && candidate.description.trim()
        ? candidate.description.trim()
        : undefined,
    cluster:
      typeof candidate.cluster === 'string' && candidate.cluster.trim()
        ? candidate.cluster.trim()
        : undefined,
    createdAt: typeof candidate.createdAt === 'number' ? candidate.createdAt : now,
    updatedAt: typeof candidate.updatedAt === 'number' ? candidate.updatedAt : now,
    widgets,
  };
}

export function readCustomViews(storage?: Storage): CustomView[] {
  try {
    const targetStorage = storage ?? (typeof localStorage !== 'undefined' ? localStorage : null);
    if (!targetStorage) {
      return [];
    }

    const raw = targetStorage.getItem(CUSTOM_VIEWS_STORAGE_KEY);
    if (!raw) {
      return [];
    }

    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed
      .map(normalizeCustomView)
      .filter((view): view is CustomView => Boolean(view))
      .slice(0, MAX_CUSTOM_VIEWS);
  } catch {
    return [];
  }
}

export function writeCustomViews(views: CustomView[], storage?: Storage): void {
  try {
    const targetStorage = storage ?? (typeof localStorage !== 'undefined' ? localStorage : null);
    if (!targetStorage) {
      return;
    }

    targetStorage.setItem(
      CUSTOM_VIEWS_STORAGE_KEY,
      JSON.stringify(views.slice(0, MAX_CUSTOM_VIEWS))
    );
  } catch (error) {
    console.error('Failed to persist custom views:', error);
  }
}

export function parseImportedCustomView(rawJson: string): CustomView | null {
  try {
    const parsed = JSON.parse(rawJson);
    const normalized = normalizeCustomView(parsed);
    if (!normalized) {
      return null;
    }

    const now = Date.now();
    return {
      ...normalized,
      id: createCustomViewId(),
      createdAt: now,
      updatedAt: now,
      widgets: normalized.widgets.map(widget => ({
        ...widget,
        id: createCustomViewId(),
      })),
    };
  } catch {
    return null;
  }
}
