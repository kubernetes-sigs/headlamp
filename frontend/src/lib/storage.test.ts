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

import { getSavedNamespaces, renameSavedNamespaces, saveNamespaces } from './storage';

describe('renameSavedNamespaces', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('moves the saved namespaces to the new cluster name', () => {
    saveNamespaces(['watch-demo', 'demo'], 'minikube');

    renameSavedNamespaces('minikube', 'mk-renamed');

    expect(getSavedNamespaces('mk-renamed')).toEqual(['watch-demo', 'demo']);
    expect(getSavedNamespaces('minikube')).toEqual([]);
  });

  it('clears leftovers under the new name when nothing is saved for the old one', () => {
    // Left behind by a different cluster that used the name "mk-renamed" before
    saveNamespaces(['other'], 'mk-renamed');

    renameSavedNamespaces('minikube', 'mk-renamed');

    expect(getSavedNamespaces('mk-renamed')).toEqual([]);
  });

  it('does nothing when the names are the same or empty', () => {
    saveNamespaces(['demo'], 'minikube');

    renameSavedNamespaces('minikube', 'minikube');
    renameSavedNamespaces('minikube', '');

    expect(getSavedNamespaces('minikube')).toEqual(['demo']);
  });
});
