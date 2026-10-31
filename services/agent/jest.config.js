module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  // A standalone tsconfig: the repo root's extends expo/tsconfig.base, so
  // inheriting it makes this suite unrunnable wherever the Expo toolchain is
  // not installed. See tsconfig.test.json.
  transform: {
    '^.+\\.tsx?$': ['ts-jest', { tsconfig: '<rootDir>/tsconfig.test.json' }],
  },
  roots: ['<rootDir>/tests'],
  moduleNameMapper: {
    '^@petra/agent-contract$': '<rootDir>/../../packages/agent-contract/src',
    '^@petra/service-kit$': '<rootDir>/../../packages/service-kit/src',
    '^@petra/food-measures$': '<rootDir>/../../packages/food-measures/src',
    // ESM-only, reached transitively from the graph. See the mock's comment.
    '^@xenova/transformers$': '<rootDir>/tests/mocks/transformers.ts',
  },
  // The graph's tests exercise nodes but never a real provider or a real
  // Redis; anything that tried would hang rather than fail, so keep the
  // timeout short enough that a stray network call is obvious.
  testTimeout: 15000,
  setupFiles: ['<rootDir>/tests/setup.ts'],
};
