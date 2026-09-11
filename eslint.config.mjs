// Configuration ESLint.
//
// Cette application n'a ni build ni types : un import mal orthographié ou une
// variable oubliée ne se manifeste qu'à l'ouverture de la page, parfois sur
// un seul écran. Le linter est donc le seul filet avant le navigateur, et
// c'est ce qu'on lui demande ici — pas du style.
//
// Volontairement absent : toute règle de mise en forme (indentation,
// guillemets, virgules). Elles génèrent du bruit sans attraper de bug, et
// reformateraient 4 000 lignes existantes pour rien.

import js from '@eslint/js';
import globals from 'globals';

const COMMUN = {
  ...js.configs.recommended.rules,

  // Ce qui attrape de vrais défauts sur ce dépôt
  'no-unused-vars': ['error', {
    args: 'after-used',
    argsIgnorePattern: '^_',
    caughtErrors: 'none', // `catch { }` volontairement vide, usage courant ici
  }],
  'no-undef': 'error',
  'no-implicit-globals': 'error',
  eqeqeq: ['error', 'always', { null: 'ignore' }], // == null reste utile
  'no-var': 'error',
  'prefer-const': 'error',
  'no-return-await': 'error',
  'require-atomic-updates': 'off', // trop de faux positifs sur async/await

  // Pièges déjà rencontrés dans ce projet
  'no-template-curly-in-string': 'error', // '${x}' dans une chaîne simple
  'no-fallthrough': 'error',
  'no-constant-condition': ['error', { checkLoops: false }],
  'no-self-compare': 'error',
  'no-unmodified-loop-condition': 'error',
  'no-unsafe-optional-chaining': 'error',
  'no-promise-executor-return': 'error',
  'no-await-in-loop': 'off', // les boucles séquentielles sont voulues ici
};

export default [
  { ignores: ['node_modules/**', 'tests/ui/.artefacts/**', 'docs/screenshots/**'] },

  // Code navigateur : l'application
  {
    files: ['js/**/*.js'],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'module',
      globals: { ...globals.browser, EFI_ACCESS_CODE: 'writable' },
    },
    rules: COMMUN,
  },

  // Fonctions serverless et scripts : Node
  {
    files: ['api/**/*.js', 'scripts/**/*.mjs', 'tests/ui/run.mjs'],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'module',
      globals: { ...globals.node },
    },
    rules: COMMUN,
  },

  // Tests unitaires : Node + le lanceur de node:test
  {
    files: ['tests/**/*.test.mjs'],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'module',
      globals: { ...globals.node },
    },
    rules: COMMUN,
  },

  // Suites navigateur : exécutées par Node, mais page.evaluate() contient du
  // code navigateur — les deux jeux de globales sont donc légitimes.
  {
    files: ['tests/ui/**/*.ui.mjs', 'tests/ui/_harness.mjs'],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'module',
      globals: { ...globals.node, ...globals.browser },
    },
    rules: COMMUN,
  },
];
