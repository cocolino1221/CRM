import { defineConfig } from 'vitest/config';
import path from 'path';

// The monorepo root hoists a mismatched react/react-dom pair (19.1.0 against
// 19.2.0) for the React Native workspace. Next.js resolves this app's own
// node_modules first and builds against 18.3.1; vite would walk up to the root
// and load the mismatch, so both are pinned to this app's copies here.
const local = (pkg: string) => path.resolve(__dirname, 'node_modules', pkg);

export default defineConfig({
  test: {
    // jsdom only where a test asks for it, so the plain logic specs stay fast.
    environmentMatchGlobs: [['**/*.dom.spec.{ts,tsx}', 'jsdom']],
    globals: true,
    // *.dom.spec.tsx needs React rendering, which this monorepo cannot do yet:
    // the root hoists react-dom 19.2.0 against react 19.1.0, and Testing
    // Library loads that pair. Aligning the duplicate React copies is a
    // lockfile change both live clients build from, so it is its own job.
    // The dialog's logic is covered without a DOM in lib/disposition-outcomes.spec.ts.
    exclude: ['**/node_modules/**', '**/*.dom.spec.{ts,tsx}'],
    // Testing Library is CJS and lives in the hoisted root, so node's own
    // resolution would hand it the root's react-dom and defeat the aliases
    // below. Inlining it puts the import through vite instead.
    server: { deps: { inline: [/@testing-library/] } },
  },
  // Next.js compiles JSX with the automatic runtime, so components here do not
  // import React. Without this, vite's classic default makes every rendered
  // component throw "React is not defined".
  esbuild: { jsx: 'automatic' },
  resolve: {
    dedupe: ['react', 'react-dom'],
    alias: {
      '@': path.resolve(__dirname, '.'),
      react: local('react'),
      'react-dom': local('react-dom'),
      'react-dom/client': local('react-dom/client'),
      'react/jsx-dev-runtime': local('react/jsx-dev-runtime'),
      'react/jsx-runtime': local('react/jsx-runtime'),
    },
  },
});
