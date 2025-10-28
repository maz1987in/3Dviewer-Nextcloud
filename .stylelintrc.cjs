module.exports = {
  extends: [
    '@nextcloud/stylelint-config',
    'stylelint-config-standard-scss',
  ],
  plugins: [
    'stylelint-order',
    'stylelint-scss',
  ],
  rules: {
    // Allow current project conventions while keeping Nextcloud base rules
    'csstools/use-logical': null,
    'color-function-notation': null,
    'alpha-value-notation': null,
    'media-feature-range-notation': null,
    'no-descending-specificity': null,
    'no-duplicate-selectors': null,
    'declaration-block-single-line-max-declarations': null,
    'keyframes-name-pattern': [
      /^(?:[a-z0-9-]+|[a-z][a-zA-Z0-9]*)$/,
      { message: 'Keyframe names must be kebab-case or camelCase' },
    ],
    'selector-class-pattern': [
      /^(?:[a-z0-9-]+|theme--dark|dark-theme|fileActionsMenu|tb)$/,
      { message: 'Use kebab-case; specific legacy selectors are allowed' },
    ],
  },
  overrides: [
    {
      files: ['**/*.vue'],
      customSyntax: 'postcss-html',
    },
    {
      files: ['**/*.scss'],
      customSyntax: 'postcss-scss',
    },
  ],
};

