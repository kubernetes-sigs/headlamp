---
title: Contributing to Internationalization
sidebar_label: Contributing
---

This section introduces some concepts for contributing translations and is
especially important when submitting a new language.

**Important:** If you add a new language, keep in mind that while all
the specific Kubernetes components' names are translatable, not all of them
will have a corresponding name in your language. Please refer to the
[Kubernetes localized docs](https://kubernetes.io/docs/home/) in your
language (if they exist) to understand which components should
be translated and which should be left in their original form.

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

## Adding a new language

Create a folder using the locale code in:
`frontend/src/i18n/locales/`

Then run `npm run i18n`. This command parses the translatable strings in
the project and creates the corresponding catalog files.

Integrated components may need to be adjusted (MaterialUI/Monaco etc).

## Translating missing strings

Technical development happens more frequently than translations. Thus, chances
are that developers introduce new strings that need to be translated and will
be stored as empty strings (defaulting to English) in the translation files.

In order to more easily spot and translate the missing strings, we have two CLI
tools:

- _extract-empty-translations.js_: This script (in ./frontend/src/i18n/tools/)
  will extract the strings without a corresponding translation from the translation
  files, and copy them into a new file.
  E.g. `$ node copy-empty-translations.js ../locales/de/translation.json` will
  by default create a `../locales/de/translation_empty.json`. This file can be
  used to translate the strings in a more isolated way.
- _copy-translations.js_: This script (in ./frontend/src/i18n/tools/)
  by default copies any existing translations from one source translation file to
  a target one, if the same key is not translated in the destination file.
  E.g. `$ node copy-translations.js ../locales/de/translation_no_longer_empty.json ../locales/de/translation.json` will
  copy any new translations from the file given as the first argument to the one
  given as the second argument, if the same key is not translated in the second.
  There are some options to this script, which can be seen by running it with the
  `--help` flag.

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
