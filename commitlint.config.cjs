module.exports = {
  extends: ['@commitlint/config-conventional'],
  rules: {
    // Allow longer subjects for descriptive feature/fix messages
    'header-max-length': [1, 'always', 120],
    // Allow any scope (package names, areas, etc.)
    'scope-enum': [0],
    // Standard types: feat, fix, chore, docs, style, refactor, perf, test, build, ci, revert
    'type-enum': [
      2,
      'always',
      [
        'feat',
        'fix',
        'chore',
        'docs',
        'style',
        'refactor',
        'perf',
        'test',
        'build',
        'ci',
        'revert',
      ],
    ],
  },
};
