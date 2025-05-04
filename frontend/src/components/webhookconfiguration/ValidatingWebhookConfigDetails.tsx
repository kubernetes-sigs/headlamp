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

import { useParams } from 'react-router-dom';
import ValidatingWebhookConfiguration from '../../lib/k8s/validatingWebhookConfiguration';
import WebhookConfigurationDetails from './Details';

export default function ValidatingWebhookConfigurationDetails(props: {
  name?: string;
  cluster?: string;
}) {
  const params = useParams<{ name: string }>();
  const { name = params.name, cluster } = props;

  return (
    <WebhookConfigurationDetails
      resourceClass={ValidatingWebhookConfiguration}
      name={name}
      cluster={cluster}
    />
  );
}
