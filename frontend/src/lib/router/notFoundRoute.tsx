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

import NotFoundComponent from '../../components/404';

// The NotFound route needs to be considered always in the last place when used
// with the router switch, as any routes added after this one will never be considered.
// So we do not include it in the default routes in order to always "manually" consider it.
export const NotFoundRoute = {
  path: '*',
  exact: true,
  name: `Whoops! This page doesn't exist`,
  component: () => <NotFoundComponent />,
  sidebar: null,
  noAuthRequired: true,
};
