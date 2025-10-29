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
 * Response Renderer Registry
 *
 * This module provides functionality for plugins to register custom UI components
 * that render specific types of AI responses in the AI Assistant.
 */

import React from 'react';

export interface AIResponseRendererConfig {
  /** Unique identifier for this renderer */
  id: string;

  /**
   * Function that determines if this renderer should handle the response.
   * Return true if this renderer can handle the response.
   */
  matcher: (response: AIResponse) => boolean;

  /**
   * React component that renders the response.
   * Will receive the response data and any additional metadata.
   */
  component: React.ComponentType<AIResponseRendererProps>;

  /**
   * Priority level for this renderer. Higher priority renderers are tried first.
   * Default is 0. Built-in renderers typically have priority < 0.
   */
  priority?: number;

  /**
   * Optional description of what this renderer does
   */
  description?: string;
}

export interface AIResponse {
  /** Type of the response (e.g., 'text', 'code', 'chart', 'table', etc.) */
  type?: string;

  /** The actual content/data of the response */
  content: any;

  /** Any metadata associated with the response */
  metadata?: Record<string, any>;

  /** Original response from the AI model */
  raw?: any;
}

export interface AIResponseRendererProps {
  /** The AI response data to render */
  response: AIResponse;

  /** Additional context about the conversation */
  context?: {
    /** The original user prompt that generated this response */
    prompt?: string;

    /** Kubernetes resource being discussed, if any */
    resource?: any;

    /** Current view context (details, list, etc.) */
    view?: string;
  };

  /** Callback to request re-rendering */
  onUpdate?: () => void;
}

/**
 * Internal registry storage
 */
class ResponseRendererRegistry {
  private renderers: Map<string, AIResponseRendererConfig> = new Map();

  /**
   * Register a new response renderer
   */
  register(config: AIResponseRendererConfig): void {
    if (this.renderers.has(config.id)) {
      console.warn(
        `AI Response Renderer with id "${config.id}" is already registered. Overwriting.`
      );
    }

    this.renderers.set(config.id, {
      ...config,
      priority: config.priority ?? 0,
    });
  }

  /**
   * Unregister a response renderer
   */
  unregister(id: string): boolean {
    return this.renderers.delete(id);
  }

  /**
   * Get all registered renderers sorted by priority (highest first)
   */
  getAll(): AIResponseRendererConfig[] {
    return Array.from(this.renderers.values()).sort(
      (a, b) => (b.priority ?? 0) - (a.priority ?? 0)
    );
  }

  /**
   * Find the best renderer for a given response
   */
  findRenderer(response: AIResponse): AIResponseRendererConfig | null {
    const sortedRenderers = this.getAll();

    for (const renderer of sortedRenderers) {
      try {
        if (renderer.matcher(response)) {
          return renderer;
        }
      } catch (error) {
        console.error(`Error in matcher for renderer "${renderer.id}":`, error);
      }
    }

    return null;
  }

  /**
   * Get a specific renderer by id
   */
  get(id: string): AIResponseRendererConfig | undefined {
    return this.renderers.get(id);
  }

  /**
   * Clear all registered renderers (useful for testing)
   */
  clear(): void {
    this.renderers.clear();
  }

  /**
   * Get count of registered renderers
   */
  count(): number {
    return this.renderers.size;
  }
}

// Singleton instance
const registry = new ResponseRendererRegistry();

/**
 * Register a custom AI response renderer
 *
 * @example
 * ```typescript
 * registerAIResponseRenderer({
 *   id: 'cost-chart-renderer',
 *   matcher: (response) => response.type === 'cost_analysis',
 *   component: CostChartComponent,
 *   priority: 10
 * });
 * ```
 */
export function registerAIResponseRenderer(config: AIResponseRendererConfig): void {
  registry.register(config);
}

/**
 * Unregister an AI response renderer
 */
export function unregisterAIResponseRenderer(id: string): boolean {
  return registry.unregister(id);
}

/**
 * Get all registered response renderers
 */
export function getAllResponseRenderers(): AIResponseRendererConfig[] {
  return registry.getAll();
}

/**
 * Find the appropriate renderer for a response
 */
export function findResponseRenderer(response: AIResponse): AIResponseRendererConfig | null {
  return registry.findRenderer(response);
}

/**
 * Get a specific renderer by id
 */
export function getResponseRenderer(id: string): AIResponseRendererConfig | undefined {
  return registry.get(id);
}

// Export the registry for advanced use cases
export { registry as responseRendererRegistry };
