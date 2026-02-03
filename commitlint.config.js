module.exports = {
  plugins: [
    {
      rules: {
        'headlamp-format': ({ header }) => {
          if (!header) {
            return [false, 'Commit message header must not be empty'];
          }
           if (/ :/.test(header)) {
            return [false, 'There should be no space before ":"'];
          }
          const parts = header.split(':').map(p => p.trim());
          if (parts.length < 2) {
            return [
              false,
              'Commit message must follow format: <area>: <description>',
            ];
          }
          const [area, subOrDesc] = parts;
          if (!area) {
            return [false, 'Area must not be empty'];
          }
          if (!subOrDesc) {
            return [false, 'Description or sub-area must not be empty'];
          }
          const strictAreas = ['app', 'frontend', 'backend'];
          if (strictAreas.includes(area.toLowerCase()) && parts.length < 3) {
            return [
              false,
              `Commits starting with "${area}" must follow format: ` +
              `<${area}>: <sub-area>: <description>\n` +
              `Example: "${area}: HomeButton: Fix navigation"`,
            ];
          }
          const description =
            parts.length >= 3 ? parts.slice(2).join(': ') : parts[1];
          if (!description) {
            return [false, 'Description must not be empty'];
          }
          if (description[0] !== description[0].toUpperCase()) {
            return [false, 'Description must start with a capitalized verb'];
          }
          return [true, ''];
        },
      },
    },
  ],

  rules: {
    'headlamp-format': [2, 'always'],
    'header-max-length': [2, 'always', 72],
    'body-max-line-length': [2, 'always', 72],
  },
};
