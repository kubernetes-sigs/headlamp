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

// Initialize the global i18n instance so useTranslation works (normally pulled in
// transitively by the components mocked out below).
import '../../i18n/config';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { Base64 } from 'js-base64';
import _ from 'lodash';
import type ConfigMap from '../../lib/k8s/configMap';
import { CLUSTER_ACTION_GRACE_PERIOD } from '../../redux/clusterActionSlice';
import { TestContext } from '../../test';
import { ConfigMapDataSection } from './Details';
import { BASE_BINARY_DATA_AND_DATA_CONFIG_MAP } from './storyHelper';

// Stub the ConfigMap class module. Evaluating it pulls the k8s barrel, which has an
// init-order cycle when loaded cold in an isolated test (class-extends-undefined).
// The component only needs the type; the item is supplied as a plain object.
vi.mock('../../lib/k8s/configMap', () => ({ default: class ConfigMap {} }));

// Render DataField as a plain controlled textarea so its value is observable and edits
// can be simulated. The base64 decode/encode under test lives in ConfigMapDataSection,
// not in DataField, so the logic under test is preserved.
vi.mock('../common/Resource', () => ({
  DataField: ({ value, onChange }: { value: string; onChange?: (v: string) => void }) => (
    <textarea aria-label="editor" value={value} onChange={e => onChange?.(e.target.value)} />
  ),
  DetailsGrid: () => null,
}));

// SectionBox and NameValueTable read custom theme palettes not present in the test
// theme; render their essential content directly instead.
vi.mock('../common/SectionBox', () => ({
  SectionBox: ({ children }: { children?: unknown }) => <div>{children as any}</div>,
}));

// Tag each row by its (string) name so a field's editor can be found unambiguously,
// since `data` and `binaryData` both render editors with the same "editor" label.
vi.mock('../common/SimpleTable', () => ({
  NameValueTable: ({ rows }: { rows: Array<{ name: string; value: unknown }> }) => (
    <>
      {rows.map(row => (
        <div key={row.name} data-testid={`field-${row.name}`}>
          {row.value as any}
        </div>
      ))}
    </>
  ),
}));

/**
 * Builds a minimal ConfigMap-like item with a spied update() so the save payload can
 * be asserted. A plain object is used (rather than `new ConfigMap`) so the test needs
 * no runtime import of the ConfigMap class.
 */
function makeConfigMap() {
  const jsonData = _.cloneDeep(BASE_BINARY_DATA_AND_DATA_CONFIG_MAP);
  const update = vi.fn().mockResolvedValue({});
  const item = {
    data: jsonData.data,
    binaryData: jsonData.binaryData,
    metadata: jsonData.metadata,
    jsonData,
    update,
  } as unknown as ConfigMap;
  return { item, update };
}

/**
 * Clicks Save and fast-forwards the clusterAction grace period so the wrapped
 * update() runs and its payload can be asserted.
 */
async function saveAndFlush() {
  fireEvent.click(screen.getByRole('button', { name: 'Save' }));
  await act(async () => {
    await vi.advanceTimersByTimeAsync(CLUSTER_ACTION_GRACE_PERIOD);
  });
}

describe('ConfigMapDataSection binary data', () => {
  const binaryData = BASE_BINARY_DATA_AND_DATA_CONFIG_MAP.binaryData!;
  const decodedHello = Base64.decode(binaryData['hello.txt']);

  afterEach(() => {
    vi.useRealTimers();
  });

  it('decodes base64 binaryData for display instead of showing raw base64', () => {
    const { item } = makeConfigMap();
    render(
      <TestContext>
        <ConfigMapDataSection item={item} />
      </TestContext>
    );

    const editor = within(screen.getByTestId('field-hello.txt')).getByLabelText(
      'editor'
    ) as HTMLTextAreaElement;
    // The decoded value is shown, not the raw base64 string.
    expect(editor.value).toBe(decodedHello);
    expect(editor.value).not.toBe(binaryData['hello.txt']);
  });

  it('re-encodes edited binaryData and preserves untouched entries on save', async () => {
    const { item, update } = makeConfigMap();
    render(
      <TestContext>
        <ConfigMapDataSection item={item} />
      </TestContext>
    );

    const editor = within(screen.getByTestId('field-hello.txt')).getByLabelText('editor');
    fireEvent.change(editor, { target: { value: 'Updated content' } });

    vi.useFakeTimers();
    await saveAndFlush();

    expect(update).toHaveBeenCalledTimes(1);
    const saved = update.mock.calls[0][0] as ConfigMap['jsonData'];
    // Edited value is stored back as base64 (valid wire format).
    expect(saved.binaryData?.['hello.txt']).toBe(Base64.encode('Updated content'));
    // Untouched binary entry is preserved byte-for-byte.
    expect(saved.binaryData?.['config.bin']).toBe(binaryData['config.bin']);
  });

  it('keeps plaintext data fields un-encoded on save', async () => {
    const { item, update } = makeConfigMap();
    render(
      <TestContext>
        <ConfigMapDataSection item={item} />
      </TestContext>
    );

    // storageClassName is a plaintext `data` value shown verbatim.
    const editor = within(screen.getByTestId('field-storageClassName')).getByLabelText('editor');
    fireEvent.change(editor, { target: { value: 'fast' } });

    vi.useFakeTimers();
    await saveAndFlush();

    expect(update).toHaveBeenCalledTimes(1);
    const saved = update.mock.calls[0][0] as ConfigMap['jsonData'];
    expect(saved.data?.storageClassName).toBe('fast');
  });
});
