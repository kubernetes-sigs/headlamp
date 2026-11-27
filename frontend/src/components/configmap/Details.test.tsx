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
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type ConfigMap from '../../lib/k8s/configMap';
import { ConfigMapDataSection } from './Details';

const { actions, update } = vi.hoisted(() => ({
  actions: [] as Array<() => Promise<unknown>>,
  update: vi.fn(),
}));

vi.mock('../../lib/k8s/configMap', () => ({ default: {} }));
vi.mock('react-redux', () => ({ useDispatch: () => vi.fn() }));
vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
vi.mock('../../redux/clusterActionSlice', () => ({
  clusterAction: (callback: () => Promise<unknown>) => {
    actions.push(callback);
    return { type: 'test/save' };
  },
}));
vi.mock('../common/Resource', () => ({
  DetailsGrid: () => null,
  DataField: ({
    label,
    value,
    onChange,
  }: {
    label: string;
    value: string;
    onChange: (value: string) => void;
  }) => <input aria-label={label} value={value} onChange={event => onChange(event.target.value)} />,
}));
vi.mock('../common/SectionBox', () => ({
  SectionBox: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));
vi.mock('../common/SimpleTable', () => ({
  NameValueTable: ({ rows }: { rows: Array<{ name: string; value: ReactNode }> }) => (
    <>
      {rows.map(row => (
        <div key={row.name}>{row.value}</div>
      ))}
    </>
  ),
}));

function item(data = 'original', binaryData = 'b2xk') {
  const jsonData = {
    metadata: { name: 'settings' },
    data: { text: data },
    binaryData: { binary: binaryData },
  };
  return { ...jsonData, jsonData, update } as unknown as ConfigMap;
}

function editAndSave() {
  fireEvent.change(screen.getByLabelText('text'), { target: { value: 'edited' } });
  fireEvent.change(screen.getByLabelText('binary'), { target: { value: 'bmV3' } });
  fireEvent.click(screen.getByRole('button', { name: 'translation|Save' }));
}

describe('ConfigMap data draft', () => {
  beforeEach(() => {
    actions.length = 0;
    update.mockReset().mockResolvedValue({});
  });

  it.each(['cancelled', 'failed'])('retains edits after a %s save for retry', async outcome => {
    render(<ConfigMapDataSection item={item()} />);
    editAndSave();
    if (outcome === 'failed') {
      update.mockRejectedValueOnce(new Error('update failed'));
      await expect(actions[0]()).rejects.toThrow('update failed');
    }
    // A cancelled action never runs its callback. A retry must use the same draft.
    fireEvent.click(screen.getByRole('button', { name: 'translation|Save' }));
    await actions[1]();
    expect(update).toHaveBeenLastCalledWith(
      expect.objectContaining({
        data: { text: 'edited' },
        binaryData: { binary: 'bmV3' },
      })
    );
  });

  it('resumes server synchronization after the saved values are observed', async () => {
    const { rerender } = render(<ConfigMapDataSection item={item()} />);
    editAndSave();
    await actions[0]();
    rerender(<ConfigMapDataSection item={item('edited', 'bmV3')} />);
    rerender(<ConfigMapDataSection item={item('external', 'ZXh0ZXJuYWw=')} />);
    expect(screen.getByLabelText('text')).toHaveValue('external');
    expect(screen.getByLabelText('binary')).toHaveValue('ZXh0ZXJuYWw=');
  });

  it('preserves newer edits when an earlier save is observed', async () => {
    const { rerender } = render(<ConfigMapDataSection item={item()} />);
    editAndSave();
    fireEvent.change(screen.getByLabelText('text'), { target: { value: 'newer' } });
    await actions[0]();
    rerender(<ConfigMapDataSection item={item('edited', 'bmV3')} />);
    fireEvent.click(screen.getByRole('button', { name: 'translation|Save' }));
    await actions[1]();
    expect(update).toHaveBeenLastCalledWith(
      expect.objectContaining({
        data: { text: 'newer' },
        binaryData: { binary: 'bmV3' },
      })
    );
  });
});
