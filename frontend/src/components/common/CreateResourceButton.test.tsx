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

import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('react-i18next', async () => {
  const actual = await vi.importActual<typeof import('react-i18next')>('react-i18next');
  return {
    ...actual,
    useTranslation: () => ({
      t: (key: string, vars?: { name?: string }) =>
        vars?.name ? key.replace('{{ name }}', vars.name) : key,
    }),
  };
});

// Bypass the RBAC gate so the button actually renders.
vi.mock('../common/Resource', async () => {
  const actual = await vi.importActual<any>('../common/Resource');
  return {
    ...actual,
    AuthVisible: ({ children }: { children: React.ReactNode }) => <>{children}</>,
    // EditorDialog is imported at the top level; a light stub keeps its
    // dependency chain from loading in this test.
    EditorDialog: () => null,
  };
});

const activityLaunch = vi.fn();
vi.mock('../activity/Activity', () => ({
  Activity: { launch: (arg: unknown) => activityLaunch(arg), close: () => undefined },
}));

vi.mock('../../lib/k8s', () => ({
  useSelectedClusters: () => ['cluster-a'],
}));

import { CreateResourceButton } from './CreateResourceButton';

const podClass = {
  kind: 'Pod',
  apiName: 'pods',
  apiVersion: 'v1',
  getBaseObject: () => ({}),
} as any;

describe('CreateResourceButton variants', () => {
  it('labeled variant shows visible "Create Pod" text and launches the create activity on click', () => {
    activityLaunch.mockClear();
    render(<CreateResourceButton resourceClass={podClass} variant="labeled" />);
    const button = screen.getByRole('button', { name: /Create Pod/i });
    // User can see the label; the icon variant would only expose it via aria-label.
    expect(button).toHaveTextContent(/Create Pod/i);
    fireEvent.click(button);
    expect(activityLaunch).toHaveBeenCalledTimes(1);
  });

  it('icon variant (default) exposes its label via accessible name, not visible text', () => {
    activityLaunch.mockClear();
    render(<CreateResourceButton resourceClass={podClass} />);
    const button = screen.getByRole('button', { name: /Create Pod/i });
    // Icon variant shows an icon only; the "Create Pod" name comes from
    // ActionButton's tooltip/aria-label, not from visible children text.
    expect(button).not.toHaveTextContent(/Create Pod/i);
    fireEvent.click(button);
    expect(activityLaunch).toHaveBeenCalledTimes(1);
  });
});
