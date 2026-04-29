import { supabase } from './supabase.js';
import { initAuthArea, escapeHtml } from './ui.js';
import {
  MODES, MODE_LABELS, FOUR_MODES, THREE_MODES,
  indexValues, gamesByMode, findTotalGamesStatId,
  aggregateStat, formatValue,
} from './aggregate.js';

initAuthArea();

const params = new URLSearchParams(location.search);
const playerId = parseInt(params.get('id'), 10);
const detailEl = document.getElementById('player-detail');

let isAuthed = false;
let player = null;
let allStats = [];
let activeTab = 'merged';

supabase.auth.getUser().then(r => {
  isAuthed = !!r.data.user;
  if (player) render();
});
supabase.auth.onAuthStateChange((_e, session) => {
  isAuthed = !!session?.user;
  if (player) render();
});

async function load() {
  if (!playerId) {
    detailEl.innerHTML = '<p class="error">缺少雀士 ID</p>';
    return;
  }

  const [playerRes, statsRes] = await Promise.all([
    supabase
      .from('players')
      .select('id, name, titles(id, name), player_stats(stat_id, mode, value)')
      .eq('id', playerId)
      .single(),
    supabase
      .from('stats')
      .select('id, name, display_order, value_type, agg_method, unit')
      .order('display_order'),
  ]);

  if (playerRes.error) {
    detailEl.innerHTML = `<p class="error">載入失敗：${escapeHtml(playerRes.error.message)}</p>`;
    return;
  }

  player = playerRes.data;
  allStats = statsRes.data || [];
  document.title = `${player.name} - 麻將統計`;
  render();
}

function render() {
  if (!player) return;

  const titles = (player.titles || []).map(t => `
    <span class="tag">
      ${escapeHtml(t.name)}
      ${isAuthed ? `<button class="tag-remove" data-title-id="${t.id}" title="移除">×</button>` : ''}
    </span>
  `).join('') || '<span class="empty-inline">（尚無稱號）</span>';

  const tabs = [
    { key: 'merged', label: '📊 合併數據' },
    ...MODES.map(m => ({ key: m, label: MODE_LABELS[m] })),
  ];
  const tabBar = tabs.map(t => `
    <button class="tab-btn ${activeTab === t.key ? 'active' : ''}" data-tab="${t.key}">${t.label}</button>
  `).join('');

  detailEl.innerHTML = `
    <div class="player-header">
      <h2 id="player-name">${escapeHtml(player.name)}</h2>
      ${isAuthed ? `<button id="rename-player-btn" class="btn-small">改名</button>` : ''}
    </div>

    <section>
      <h3>稱號</h3>
      <div class="titles">${titles}</div>
      ${isAuthed ? `
        <form id="add-title-form" class="inline-form">
          <input type="text" id="new-title-name" placeholder="新增稱號（例：役滿王）" required maxlength="30">
          <button type="submit" class="btn-primary">新增稱號</button>
        </form>
      ` : ''}
    </section>

    <section>
      <div class="tab-bar">${tabBar}</div>
      <div id="tab-content"></div>
    </section>

    ${isAuthed ? `
      <section class="danger-zone">
        <button id="delete-player-btn" class="btn-danger">刪除此雀士</button>
      </section>
    ` : ''}
  `;

  renderTabContent();
  attachCommonHandlers();
}

function renderTabContent() {
  const wrap = document.getElementById('tab-content');
  if (activeTab === 'merged') {
    wrap.innerHTML = renderMergedView();
  } else {
    wrap.innerHTML = renderModeView(activeTab);
    attachModeHandlers(activeTab);
  }
  attachTabHandlers();
}

// ===== 合併視圖：四人合併 + 三人合併 =====
function renderMergedView() {
  const valuesByStat = indexValues(player.player_stats);
  const totalGamesId = findTotalGamesStatId(allStats);
  const allGames = gamesByMode(valuesByStat, totalGamesId);

  const fourGames = pickModes(allGames, FOUR_MODES);
  const threeGames = pickModes(allGames, THREE_MODES);

  return `
    <div class="merged-grid">
      ${renderMergedCard('四人合併（東+南）', FOUR_MODES, valuesByStat, fourGames)}
      ${renderMergedCard('三人合併（東+南）', THREE_MODES, valuesByStat, threeGames)}
    </div>
    <p class="hint">
      合併規則：百分比/平均值依「該場別總對局數 × 場別權重」加權平均；總對局數取加總；最大連莊取最大值。<br>
      場別權重：東風場 = 1，南風場 = 2（南場時長約為東場兩倍）。將滑鼠移到數值上可看到計算過程。
    </p>
  `;
}

function pickModes(obj, modes) {
  const r = {};
  for (const m of modes) if (obj[m] != null) r[m] = obj[m];
  return r;
}

function renderMergedCard(title, modes, valuesByStat, gamesPerMode) {
  const rows = allStats.map(s => {
    const r = aggregateStat(s, valuesByStat, gamesPerMode, modes);
    const display = r.hasData ? formatValue(r.value, s) : '—';
    return `
      <tr title="${escapeHtml(r.breakdown)}">
        <td>${escapeHtml(s.name)}</td>
        <td class="value-cell">${display}</td>
      </tr>
    `;
  }).join('');

  return `
    <div class="merged-card">
      <h4>${escapeHtml(title)}</h4>
      <table class="stats-table compact">
        <tbody>${rows}</tbody>
      </table>
    </div>
  `;
}

// ===== 單一場別視圖：批次表單 =====
function renderModeView(mode) {
  const valuesByStat = indexValues(player.player_stats);
  const fields = allStats.map(s => {
    const v = valuesByStat[s.id]?.[mode];
    const placeholder = placeholderFor(s);
    return `
      <label class="field" data-type="${s.value_type}">
        <span class="field-name">${escapeHtml(s.name)}<small>${labelFor(s)}</small></span>
        <input
          type="text"
          inputmode="decimal"
          name="stat_${s.id}"
          data-stat-id="${s.id}"
          data-value-type="${s.value_type}"
          value="${v ?? ''}"
          placeholder="${placeholder}"
          ${isAuthed ? '' : 'disabled'}>
      </label>
    `;
  }).join('');

  const actions = isAuthed ? `
    <div class="form-actions">
      <button type="submit" class="btn-primary">💾 儲存 ${MODE_LABELS[mode]} 數據</button>
      <button type="button" class="btn-secondary" data-clear-mode>清空此場別</button>
    </div>
    <p class="hint">空白欄位代表「未填」，儲存時會從資料庫移除。百分比請填 0–100 的數字（不含 %），整數請填整數，小數可保留兩位。</p>
  ` : '<p class="hint">登入後可編輯數據。</p>';

  return `
    <form id="mode-form" data-mode="${mode}">
      <div class="batch-grid">${fields}</div>
      ${actions}
    </form>
  `;
}

function labelFor(s) {
  if (s.value_type === 'percent') return '（%）';
  if (s.value_type === 'integer') return '（整數）';
  if (s.value_type === 'decimal') return '（小數）';
  return '';
}

function placeholderFor(s) {
  if (s.value_type === 'percent') return '例：16.88';
  if (s.value_type === 'integer') return '例：634';
  if (s.value_type === 'decimal') return '例：2.64';
  return '';
}

// ===== handlers =====
function attachTabHandlers() {
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.onclick = () => {
      activeTab = btn.dataset.tab;
      document.querySelectorAll('.tab-btn').forEach(b => b.classList.toggle('active', b.dataset.tab === activeTab));
      renderTabContent();
    };
  });
}

function attachModeHandlers(mode) {
  const form = document.getElementById('mode-form');
  if (!form || !isAuthed) return;

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const inputs = form.querySelectorAll('input[data-stat-id]');
    const upserts = [];
    const deletes = [];

    for (const input of inputs) {
      const statId = parseInt(input.dataset.statId, 10);
      const type = input.dataset.valueType;
      const raw = input.value.trim();
      if (raw === '') {
        deletes.push(statId);
        continue;
      }
      const num = Number(raw);
      if (isNaN(num)) {
        alert(`「${input.closest('label').querySelector('.field-name').firstChild.textContent}」不是有效數字`);
        return;
      }
      if (type === 'percent' && (num < 0 || num > 100)) {
        alert(`百分比必須在 0–100 之間（${input.previousSibling?.textContent || ''}）`);
        return;
      }
      const value = type === 'integer' ? Math.round(num) : Number(num.toFixed(2));
      upserts.push({
        player_id: player.id,
        stat_id: statId,
        mode,
        value,
        updated_at: new Date().toISOString(),
      });
    }

    if (upserts.length > 0) {
      const { error } = await supabase
        .from('player_stats')
        .upsert(upserts, { onConflict: 'player_id,stat_id,mode' });
      if (error) return alert(`儲存失敗：${error.message}`);
    }
    if (deletes.length > 0) {
      const { error } = await supabase
        .from('player_stats')
        .delete()
        .eq('player_id', player.id)
        .eq('mode', mode)
        .in('stat_id', deletes);
      if (error) return alert(`清除空欄失敗：${error.message}`);
    }

    await load();
    flash(`${MODE_LABELS[mode]} 已儲存`);
  });

  form.querySelector('[data-clear-mode]')?.addEventListener('click', async () => {
    if (!confirm(`確定清空「${MODE_LABELS[mode]}」的所有數據？`)) return;
    const { error } = await supabase
      .from('player_stats')
      .delete()
      .eq('player_id', player.id)
      .eq('mode', mode);
    if (error) return alert(`清空失敗：${error.message}`);
    await load();
  });
}

function attachCommonHandlers() {
  document.getElementById('add-title-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const input = document.getElementById('new-title-name');
    const name = input.value.trim();
    if (!name) return;
    const { error } = await supabase.from('titles').insert({ player_id: player.id, name });
    if (error) return alert(`新增失敗：${error.message}`);
    input.value = '';
    await load();
  });

  document.querySelectorAll('.tag-remove').forEach(btn => {
    btn.onclick = async (e) => {
      e.preventDefault();
      const id = parseInt(btn.dataset.titleId, 10);
      if (!confirm('確定移除此稱號？')) return;
      const { error } = await supabase.from('titles').delete().eq('id', id);
      if (error) return alert(`移除失敗：${error.message}`);
      await load();
    };
  });

  document.getElementById('rename-player-btn')?.addEventListener('click', async () => {
    const newName = prompt('輸入新的雀士名稱：', player.name);
    if (!newName || newName.trim() === '' || newName === player.name) return;
    const { error } = await supabase.from('players').update({ name: newName.trim() }).eq('id', player.id);
    if (error) return alert(`改名失敗：${error.message}`);
    await load();
  });

  document.getElementById('delete-player-btn')?.addEventListener('click', async () => {
    if (!confirm(`確定刪除雀士「${player.name}」？\n（所有稱號和統計數值都會一併刪除）`)) return;
    const { error } = await supabase.from('players').delete().eq('id', player.id);
    if (error) return alert(`刪除失敗：${error.message}`);
    location.href = 'index.html';
  });
}

function flash(msg) {
  const el = document.createElement('div');
  el.className = 'toast';
  el.textContent = msg;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 1800);
}

load();
