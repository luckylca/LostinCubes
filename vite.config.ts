import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { defineConfig } from 'vite';

interface PackageMetadata {
  readonly version: string;
}

const packageMetadata = JSON.parse(
  readFileSync(new URL('./package.json', import.meta.url), 'utf8'),
) as PackageMetadata;

function readGitCommit(): string {
  const githubSha = process.env.GITHUB_SHA?.trim();
  if (githubSha !== undefined && githubSha.length > 0) return githubSha;

  try {
    return execFileSync('git', ['rev-parse', 'HEAD'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
  } catch {
    return 'local';
  }
}

const buildNumber = process.env.GITHUB_RUN_NUMBER?.trim() || 'dev';
const commitSha = readGitCommit();
const buildTime = new Date().toISOString();

export default defineConfig({
  base: '/LostinCubes/',
  define: {
    'import.meta.env.VITE_APP_VERSION': JSON.stringify(packageMetadata.version),
    'import.meta.env.VITE_BUILD_NUMBER': JSON.stringify(buildNumber),
    'import.meta.env.VITE_COMMIT_SHA': JSON.stringify(commitSha),
    'import.meta.env.VITE_BUILD_TIME': JSON.stringify(buildTime),
  },
  build: {
    target: 'es2022',
    sourcemap: true,
  },
});
