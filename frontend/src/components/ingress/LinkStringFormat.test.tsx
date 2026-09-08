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

import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import App from '../../App';
import Ingress, { KubeIngress } from '../../lib/k8s/ingress';
import { LinkStringFormat } from './Details';

// cyclic imports fix
// eslint-disable-next-line no-unused-vars
const _dont_delete_me = App;

function makeIngress(spec: KubeIngress['spec']) {
  return new Ingress({
    kind: 'Ingress',
    apiVersion: 'networking.k8s.io/v1',
    metadata: {
      name: 'test',
      namespace: 'test',
      uid: '',
      creationTimestamp: '',
    },
    spec,
  } as KubeIngress);
}

const backend = { service: { name: 'test', port: { number: 80 } } };

describe('LinkStringFormat', () => {
  it('renders the host without crashing when a rule carries no http block', () => {
    // spec.rules[].http is optional in networking.k8s.io/v1, so a rule may hold
    // only a host. The pathType lookup must not walk into an undefined http.
    const item = makeIngress({ rules: [{ host: 'foo.example.com' }] as any });

    render(<LinkStringFormat url="foo.example.com" item={item} />);

    expect(screen.getByRole('link', { name: 'http://foo.example.com/' })).toBeInTheDocument();
  });

  it('renders a path row without crashing when another rule carries no http block', () => {
    const item = makeIngress({
      rules: [
        { host: 'bar.example.com' },
        {
          host: 'foo.example.com',
          http: { paths: [{ path: '/a', pathType: 'Prefix', backend }] },
        },
      ] as any,
    });

    render(<LinkStringFormat url="foo.example.com" item={item} urlPath="/a" />);

    expect(screen.getByRole('link', { name: '/a' })).toBeInTheDocument();
    expect(screen.getByText('(Prefix)')).toBeInTheDocument();
  });

  it('shows the pathType from the rule matching the row host, not the last rule', () => {
    // Both hosts expose "/" but with different path types. Each row must report
    // its own host's pathType.
    const item = makeIngress({
      rules: [
        { host: 'a.example.com', http: { paths: [{ path: '/', pathType: 'Prefix', backend }] } },
        { host: 'b.example.com', http: { paths: [{ path: '/', pathType: 'Exact', backend }] } },
      ] as any,
    });

    const { unmount } = render(<LinkStringFormat url="a.example.com" item={item} urlPath="/" />);
    expect(screen.getByText('(Prefix)')).toBeInTheDocument();
    expect(screen.queryByText('(Exact)')).not.toBeInTheDocument();
    unmount();

    render(<LinkStringFormat url="b.example.com" item={item} urlPath="/" />);
    expect(screen.getByText('(Exact)')).toBeInTheDocument();
    expect(screen.queryByText('(Prefix)')).not.toBeInTheDocument();
  });

  it('omits the suffix instead of rendering "(undefined)" when no pathType is found', () => {
    const item = makeIngress({
      rules: [
        {
          host: 'foo.example.com',
          http: { paths: [{ path: '/known', pathType: 'Exact', backend }] },
        },
      ] as any,
    });

    render(<LinkStringFormat url="foo.example.com" item={item} urlPath="/unknown" />);

    expect(screen.getByRole('link', { name: '/unknown' })).toBeInTheDocument();
    expect(screen.queryByText(/undefined/)).not.toBeInTheDocument();
  });
});
