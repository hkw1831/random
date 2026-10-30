# Random HTML Tools

## Tests

The patient-record regression tests use Node's built-in test runner and need no installed dependencies.

```sh
node --test test/fm-patient-record.test.js
```

The test reads `fm-patient-record.html` without modifying it. It verifies grid markers, representative point-key rules, expected duplicate-key behavior, cross-layout key equivalence, balance-rule and guide references, patient-data normalization, and the numbered CU1/CU2 combinations for `an-la`, `an-me`, `re-la`, and `re-me`.

## Browser Tests

Install the test dependency and Chromium once:

```sh
npm install
npx playwright install chromium
```

Run the browser workflow tests with:

```sh
npm run test:e2e
```

These tests cover patient visits and lifecycle actions, point marking, clearing, treatment results, all color-list import/export flows, body history, treatment comments, layout switching, patient and storage-wide JSON import/export validation, patient search, accessibility smoke checks, and a mobile viewport workflow. They start a local server automatically and do not modify `fm-patient-record.html`.