---
title: i18n Internationalization / Localization
sidebar_label: Internationalization
sidebar_position: 5
---

Headlamp's internationalization uses the i18next, i18next-parser, and
react-i18next libraries.

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
