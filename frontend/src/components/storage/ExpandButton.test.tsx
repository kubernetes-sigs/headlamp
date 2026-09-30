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
import { beforeEach, describe, expect, it, vi } from 'vitest';
import App from '../../App';
import PersistentVolumeClaim, {
  KubePersistentVolumeClaim,
} from '../../lib/k8s/persistentVolumeClaim';
import { TestContext } from '../../test';
import ExpandButton, { ExpandDialog } from './ExpandButton';
import { BASE_PVC } from './storyHelper';

// cyclic imports fix
// eslint-disable-next-line no-unused-vars
const _dont_delete_me = App;

const { mockStorageClassUseGet } = vi.hoisted(() => ({
  mockStorageClassUseGet: vi.fn(),
}));

vi.mock('../../lib/k8s/storageClass', () => ({
  default: { useGet: mockStorageClassUseGet },
}));

vi.mock('../common/Resource/AuthVisible', () => ({
  default: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

const makeClaim = (overrides: Partial<KubePersistentVolumeClaim> = {}) =>
  new PersistentVolumeClaim({
    ...BASE_PVC,
    ...overrides,
    status: { ...BASE_PVC.status, phase: 'Bound', ...overrides.status },
  } as KubePersistentVolumeClaim);

const renderButton = (claim = makeClaim()) =>
  render(
    <TestContext>
      <ExpandButton item={claim} />
    </TestContext>
  );

const expandButton = () => screen.queryByRole('button', { name: /expand/i });

describe('ExpandButton', () => {
  beforeEach(() => {
    mockStorageClassUseGet.mockReset();
    mockStorageClassUseGet.mockReturnValue([{ allowVolumeExpansion: true }, null]);
  });

  it('offers the action when the storage class allows expansion', () => {
    renderButton();

    expect(expandButton()).toBeVisible();
  });

  it('hides the action when the storage class forbids expansion', () => {
    mockStorageClassUseGet.mockReturnValue([{ allowVolumeExpansion: false }, null]);

    renderButton();

    expect(expandButton()).not.toBeInTheDocument();
  });

  it('hides the action while the storage class is still being read', () => {
    mockStorageClassUseGet.mockReturnValue([null, null]);

    renderButton();

    expect(expandButton()).not.toBeInTheDocument();
  });

  // The issue asks for the action only when the class allows expansion, and a class that
  // cannot be read has not said so.
  it('hides the action when the storage class cannot be read', () => {
    mockStorageClassUseGet.mockReturnValue([null, new Error('forbidden')]);

    renderButton();

    expect(expandButton()).not.toBeInTheDocument();
  });

  it('hides the action for a claim that is not bound yet', () => {
    renderButton(makeClaim({ status: { phase: 'Pending' } }));

    expect(expandButton()).not.toBeInTheDocument();
    expect(mockStorageClassUseGet).not.toHaveBeenCalled();
  });

  it('hides the action for a claim without a storage class', () => {
    renderButton(makeClaim({ spec: { ...BASE_PVC.spec, storageClassName: undefined } as any }));

    expect(expandButton()).not.toBeInTheDocument();
    expect(mockStorageClassUseGet).not.toHaveBeenCalled();
  });
});

const claimRequesting = (storage: string) =>
  makeClaim({
    spec: { ...BASE_PVC.spec, resources: { requests: { storage } } } as any,
  });

const chooseUnit = (unit: string | RegExp) => {
  fireEvent.mouseDown(screen.getByRole('combobox', { name: /unit/i }));
  fireEvent.click(screen.getByRole('option', { name: unit }));
};

describe('ExpandDialog', () => {
  const renderDialog = (onSave = vi.fn(), claim = makeClaim()) => {
    render(
      <TestContext>
        <ExpandDialog resource={claim} open onClose={vi.fn()} onSave={onSave} />
      </TestContext>
    );

    return {
      onSave,
      size: screen.getByLabelText(/new size/i),
      apply: screen.getByRole('button', { name: /apply/i }),
    };
  };

  it('starts from the size the claim requests today', () => {
    const { size } = renderDialog();

    expect(size).toHaveValue(8);
    expect(screen.getByText(/8Gi/)).toBeVisible();
  });

  it('refuses a size that would shrink the volume', () => {
    const { size, apply } = renderDialog();

    fireEvent.change(size, { target: { value: '4' } });

    expect(apply).toBeDisabled();
    expect(screen.getByText(/can only be expanded/i)).toBeVisible();
  });

  it('refuses the size the claim already has', () => {
    const { apply } = renderDialog();

    expect(apply).toBeDisabled();
  });

  it('saves the new size with its unit', () => {
    const { size, apply, onSave } = renderDialog();

    fireEvent.change(size, { target: { value: '16' } });
    expect(apply).toBeEnabled();

    fireEvent.click(apply);

    expect(onSave).toHaveBeenCalledWith('16Gi');
  });

  it('keeps a size without a suffix in bytes rather than reading it as Gi', () => {
    const { size, apply, onSave } = renderDialog(vi.fn(), claimRequesting('1024'));

    expect(size).toHaveValue(1024);
    expect(screen.getByRole('combobox', { name: /unit/i })).toHaveTextContent(/bytes/i);
    // Opening on 1024 Gi would have enabled Apply before the user changed anything.
    expect(apply).toBeDisabled();

    fireEvent.change(size, { target: { value: '2048' } });
    fireEvent.click(apply);

    expect(onSave).toHaveBeenCalledWith('2048');
  });

  it('refuses a negative size', () => {
    const { size, apply } = renderDialog();

    fireEvent.change(size, { target: { value: '-16' } });

    expect(apply).toBeDisabled();
  });

  it('reads the lowercase k as kilo when comparing sizes', () => {
    const { size, apply } = renderDialog(vi.fn(), claimRequesting('100k'));

    // 2 Ki is 2048 bytes, smaller than the 100 000 the claim has.
    fireEvent.change(size, { target: { value: '2' } });
    chooseUnit('Ki');
    expect(apply).toBeDisabled();

    fireEvent.change(size, { target: { value: '200' } });
    expect(apply).toBeEnabled();
  });

  it('opens on a size reported with a decimal exponent', () => {
    const { size, apply } = renderDialog(vi.fn(), claimRequesting('1e9'));

    expect(size).toHaveValue(1);
    expect(screen.getByRole('combobox', { name: /unit/i })).toHaveTextContent('G');
    expect(apply).toBeDisabled();
  });

  it('compares sizes across units rather than by their number', () => {
    const { size, apply } = renderDialog();

    fireEvent.change(size, { target: { value: '900' } });
    chooseUnit('Mi');

    expect(apply).toBeDisabled();
  });
});
