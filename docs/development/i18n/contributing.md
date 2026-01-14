---
title: Contributing to Internationalization
sidebar_label: Contributing
---

Welcome! This guide will help you contribute translations to Headlamp.

## Quick Start

### Where to Edit Translations

**⚠️ IMPORTANT:** All translations should be edited in:
```
frontend/src/i18n/locales/
```

This is the **single source of truth** for all translations. Do not edit translation files in other locations (like `plugins/headlamp-plugin/src/i18n/locales/`) as they are auto-generated during the build process.

### Translation File Structure

Each language has its own directory with three JSON files:

```
locales/
├── en/                    # English (reference language)
│   ├── translation.json   # Main translations
│   ├── glossary.json      # Kubernetes technical terms
│   └── app.json          # Desktop app specific strings
├── de/                    # German
│   ├── translation.json
│   ├── glossary.json
│   └── app.json
├── fr/                    # French
...
```

**Important:** When adding a new language, keep in mind that while all
the specific Kubernetes components' names are translatable, not all of them
will have a corresponding name in your language. Please refer to the
[Kubernetes localized docs](https://kubernetes.io/docs/home/) in your
language (if they exist) to understand which components should
be translated and which should be left in their original form.

## Helper Commands

We provide several commands to make translation easier:

### Check Translation Status

See which languages need translation work:

```bash
npm run i18n:status
```

This shows a colorful table with:
- Translation completion percentage for each language
- Number of translated vs. missing strings
- Visual progress bars

### List Translation Files

See all translation files with their completion status:

```bash
# List all languages
npm run i18n:list

# List specific language (note the -- before language code)
npm run i18n:list -- de
```

This shows:
- All translation files for each language
- Completion percentage for each file
- Missing files (if any)
- File paths

### Extract Empty Translations

Extract untranslated strings to a separate file for easier translation:

```bash
npm run i18n:extract -- frontend/src/i18n/locales/de/translation.json
```

This creates a file (e.g., `translation_empty.json`) containing only the empty translations. You can:
1. Translate the strings in this smaller file
2. Use the copy command (below) to merge them back

Optional: Specify output filename:
```bash
npm run i18n:extract -- frontend/src/i18n/locales/de/translation.json my_translations.json
```

### Copy Translations Between Files

Copy translations from one file to another:

```bash
# Basic usage - only copy missing translations
npm run i18n:copy -- source.json dest.json

# Force overwrite all translations (including non-empty ones)
npm run i18n:copy -- source.json dest.json --force

# Copy all keys from source, even if they don't exist in destination
npm run i18n:copy -- source.json dest.json --all
```

This is useful for:
- Merging completed translations back from an extracted file
- Copying translations between language files
- Updating translations selectively

## Namespaces

We have only two main [i18next namespaces](https://www.i18next.com/principles/namespaces):

- **glossary**: For Kubernetes jargon or terms/sentences that are very technical.
- **translation**: Default namespace, used for everything else not in the **glossary** namespace.

We do have a third namespace that concerns only the desktop app related strings: **app**.

In Headlamp, namespaces are separated by a `|` character. E.g. `t('glossary|Pod')`.

## Context

In order to better express context for a translation, we use the [i18next context](https://www.i18next.com/translation-function/context) feature. It is used like this:

```typescript
return t("translation|Desired", { context: "pods" });
```

In the example above, we give the extra context of "pods" for the word "Desired". It refers to the concept of pod, and precisely more than one (in case the target language of
the translation distinguishes between plural and singular for this word).

In the translated files, the context will show up in the respective key as:

```json
    "Desired//context:pods": ""
```

And should be translated without that context suffix. For example, for Spanish:

```json
    "Desired//context:pods": "Deseados"
```

#### Technical Jargon words

For some technical/jargon terms, there often isn't a good translation for
them. To find these ones, it can be good to look at existing documentation
like the k8s docs.

The word "Pods" is a good example of a technical word that is used in Spanish.
Maybe it could directly translate to "Vainas", but "Pods" is used instead.

- <https://kubernetes.io/es/docs/concepts/workloads/pods/pod/>
- <https://kubernetes.io/docs/concepts/workloads/pods/pod/>

## Number formatting

Numbers are formatted in a locale-specific way. For example in 'en'
they are formatted like `1,000,000` but with 'de' they are formatted
like `1.000.000`.

Here is an example which can use number formatting:

```JavaScript
    return t('{{numReady, number}} / {{numItems, number}} Requested', {
      numReady: podsReady.length,
      numItems: items.length,
    });
```

Number formatting is being done with [Intl.NumberFormat](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Intl/NumberFormat).

## Date formatting

Here's an example of using date formatting:

```Javascript
    return t('appsection:When {{ date, date }}', {

    });
```

## Translation Workflow

### For Updating Existing Languages

1. **Check translation status:**
   ```bash
   npm run i18n:status
   ```

2. **Open the JSON files directly** in `frontend/src/i18n/locales/<lang>/`
   - `translation.json` - UI strings
   - `glossary.json` - Kubernetes technical terms
   - `app.json` - App-specific strings

3. **Find empty strings** (these need translation):
   ```json
   {
     "Some key": "",  ← Needs translation
     "Another key": "Translated text"  ← Already done
   }
   ```

4. **Add translations** for empty strings:
   ```json
   {
     "Some key": "Your translation here",
     "Another key": "Translated text"
   }
   ```

5. **Verify your work:**
   ```bash
   npm run i18n:status
   ```

6. **Submit a pull request** with your changes

### For Adding a New Language

1. **Create the language directory:**
   ```bash
   mkdir frontend/src/i18n/locales/<lang-code>
   ```

   Language codes should follow the [ISO 639-1 standard](https://en.wikipedia.org/wiki/List_of_ISO_639-1_codes).

2. **Generate translation files:**
   ```bash
   # From the project root
   npm run i18n
   ```

   This will create empty translation files for your new language.

3. **Follow the update workflow above** to translate the strings

Integrated components may need to be adjusted (MaterialUI/Monaco etc).

## Deprecated Tools

**⚠️ DEPRECATED:** The old CLI tools in `frontend/src/i18n/tools/` are deprecated and should no longer be used:

- `extract-empty-translations.js` → Use `npm run i18n:extract` instead
- `copy-translations.js` → Use `npm run i18n:copy` instead

The new i18n tool (see Helper Commands above) provides the same functionality with better error handling and a more consistent interface.

## Material UI

Some Material UI components are localized and are configured
via a theme provider.

See the Material UI
[Localization Guide](https://material-ui.com/guides/localization/),
and also `frontend/src/i18n/ThemeProviderNexti18n.tsx` where integration is done.

## Storybook integration

TODO: not implemented. There's no working addons that let you set a language easily.

## Monaco editor integration

See `frontend/src/components/common/Resource/EditorDialog.tsx`

Note, that Monaco editor does not support pt, ta and other languages.
