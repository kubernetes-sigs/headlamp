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
 * Tests for Response Renderer Registry
 *
 * Run with: npm test
 */

import { beforeEach, describe, expect, it } from '@jest/globals';
import React from 'react';
import {
  AIResponse,
  findResponseRenderer,
  getAllResponseRenderers,
  registerAIResponseRenderer,
  responseRendererRegistry,
  unregisterAIResponseRenderer,
} from '../src/responseRendererRegistry';

// Mock components for testing
const MockComponent1 = () => React.createElement('div', null, 'Mock 1');
const MockComponent2 = () => React.createElement('div', null, 'Mock 2');
const MockComponent3 = () => React.createElement('div', null, 'Mock 3');

describe('Response Renderer Registry', () => {
  beforeEach(() => {
    // Clear registry before each test
    responseRendererRegistry.clear();
  });

  describe('Registration', () => {
    it('should register a renderer', () => {
      registerAIResponseRenderer({
        id: 'test-renderer',
        matcher: () => true,
        component: MockComponent1,
      });

      expect(responseRendererRegistry.count()).toBe(1);
    });

    it('should register multiple renderers', () => {
      registerAIResponseRenderer({
        id: 'renderer-1',
        matcher: () => true,
        component: MockComponent1,
      });

      registerAIResponseRenderer({
        id: 'renderer-2',
        matcher: () => true,
        component: MockComponent2,
      });

      expect(responseRendererRegistry.count()).toBe(2);
    });

    it('should overwrite renderer with same id', () => {
      registerAIResponseRenderer({
        id: 'test-renderer',
        matcher: () => true,
        component: MockComponent1,
      });

      registerAIResponseRenderer({
        id: 'test-renderer',
        matcher: () => false,
        component: MockComponent2,
      });

      expect(responseRendererRegistry.count()).toBe(1);
      const renderer = responseRendererRegistry.get('test-renderer');
      expect(renderer?.component).toBe(MockComponent2);
    });

    it('should set default priority to 0', () => {
      registerAIResponseRenderer({
        id: 'test-renderer',
        matcher: () => true,
        component: MockComponent1,
      });

      const renderer = responseRendererRegistry.get('test-renderer');
      expect(renderer?.priority).toBe(0);
    });

    it('should respect custom priority', () => {
      registerAIResponseRenderer({
        id: 'test-renderer',
        matcher: () => true,
        component: MockComponent1,
        priority: 15,
      });

      const renderer = responseRendererRegistry.get('test-renderer');
      expect(renderer?.priority).toBe(15);
    });
  });

  describe('Unregistration', () => {
    it('should unregister a renderer', () => {
      registerAIResponseRenderer({
        id: 'test-renderer',
        matcher: () => true,
        component: MockComponent1,
      });

      const result = unregisterAIResponseRenderer('test-renderer');
      expect(result).toBe(true);
      expect(responseRendererRegistry.count()).toBe(0);
    });

    it('should return false for non-existent renderer', () => {
      const result = unregisterAIResponseRenderer('non-existent');
      expect(result).toBe(false);
    });
  });

  describe('Matching', () => {
    it('should find renderer by type', () => {
      registerAIResponseRenderer({
        id: 'type-matcher',
        matcher: response => response.type === 'test_type',
        component: MockComponent1,
      });

      const response: AIResponse = {
        type: 'test_type',
        content: {},
      };

      const renderer = findResponseRenderer(response);
      expect(renderer?.id).toBe('type-matcher');
    });

    it('should return null if no renderer matches', () => {
      registerAIResponseRenderer({
        id: 'type-matcher',
        matcher: response => response.type === 'specific_type',
        component: MockComponent1,
      });

      const response: AIResponse = {
        type: 'different_type',
        content: {},
      };

      const renderer = findResponseRenderer(response);
      expect(renderer).toBeNull();
    });

    it('should prioritize higher priority renderers', () => {
      registerAIResponseRenderer({
        id: 'low-priority',
        matcher: () => true,
        component: MockComponent1,
        priority: 5,
      });

      registerAIResponseRenderer({
        id: 'high-priority',
        matcher: () => true,
        component: MockComponent2,
        priority: 10,
      });

      const response: AIResponse = {
        content: {},
      };

      const renderer = findResponseRenderer(response);
      expect(renderer?.id).toBe('high-priority');
    });

    it('should handle complex matchers', () => {
      registerAIResponseRenderer({
        id: 'complex-matcher',
        matcher: response => {
          return (
            response.type === 'analysis' &&
            response.content?.severity === 'high' &&
            response.metadata?.category === 'security'
          );
        },
        component: MockComponent1,
      });

      const matchingResponse: AIResponse = {
        type: 'analysis',
        content: { severity: 'high' },
        metadata: { category: 'security' },
      };

      const nonMatchingResponse: AIResponse = {
        type: 'analysis',
        content: { severity: 'low' },
        metadata: { category: 'security' },
      };

      expect(findResponseRenderer(matchingResponse)?.id).toBe('complex-matcher');
      expect(findResponseRenderer(nonMatchingResponse)).toBeNull();
    });

    it('should handle matcher errors gracefully', () => {
      registerAIResponseRenderer({
        id: 'error-matcher',
        matcher: () => {
          throw new Error('Matcher error');
        },
        component: MockComponent1,
      });

      const response: AIResponse = {
        content: {},
      };

      // Should not throw, should return null
      const renderer = findResponseRenderer(response);
      expect(renderer).toBeNull();
    });
  });

  describe('Priority Ordering', () => {
    it('should return renderers sorted by priority', () => {
      registerAIResponseRenderer({
        id: 'low',
        matcher: () => true,
        component: MockComponent1,
        priority: 1,
      });

      registerAIResponseRenderer({
        id: 'high',
        matcher: () => true,
        component: MockComponent2,
        priority: 10,
      });

      registerAIResponseRenderer({
        id: 'medium',
        matcher: () => true,
        component: MockComponent3,
        priority: 5,
      });

      const renderers = getAllResponseRenderers();
      expect(renderers[0].id).toBe('high');
      expect(renderers[1].id).toBe('medium');
      expect(renderers[2].id).toBe('low');
    });

    it('should handle negative priorities', () => {
      registerAIResponseRenderer({
        id: 'negative',
        matcher: () => true,
        component: MockComponent1,
        priority: -10,
      });

      registerAIResponseRenderer({
        id: 'positive',
        matcher: () => true,
        component: MockComponent2,
        priority: 10,
      });

      const renderers = getAllResponseRenderers();
      expect(renderers[0].id).toBe('positive');
      expect(renderers[1].id).toBe('negative');
    });
  });

  describe('Querying', () => {
    beforeEach(() => {
      registerAIResponseRenderer({
        id: 'renderer-1',
        matcher: () => true,
        component: MockComponent1,
      });

      registerAIResponseRenderer({
        id: 'renderer-2',
        matcher: () => true,
        component: MockComponent2,
      });
    });

    it('should get all renderers', () => {
      const renderers = getAllResponseRenderers();
      expect(renderers.length).toBe(2);
    });

    it('should get renderer by id', () => {
      const renderer = responseRendererRegistry.get('renderer-1');
      expect(renderer?.id).toBe('renderer-1');
      expect(renderer?.component).toBe(MockComponent1);
    });

    it('should return undefined for non-existent id', () => {
      const renderer = responseRendererRegistry.get('non-existent');
      expect(renderer).toBeUndefined();
    });
  });
});
