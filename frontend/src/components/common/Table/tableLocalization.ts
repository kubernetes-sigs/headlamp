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

import type { MRT_Localization } from 'material-react-table';
import { MRT_Localization_AR } from 'material-react-table/locales/ar';
import { MRT_Localization_CS } from 'material-react-table/locales/cs';
import { MRT_Localization_DE } from 'material-react-table/locales/de';
import { MRT_Localization_EN } from 'material-react-table/locales/en';
import { MRT_Localization_ES } from 'material-react-table/locales/es';
import { MRT_Localization_FR } from 'material-react-table/locales/fr';
import { MRT_Localization_HE } from 'material-react-table/locales/he';
import { MRT_Localization_HU } from 'material-react-table/locales/hu';
import { MRT_Localization_ID } from 'material-react-table/locales/id';
import { MRT_Localization_IT } from 'material-react-table/locales/it';
import { MRT_Localization_JA } from 'material-react-table/locales/ja';
import { MRT_Localization_KO } from 'material-react-table/locales/ko';
import { MRT_Localization_NL } from 'material-react-table/locales/nl';
import { MRT_Localization_PL } from 'material-react-table/locales/pl';
import { MRT_Localization_PT } from 'material-react-table/locales/pt';
import { MRT_Localization_PT_BR } from 'material-react-table/locales/pt-BR';
import { MRT_Localization_RU } from 'material-react-table/locales/ru';
import { MRT_Localization_SV } from 'material-react-table/locales/sv';
import { MRT_Localization_TR } from 'material-react-table/locales/tr';
import { MRT_Localization_ZH_HANS } from 'material-react-table/locales/zh-Hans';
import { MRT_Localization_ZH_HANT } from 'material-react-table/locales/zh-Hant';

const tableLocalizationMap: Partial<Record<string, MRT_Localization>> = {
  ar: MRT_Localization_AR,
  cs: MRT_Localization_CS,
  de: MRT_Localization_DE,
  en: MRT_Localization_EN,
  es: MRT_Localization_ES,
  fr: MRT_Localization_FR,
  he: MRT_Localization_HE,
  hu: MRT_Localization_HU,
  id: MRT_Localization_ID,
  it: MRT_Localization_IT,
  ja: MRT_Localization_JA,
  'pt-PT': MRT_Localization_PT,
  'pt-BR': MRT_Localization_PT_BR,
  ko: MRT_Localization_KO,
  nl: MRT_Localization_NL,
  pl: MRT_Localization_PL,
  ru: MRT_Localization_RU,
  sv: MRT_Localization_SV,
  tr: MRT_Localization_TR,
  zh: MRT_Localization_ZH_HANS,
  'zh-TW': MRT_Localization_ZH_HANT,
};

export function getTableLocalization(language: string): MRT_Localization | undefined {
  return tableLocalizationMap[language];
}
