export interface BuildInfo {
  readonly version: string;
  readonly build: string;
  readonly commit: string;
  readonly builtAt: string;
}

const FALLBACK_VERSION = '0.2.5';
const FALLBACK_BUILD = 'dev';
const FALLBACK_COMMIT = 'local';

function normalized(value: string | undefined, fallback: string): string {
  const trimmed = value?.trim();
  return trimmed === undefined || trimmed.length === 0 ? fallback : trimmed;
}

function shortCommit(value: string): string {
  return value === FALLBACK_COMMIT ? value : value.slice(0, 8);
}

export const EMBEDDED_BUILD_INFO: BuildInfo = {
  version: normalized(import.meta.env.VITE_APP_VERSION, FALLBACK_VERSION),
  build: normalized(import.meta.env.VITE_BUILD_NUMBER, FALLBACK_BUILD),
  commit: shortCommit(
    normalized(import.meta.env.VITE_COMMIT_SHA, FALLBACK_COMMIT),
  ),
  builtAt: normalized(import.meta.env.VITE_BUILD_TIME, ''),
};

export function formatBuildLabel(info: BuildInfo): string {
  return `v${info.version}+${info.build} · ${info.commit}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function readRequiredString(
  value: Record<string, unknown>,
  key: string,
): string | null {
  const candidate = value[key];
  if (typeof candidate !== 'string') return null;
  const trimmed = candidate.trim();
  return trimmed.length === 0 ? null : trimmed;
}

function readOptionalString(
  value: Record<string, unknown>,
  key: string,
): string {
  const candidate = value[key];
  return typeof candidate === 'string' ? candidate.trim() : '';
}

export function parseDeploymentMarker(value: unknown): BuildInfo | null {
  if (!isRecord(value)) return null;
  const version = readRequiredString(value, 'version');
  const build = readRequiredString(value, 'build');
  const commit = readRequiredString(value, 'commit');
  if (version === null || build === null || commit === null) return null;
  return {
    version,
    build,
    commit: shortCommit(commit),
    builtAt: readOptionalString(value, 'builtAt'),
  };
}

function isSameBuild(first: BuildInfo, second: BuildInfo): boolean {
  return first.build === second.build && first.commit === second.commit;
}

function describeBuild(info: BuildInfo): string {
  const label = formatBuildLabel(info);
  return info.builtAt.length === 0 ? label : `${label}\n构建时间：${info.builtAt}`;
}

function getOrCreateBuildBadge(): HTMLElement {
  const existing = document.querySelector<HTMLElement>('#build-version');
  if (existing !== null) return existing;

  const badge = document.createElement('div');
  badge.id = 'build-version';
  badge.className = 'build-version';
  badge.setAttribute('role', 'status');
  badge.setAttribute('aria-live', 'polite');
  badge.textContent = '版本检查中…';
  document.body.append(badge);
  return badge;
}

export async function initializeBuildBadge(): Promise<void> {
  const badge = getOrCreateBuildBadge();

  badge.textContent = formatBuildLabel(EMBEDDED_BUILD_INFO);
  badge.title = `页面内嵌版本：${describeBuild(EMBEDDED_BUILD_INFO)}`;

  try {
    const markerUrl = `${import.meta.env.BASE_URL}version.json?t=${String(Date.now())}`;
    const response = await fetch(markerUrl, { cache: 'no-store' });
    if (!response.ok) {
      throw new Error(`version.json returned ${String(response.status)}`);
    }
    const marker = (await response.json()) as unknown;
    const deployed = parseDeploymentMarker(marker);
    if (deployed === null) throw new Error('version.json is invalid');

    if (isSameBuild(EMBEDDED_BUILD_INFO, deployed)) {
      badge.dataset.state = 'current';
      badge.textContent = formatBuildLabel(deployed);
      badge.title = `当前部署：${describeBuild(deployed)}`;
      return;
    }

    badge.dataset.state = 'mismatch';
    badge.textContent = `缓存 ${formatBuildLabel(EMBEDDED_BUILD_INFO)} · 部署 ${formatBuildLabel(deployed)}`;
    badge.title = `浏览器仍在运行旧资源。\n页面：${describeBuild(EMBEDDED_BUILD_INFO)}\n服务器：${describeBuild(deployed)}`;
  } catch (error: unknown) {
    badge.dataset.state = 'unverified';
    badge.textContent = `${formatBuildLabel(EMBEDDED_BUILD_INFO)} · 部署未核验`;
    badge.title =
      error instanceof Error
        ? `无法读取部署标记：${error.message}`
        : '无法读取部署标记。';
  }
}
