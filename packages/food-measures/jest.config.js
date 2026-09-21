module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/tests'],
  // Standalone, for the same reason as the agent's: the repo root tsconfig
  // extends expo/tsconfig.base, and a pure-TypeScript package's tests should
  // not need the React Native toolchain installed to run.
  transform: {
    '^.+\\.tsx?$': ['ts-jest', { tsconfig: '<rootDir>/tsconfig.test.json' }],
  },
};
