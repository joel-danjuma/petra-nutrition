module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/tests'],
  moduleNameMapper: {
    '^@petra/agent-contract$': '<rootDir>/../../packages/agent-contract/src',
    '^@petra/service-kit$': '<rootDir>/../../packages/service-kit/src',
  },
};
