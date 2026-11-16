---
title: i18n Internationalization / Localization
sidebar_label: Internationalization
sidebar_position: 5
---

Headlamp's internationalization uses the i18next, i18next-cli, and
react-i18next libraries.

Run `npm run i18n` from the frontend or app directory to extract keys.
The bundled configuration preserves dynamic keys and shared namespaces.
Plugins using `headlamp-plugin i18n` without a custom config need no changes.
Custom extraction configs must use `i18next.config.*`; legacy-only configs fail
with migration guidance rather than being ignored. Run
`npx i18next-cli migrate-config i18next-parser.config.js` in the plugin directory
and review the generated config. Plugins invoking the old `i18next` executable
directly must update their script to use `i18next-cli extract`. This changes
development tooling, not the runtime format of installed plugins.

## Default language, and locales

We started with an international English and that will be the fallback language.

Now we're starting with locales familiar to us and will accept
translations through GitHub.

## Browser based language detection

We use
[i18next-browser-languagedetector](https://github.com/i18next/i18next-browser-languageDetector#readme)

This can select the browser language through various means like through
cookies or the html language tag.

One way to change the locale is to use `?lng=en` in the URL.

## Lazy load locale files

Dynamic imports and the webpack code splitting feature we
load locale files from `src/i18n/locales/{{lng}}/{{ns}}.json`
where `{{lng}}` is the language code, and `{{ns}}` is the namespace.
