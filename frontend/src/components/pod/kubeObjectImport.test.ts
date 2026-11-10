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

import NetworkPolicy from '../../lib/k8s/networkpolicy';

// Regression test for a circular import between KubeObject and the router: importing a
// resource class from a components/ test file (i.e. before the k8s barrel has been touched
// by anything else) used to crash with "Class extends value undefined is not a constructor
// or null", because KubeObject.ts pulled in the router chain, which looped back into the
// lib/k8s barrel before KubeObject itself had finished initializing.
it('imports a resource class from a components/ test without crashing', () => {
  expect(NetworkPolicy).toBeDefined();
});
