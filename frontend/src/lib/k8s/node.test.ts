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

import { describe, expect, it } from 'vitest';
import App from '../../App';
import Node from './node';

// cyclic imports fix
// eslint-disable-next-line no-unused-vars
const _dont_delete_me = App;

describe('Node class', () => {
  const makeNode = (metadata: any = {}, status?: any) =>
    new Node({
      apiVersion: 'v1',
      kind: 'Node',
      metadata: { name: 'test-node', ...metadata },
      ...(status !== undefined ? { status } : {}),
    } as any);

  describe('getRoles', () => {
    it('extracts role names from node-role.kubernetes.io labels', () => {
      const node = makeNode({
        labels: {
          'node-role.kubernetes.io/control-plane': '',
          'node-role.kubernetes.io/worker': '',
          'kubernetes.io/hostname': 'test-node',
        },
      });
      expect(node.getRoles()).toEqual(['control-plane', 'worker']);
    });

    it('returns empty array when no role labels exist', () => {
      const node = makeNode({
        labels: {
          'kubernetes.io/hostname': 'test-node',
        },
      });
      expect(node.getRoles()).toEqual([]);
    });

    it('handles undefined or empty labels gracefully', () => {
      const node = makeNode({});
      expect(node.getRoles()).toEqual([]);
    });
  });

  describe('getExternalIP and getInternalIP', () => {
    it('returns addresses when populated', () => {
      const node = makeNode(
        {},
        {
          addresses: [
            { type: 'InternalIP', address: '10.0.0.1' },
            { type: 'ExternalIP', address: '203.0.113.1' },
          ],
        }
      );
      expect(node.getInternalIP()).toBe('10.0.0.1');
      expect(node.getExternalIP()).toBe('203.0.113.1');
    });

    it('returns empty string when address type is not found', () => {
      const node = makeNode(
        {},
        {
          addresses: [{ type: 'Hostname', address: 'test-node' }],
        }
      );
      expect(node.getInternalIP()).toBe('');
      expect(node.getExternalIP()).toBe('');
    });

    it('does not throw and returns empty string when status is undefined', () => {
      const node = makeNode({}, undefined);
      expect(node.getInternalIP()).toBe('');
      expect(node.getExternalIP()).toBe('');
    });
  });
});
