import { t } from './i18n.js';
import { getPadState, setPadState, getBoardState, setBoardState, getCanvasState, getClipState, pushClipEntry, subscribeGroupProject } from './group-projects-store.js';
import { broadcastProject, requestClipboardPull } from './group-projects-wire.js';
import {
  broadcastMeshPad,
  broadcastMeshBoard,
  broadcastMeshCanvas,
  broadcastMeshClipboard,
  requestMeshClipboardPull,
} from './projects-mesh-wire.js';
import { clipLimitForTier } from './group-projects-store.js';
import { getPadHistory, pushPadSnapshot, getPadSnapshotById } from './pad-history-store.js';
import { createMessageId } from './message-id.js';

const CANVAS_COLORS = ['', '#00ffc8', '#888888', '#ff3366', '#e0e0e0', '#4488ff'];

function mkStatusBar() {
  const bar = document.createElement('div');
  bar.className = 'proj-status-bar';
  const dot = document.createElement('span');
  dot.className = 'proj-status-dot';
  const text = document.createElement('span');
  text.className = 'proj-status-text';
  bar.appendChild(dot);
  bar.appendChild(text);
  return { bar, dot, text };
}

/**
 * @param {{ id: string, members?: number[] }} group
 * @param {object} config
 * @param {object} api
 * @param {{ scopeId?: string, getBroadcastTargets?: () => number[] }} [meshOpts]
 */
export function createPadToolView(group, config, api, meshOpts = null) {
  const scopeId = meshOpts?.scopeId ?? group.id;
  const wrap = document.createElement('div');
  wrap.className = 'proj-tool proj-tool--pad';

  const ta = document.createElement('textarea');
  ta.className = 'proj-pad-editor input';
  ta.spellcheck = false;

  const status = mkStatusBar();
  let debounce = null;
  let applying = false;

  function syncStatus(synced, from, latencyMs = 0) {
    status.dot.classList.toggle('proj-status-dot--ok', synced);
    status.text.textContent = synced
      ? t('projects.pad_synced').replace('{ms}', String(latencyMs))
      : from
        ? t('projects.pad_editing').replace('{id}', String(from))
        : t('projects.pad_idle');
  }

  function applyRemote() {
    const st = getPadState(scopeId);
    applying = true;
    ta.value = st.text || '';
    applying = false;
    syncStatus(true, st.from, 0);
  }

  function pushLocal(opts = {}) {
    if (applying) return;
    const text = ta.value;
    const updatedAt = Date.now();
    const payload = { text, updatedAt };
    setPadState(scopeId, { ...payload, from: config.blipId });
    if (meshOpts?.getBroadcastTargets) {
      void broadcastMeshPad(api, config, meshOpts.getBroadcastTargets(), payload);
    } else {
      void broadcastProject(api, config, group, 'pad', payload);
    }
    if (meshOpts?.meshPlusActive && !opts.skipHistory) {
      pushPadSnapshot(scopeId, {
        text,
        updatedAt,
        from: config.blipId,
        label: opts.historyLabel || '',
      });
      renderHistory?.();
    }
    syncStatus(true, config.blipId, 0);
  }

  let renderHistory = null;

  ta.addEventListener('input', () => {
    clearTimeout(debounce);
    syncStatus(false, config.blipId, 0);
    debounce = setTimeout(() => pushLocal(), 300);
  });

  const unsub = subscribeGroupProject(scopeId, (tool) => {
    if (tool === 'pad') applyRemote();
  });

  applyRemote();

  if (meshOpts?.meshPlusActive) {
    const histWrap = document.createElement('div');
    histWrap.className = 'proj-pad-history';
    const histTitle = document.createElement('div');
    histTitle.className = 'proj-pad-history-title';
    histTitle.dataset.i18n = 'projects.pad_history_title';
    histTitle.textContent = t('projects.pad_history_title');
    const histList = document.createElement('div');
    histList.className = 'proj-pad-history-list';
    const histActions = document.createElement('div');
    histActions.className = 'proj-pad-history-actions';
    const saveBtn = document.createElement('button');
    saveBtn.type = 'button';
    saveBtn.className = 'btn btn-lang';
    saveBtn.dataset.i18n = 'projects.pad_history_save';
    saveBtn.textContent = t('projects.pad_history_save');
    saveBtn.addEventListener('click', () => {
      pushPadSnapshot(scopeId, {
        text: ta.value,
        updatedAt: Date.now(),
        from: config.blipId,
        label: t('projects.pad_history_manual'),
      });
      renderHistory();
    });

    renderHistory = () => {
      histList.innerHTML = '';
      const items = getPadHistory(scopeId);
      if (!items.length) {
        const empty = document.createElement('p');
        empty.className = 'hint';
        empty.dataset.i18n = 'projects.pad_history_empty';
        empty.textContent = t('projects.pad_history_empty');
        histList.appendChild(empty);
        return;
      }
      for (const item of items) {
        const row = document.createElement('button');
        row.type = 'button';
        row.className = 'proj-pad-history-item';
        const meta = document.createElement('span');
        meta.className = 'proj-pad-history-meta';
        const when = new Date(item.updatedAt).toLocaleString();
        meta.textContent = item.label
          ? `${item.label} · #${item.from}`
          : `#${item.from} · ${when}`;
        const preview = document.createElement('span');
        preview.className = 'proj-pad-history-preview';
        preview.textContent = item.text.slice(0, 120) + (item.text.length > 120 ? '…' : '');
        row.appendChild(meta);
        row.appendChild(preview);
        row.addEventListener('click', () => {
          const snap = getPadSnapshotById(scopeId, item.id);
          if (!snap) return;
          applying = true;
          ta.value = snap.text;
          applying = false;
          pushLocal({ historyLabel: t('projects.pad_history_restore') });
        });
        histList.appendChild(row);
      }
    };

    histActions.appendChild(saveBtn);
    histWrap.appendChild(histTitle);
    histWrap.appendChild(histList);
    histWrap.appendChild(histActions);
    wrap.appendChild(ta);
    wrap.appendChild(status.bar);
    wrap.appendChild(histWrap);
    renderHistory();
  } else {
    wrap.appendChild(ta);
    wrap.appendChild(status.bar);
  }

  return {
    el: wrap,
    destroy() {
      clearTimeout(debounce);
      unsub();
    },
  };
}

export function createBoardToolView(group, config, api, meshOpts = null) {
  const scopeId = meshOpts?.scopeId ?? group.id;
  const wrap = document.createElement('div');
  wrap.className = 'proj-tool proj-tool--board';

  const cols = ['todo', 'progress', 'done'];
  const colEls = new Map();
  const status = mkStatusBar();

  function broadcastBoard(cards) {
    if (meshOpts?.getBroadcastTargets) {
      void broadcastMeshBoard(api, config, meshOpts.getBroadcastTargets(), { cards });
    } else {
      void broadcastProject(api, config, group, 'board', { cards });
    }
  }

  function render() {
    const st = getBoardState(scopeId);
    for (const col of cols) {
      const list = colEls.get(col);
      if (!list) continue;
      list.innerHTML = '';
      const cards = st.cards.filter((c) => c.status === col);
      cards.forEach((card) => {
        const el = document.createElement('div');
        el.className = `proj-board-card proj-board-card--${col}`;
        el.textContent = card.text;
        if (card.assignee) {
          const meta = document.createElement('span');
          meta.className = 'proj-board-card-meta';
          meta.textContent = ` #${card.assignee}`;
          el.appendChild(meta);
        }
        list.appendChild(el);
      });
      const add = document.createElement('button');
      add.type = 'button';
      add.className = 'btn btn-lang proj-board-add';
      add.textContent = '+';
      add.addEventListener('click', () => {
        const text = prompt(t('projects.board_card_prompt'));
        if (!text?.trim()) return;
        const next = {
          ...st,
          cards: [
            ...st.cards,
            {
              id: createMessageId(),
              text: text.trim(),
              status: col,
              assignee: config.blipId,
            },
          ],
        };
        setBoardState(scopeId, next);
        broadcastBoard(next.cards);
        render();
      });
      list.appendChild(add);
    }
    status.text.textContent = t('projects.board_cards').replace('{n}', String(st.cards.length));
  }

  const grid = document.createElement('div');
  grid.className = 'proj-board-grid';
  for (const col of cols) {
    const colWrap = document.createElement('div');
    colWrap.className = 'proj-board-col';
    const head = document.createElement('div');
    head.className = 'proj-board-col-head';
    head.textContent = t(`projects.board_${col}`);
    const list = document.createElement('div');
    list.className = 'proj-board-col-list';
    colWrap.appendChild(head);
    colWrap.appendChild(list);
    grid.appendChild(colWrap);
    colEls.set(col, list);
  }

  const unsub = subscribeGroupProject(scopeId, (tool) => {
    if (tool === 'board') render();
  });

  render();
  wrap.appendChild(grid);
  wrap.appendChild(status.bar);

  return {
    el: wrap,
    destroy() {
      unsub();
    },
    refresh: render,
  };
}

export function createCanvasToolView(group, config, api, meshOpts = null) {
  const scopeId = meshOpts?.scopeId ?? group.id;
  const wrap = document.createElement('div');
  wrap.className = 'proj-tool proj-tool--canvas';

  let color = CANVAS_COLORS[1];
  let activePainter = null;

  function broadcastCanvasPixel(x, y, c) {
    if (meshOpts?.getBroadcastTargets) {
      void broadcastMeshCanvas(api, config, meshOpts.getBroadcastTargets(), { x, y, color: c });
    } else {
      void broadcastProject(api, config, group, 'canvas', { x, y, color: c });
    }
  }

  const head = document.createElement('div');
  head.className = 'proj-canvas-head';
  const hint = document.createElement('span');
  hint.className = 'proj-canvas-hint';
  head.appendChild(hint);

  const grid = document.createElement('div');
  grid.className = 'proj-canvas-grid';
  const cells = [];

  const st0 = getCanvasState(scopeId);
  for (let y = 0; y < st0.h; y++) {
    for (let x = 0; x < st0.w; x++) {
      const cell = document.createElement('button');
      cell.type = 'button';
      cell.className = 'proj-canvas-cell';
      const idx = y * st0.w + x;
      cell.addEventListener('click', () => {
        const c = color || '#00ffc8';
        setCanvasPixel(scopeId, x, y, c);
        broadcastCanvasPixel(x, y, c);
        activePainter = config.blipId;
        paint();
      });
      cells.push(cell);
      grid.appendChild(cell);
    }
  }

  const palette = document.createElement('div');
  palette.className = 'proj-canvas-palette';
  CANVAS_COLORS.filter(Boolean).forEach((c) => {
    const sw = document.createElement('button');
    sw.type = 'button';
    sw.className = 'proj-canvas-swatch';
    sw.style.background = c;
    if (c === color) sw.classList.add('proj-canvas-swatch--active');
    sw.addEventListener('click', () => {
      color = c;
      palette.querySelectorAll('.proj-canvas-swatch').forEach((el) => el.classList.remove('proj-canvas-swatch--active'));
      sw.classList.add('proj-canvas-swatch--active');
    });
    palette.appendChild(sw);
  });

  const status = mkStatusBar();

  function paint() {
    const st = getCanvasState(scopeId);
    st.cells.forEach((c, i) => {
      cells[i].style.background = c || '#1a1a1a';
    });
    hint.textContent = t('projects.canvas_active').replace(
      '{id}',
      activePainter ? String(activePainter) : '—'
    );
    status.text.textContent = t('projects.canvas_size');
  }

  const unsub = subscribeGroupProject(scopeId, (tool) => {
    if (tool === 'canvas') paint();
  });

  paint();
  wrap.appendChild(head);
  wrap.appendChild(grid);
  wrap.appendChild(palette);
  wrap.appendChild(status.bar);

  return {
    el: wrap,
    destroy() {
      unsub();
    },
  };
}

export function createClipboardToolView(group, config, api, meshOpts = null) {
  const scopeId = meshOpts?.scopeId ?? group.id;
  const clipMax = meshOpts?.clipMax ?? clipLimitForTier(!!meshOpts?.meshPlusActive);
  const meshPlus = !!meshOpts?.meshPlusActive;
  const wrap = document.createElement('div');
  wrap.className = 'proj-tool proj-tool--clipboard';

  const list = document.createElement('div');
  list.className = 'proj-clip-list';
  const status = mkStatusBar();
  let searchQuery = '';

  function broadcastClip(payload) {
    if (meshOpts?.getBroadcastTargets) {
      void broadcastMeshClipboard(api, config, meshOpts.getBroadcastTargets(), payload);
    } else {
      void broadcastProject(api, config, group, 'clipboard', payload);
    }
  }

  function render() {
    const st = getClipState(scopeId);
    list.innerHTML = '';
    const q = searchQuery.trim().toLowerCase();
    const entries = q
      ? st.entries.filter((e) => String(e.text || '').toLowerCase().includes(q))
      : st.entries;
    entries.forEach((e) => {
      const row = document.createElement('div');
      row.className = 'proj-clip-row';
      if (Number(e.from) === Number(config.blipId)) row.classList.add('proj-clip-row--mine');
      const txt = document.createElement('span');
      txt.className = 'proj-clip-text';
      txt.textContent = e.text;
      const meta = document.createElement('span');
      meta.className = 'proj-clip-meta';
      const age = Date.now() - e.ts;
      meta.textContent = `#${e.from} · ${age}ms`;
      const copyBtn = document.createElement('button');
      copyBtn.type = 'button';
      copyBtn.className = 'btn btn-lang proj-clip-copy';
      copyBtn.textContent = '⧉';
      copyBtn.addEventListener('click', async () => {
        try {
          await navigator.clipboard.writeText(e.text);
        } catch {
          /* ignore */
        }
      });
      row.appendChild(txt);
      row.appendChild(meta);
      row.appendChild(copyBtn);
      list.appendChild(row);
    });
    if (meshPlus) {
      status.text.textContent = t('projects.clip_count_search')
        .replace('{n}', String(entries.length))
        .replace('{total}', String(st.entries.length));
    } else {
      status.text.textContent = t('projects.clip_count_limit')
        .replace('{n}', String(st.entries.length))
        .replace('{max}', String(clipMax));
    }
  }

  async function pull() {
    if (meshOpts?.getBroadcastTargets) {
      await requestMeshClipboardPull(api, config, meshOpts.getBroadcastTargets());
    } else {
      await requestClipboardPull(api, config, group);
    }
  }

  const pullBtn = document.createElement('button');
  pullBtn.type = 'button';
  pullBtn.className = 'btn btn-accent';
  pullBtn.dataset.i18n = 'projects.clip_pull';
  pullBtn.textContent = t('projects.clip_pull');
  pullBtn.addEventListener('click', () => void pull());

  const pushBtn = document.createElement('button');
  pushBtn.type = 'button';
  pushBtn.className = 'btn btn-lang';
  pushBtn.dataset.i18n = 'projects.clip_push';
  pushBtn.textContent = t('projects.clip_push');
  pushBtn.addEventListener('click', async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (!text?.trim()) return;
      const entry = {
        id: createMessageId(),
        text: text.trim().slice(0, 32000),
        from: config.blipId,
        ts: Date.now(),
      };
      pushClipEntry(scopeId, entry, clipMax);
      broadcastClip({ entry });
      render();
    } catch {
      /* permission */
    }
  });

  const actions = document.createElement('div');
  actions.className = 'proj-clip-actions';
  actions.appendChild(pullBtn);
  actions.appendChild(pushBtn);

  const topRow = document.createElement('div');
  topRow.className = 'proj-clip-top';
  topRow.appendChild(actions);

  if (meshPlus) {
    const search = document.createElement('input');
    search.type = 'search';
    search.className = 'input proj-clip-search';
    search.placeholder = t('projects.clip_search');
    search.dataset.i18nPlaceholder = 'projects.clip_search';
    search.addEventListener('input', () => {
      searchQuery = search.value;
      render();
    });
    topRow.appendChild(search);
  } else {
    const limitHint = document.createElement('p');
    limitHint.className = 'hint proj-clip-limit-hint';
    limitHint.dataset.i18n = 'projects.clip_free_limit_hint';
    limitHint.textContent = t('projects.clip_free_limit_hint').replace('{max}', String(clipMax));
    topRow.appendChild(limitHint);
  }

  const unsub = subscribeGroupProject(scopeId, (tool) => {
    if (tool === 'clipboard') render();
  });

  void pull();
  render();
  wrap.appendChild(topRow);
  wrap.appendChild(list);
  wrap.appendChild(status.bar);

  return {
    el: wrap,
    destroy() {
      unsub();
    },
    refresh: render,
  };
}
