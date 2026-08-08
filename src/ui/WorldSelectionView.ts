import type { WorldCatalog, WorldMetadata } from '../world/WorldCatalog';

export interface WorldSelectionOptions {
  readonly deleteWorldData: (worldId: string) => Promise<void>;
}

function formatPlayedAt(timestamp: number): string {
  if (!Number.isFinite(timestamp) || timestamp <= 0) return '未记录';
  return new Date(timestamp).toLocaleString('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function createButton(label: string, className: string): HTMLButtonElement {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = className;
  button.textContent = label;
  return button;
}

export function selectWorld(
  catalog: WorldCatalog,
  options: WorldSelectionOptions,
): Promise<WorldMetadata> {
  return new Promise((resolve) => {
    const overlay = document.createElement('section');
    overlay.id = 'world-selection';
    overlay.className = 'world-selection';
    overlay.setAttribute('aria-label', '世界选择');

    const panel = document.createElement('div');
    panel.className = 'world-selection-panel';
    overlay.append(panel);

    const heading = document.createElement('div');
    heading.className = 'world-selection-heading';
    heading.innerHTML = '<span>LOST IN CUBES</span><h1>选择世界</h1><p>每个世界的方块、背包、实体与玩家状态完全隔离。</p>';
    panel.append(heading);

    const list = document.createElement('div');
    list.className = 'world-list';
    list.setAttribute('data-world-list', '');
    panel.append(list);

    const createForm = document.createElement('form');
    createForm.className = 'world-create-form';
    createForm.innerHTML = `
      <div class="world-create-title">创建新世界</div>
      <label>世界名称<input name="name" maxlength="32" value="新的世界" autocomplete="off"></label>
      <label>世界种子<input name="seed" maxlength="96" placeholder="留空 = 随机种子" autocomplete="off"></label>
      <button type="submit" class="world-primary">创建并进入</button>
    `;
    panel.append(createForm);
    document.body.append(overlay);

    const finish = (world: WorldMetadata): void => {
      catalog.setActive(world.id);
      catalog.touch(world.id);
      overlay.remove();
      resolve(world);
    };

    const render = (): void => {
      list.replaceChildren();
      const worlds = catalog.list();
      const activeId = catalog.getActiveId();
      if (worlds.length === 0) {
        const empty = document.createElement('div');
        empty.className = 'world-empty-state';
        empty.textContent = '还没有世界。可以在下方创建一个新世界。';
        list.append(empty);
        return;
      }

      for (const world of worlds) {
        const card = document.createElement('article');
        card.className = 'world-card';
        card.dataset.worldId = world.id;
        if (world.id === activeId) card.dataset.active = 'true';

        const details = document.createElement('div');
        details.className = 'world-card-details';
        const title = document.createElement('strong');
        title.textContent = world.name;
        const seed = document.createElement('span');
        seed.textContent = `Seed · ${world.seed}`;
        const played = document.createElement('span');
        played.textContent = `上次游玩 · ${formatPlayedAt(world.lastPlayedAt)}`;
        details.append(title, seed, played);

        const actions = document.createElement('div');
        actions.className = 'world-card-actions';
        const play = createButton('进入世界', 'world-primary');
        play.dataset.action = 'play';
        play.addEventListener('click', () => finish(world));
        const rename = createButton('重命名', 'world-secondary');
        rename.dataset.action = 'rename';
        rename.addEventListener('click', () => {
          const next = window.prompt('新的世界名称', world.name);
          if (next === null) return;
          catalog.rename(world.id, next);
          render();
        });
        const remove = createButton('删除', 'world-danger');
        remove.dataset.action = 'delete';
        remove.addEventListener('click', () => {
          if (!window.confirm(`确定永久删除「${world.name}」？此操作无法撤销。`)) return;
          remove.disabled = true;
          void options.deleteWorldData(world.id).finally(() => {
            catalog.delete(world.id);
            render();
          });
        });
        actions.append(play, rename, remove);
        card.append(details, actions);
        list.append(card);
      }
    };

    createForm.addEventListener('submit', (event) => {
      event.preventDefault();
      const form = new FormData(createForm);
      const nameValue = form.get('name');
      const seedValue = form.get('seed');
      const name = typeof nameValue === 'string' ? nameValue : '新的世界';
      const seed = typeof seedValue === 'string' ? seedValue : '';
      const created = catalog.create(name, seed);
      if (created !== null) finish(created);
    });

    render();
  });
}
