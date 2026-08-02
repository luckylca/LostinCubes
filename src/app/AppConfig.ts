export const APP_CONFIG = Object.freeze({
  appName: 'Lost in Cubes',
  repositoryName: 'LostinCubes',
  githubPagesBasePath: '/LostinCubes/',
  simulationHz: 60,
  defaultWorldSeed: 'root-fragment-01',
});

export type AppConfig = typeof APP_CONFIG;
