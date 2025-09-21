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

import { useTranslation } from 'react-i18next';
import ActionButton, { ButtonStyle } from '../ActionButton';

interface CopyButtonProps {
  text?: string;
  buttonStyle?: ButtonStyle;
}

export default function CopyButton(props: CopyButtonProps) {
  const { text, buttonStyle } = props;
  const { t } = useTranslation(['translation']);

  if (text === undefined || text === null || text === '') {
    return <></>;
  }

  async function onCopy() {
    await navigator.clipboard.writeText(text!);
  }

  return (
    <ActionButton
      description={t('translation|Copy to clipboard')}
      buttonStyle={buttonStyle}
      onClick={onCopy}
      icon="mdi:content-copy"
    />
  );
}
