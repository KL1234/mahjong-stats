import { supabase } from './supabase.js';
import { initAuthArea, escapeHtml } from './ui.js';
import {
  MODES, MERGED_MODES, MODE_LABELS, FOUR_MODES, THREE_MODES,
  indexValues, gamesByMode, findTotalGamesStatId,
  aggregateStat, formatValue,
} from './aggregate.js';
import { computeAutoTitles } from './ranking.js';

initAuthArea();

const CATEGORY_LABELS = {
  basic:        '基礎統計',
  win_dist:     '和牌分布',
  style:        '風格屬性',
  yaku_normal:  '番數達成次數',
  yaku_dora:    '寶牌',
  yaku_yakuman: '役滿',
};
// 合併資料 tab 的分區順序（依雀魂遊戲內 UI 順序）
const MERGED_CATEGORY_ORDER = ['win_dist', 'style', 'yaku_normal', 'yaku_dora', 'yaku_yakuman'];
// 番數類欄位（預設值顯示 0）
const YAKU_CATEGORIES = ['yaku_normal', 'yaku_dora', 'yaku_yakuman'];

const params = new URLSearchParams(location.search);
const playerId = parseInt(params.get('id'), 10);
const detailEl = document.getElementById('player-detail');

let isAuthed = false;
let player = null;
let allStats = [];
let allPlayers = [];
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

  const [playerRes, statsRes, allPlayersRes] = await Promise.all([
    supabase
      .from('players')
      .select('id, name, is_active, titles(id, name), player_stats(stat_id, mode, value)')
      .eq('id', playerId)
      .single(),
    supabase
      .from('stats')
      .select('id, name, display_order, value_type, agg_method, unit, category, scope')
      .order('display_order'),
    supabase
      .from('players')
      .select('id, name, is_active, player_stats(stat_id, mode, value)'),
  ]);

  if (playerRes.error) {
    detailEl.innerHTML = `<p class="error">載入失敗：${escapeHtml(playerRes.error.message)}</p>`;
    return;
  }

  player = playerRes.data;
  allStats = statsRes.data || [];
  allPlayers = allPlayersRes.data || [];
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

  // 自動稱號（依排行榜 Top 1 計算）
  const autoTitleMap = computeAutoTitles(allPlayers, allStats);
  const myAutoTitles = autoTitleMap[player.id] || [];
  const autoTitles = myAutoTitles.length === 0
    ? '<span class="empty-inline">（目前沒有獲得任何排行榜第 1 名）</span>'
    : myAutoTitles.map(t => `
        <span class="tag tag-auto" title="${escapeHtml(t.note)}">${escapeHtml(t.title)}</span>
      `).join('');

  const tabs = [
    { key: 'merged', label: '📊 合併數據' },
    ...MODES.map(m => ({ key: m, label: MODE_LABELS[m] })),
    ...MERGED_MODES.map(m => ({ key: m, label: `✏️ ${MODE_LABELS[m]}` })),
  ];
  const tabBar = tabs.map(t => `
    <button class="tab-btn ${activeTab === t.key ? 'active' : ''}" data-tab="${t.key}">${t.label}</button>
  `).join('');

  const isActive = player.is_active !== false;
  detailEl.innerHTML = `
    <div class="player-header">
      <h2 id="player-name">${escapeHtml(player.name)}${isActive ? '' : ' <span class="inactive-badge">💤 不參與排行</span>'}</h2>
      ${isAuthed ? `
        <button id="rename-player-btn" class="btn-small">改名</button>
        <button id="toggle-active-btn" class="btn-small">${isActive ? '💤 從排行排除' : '🔁 加回排行'}</button>
      ` : ''}
    </div>

    <section>
      <h3>稱號</h3>
      <h4 class="titles-subhead">🤖 自動稱號（依排行榜 Top 1 即時計算）</h4>
      <div class="titles">${autoTitles}</div>
      <h4 class="titles-subhead">✏️ 手動稱號</h4>
      <div class="titles">${titles}</div>
      ${isAuthed ? `
        <form id="add-title-form" class="inline-form">
          <input type="text" id="new-title-name" placeholder="新增手動稱號（例：神之雀士）" required maxlength="30">
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
      合併規則：事件率（和牌率、立直率等）依「該場別場數 × 平均局數」（≈ 該場別實際總局數）加權平均；總對局數取加總；最大連莊取最大值；<br>
      和牌分布、風格屬性、番數類欄位為「直填」（不分東南），直接讀四人合併 / 三人合併。<br>
      四人場平均局數：東風 = 4.5、南風 = 8.5（已考慮連莊/西入後的實際平均）。<br>
      被飛率為「整場至少被飛一次」的場機率，會用 1−(1−場被飛率)^(1/平均局數) 換成「每局被飛率」後再合併，這樣東/南可直接比較。<br>
      將滑鼠移到數值上可看到計算過程；點此 <a href="titles.html">查看排行榜稱號計算方式</a>。
    </p>
  `;
}

function pickModes(obj, modes) {
  const r = {};
  for (const m of modes) if (obj[m] != null) r[m] = obj[m];
  return r;
}

function renderMergedCard(title, modes, valuesByStat, gamesPerMode) {
  // 依 scope 分為「基礎」（per_mode 自動計算）與其他類別（merged_only 直填）
  const perModeStats = allStats.filter(s => s.scope !== 'merged_only');
  const mergedStats = allStats.filter(s => s.scope === 'merged_only');

  const basicRows = perModeStats.map(s => statRow(s, valuesByStat, gamesPerMode, modes)).join('');

  const sections = MERGED_CATEGORY_ORDER.map(cat => {
    const items = mergedStats.filter(s => s.category === cat);
    if (items.length === 0) return '';
    const rows = items.map(s => statRow(s, valuesByStat, gamesPerMode, modes)).join('');
    return `
      <h5 class="merged-section-h">${escapeHtml(CATEGORY_LABELS[cat] || cat)}</h5>
      <table class="stats-table compact"><tbody>${rows}</tbody></table>
    `;
  }).join('');

  return `
    <div class="merged-card">
      <h4>${escapeHtml(title)}</h4>
      <h5 class="merged-section-h">${escapeHtml(CATEGORY_LABELS.basic)}</h5>
      <table class="stats-table compact"><tbody>${basicRows}</tbody></table>
      ${sections}
    </div>
  `;
}

function statRow(s, valuesByStat, gamesPerMode, modes) {
  const r = aggregateStat(s, valuesByStat, gamesPerMode, modes);
  const display = r.hasData ? formatValue(r.value, s) : '—';
  return `
    <tr title="${escapeHtml(r.breakdown)}">
      <td>${escapeHtml(s.name)}</td>
      <td class="value-cell">${display}</td>
    </tr>
  `;
}

// ===== 單一場別視圖：批次表單 =====
function renderModeView(mode) {
  const valuesByStat = indexValues(player.player_stats);
  const isMerged = mode === '4M' || mode === '3M';
  // per_mode tab 顯示 scope='per_mode' 的 stat；merged tab 顯示 scope='merged_only' 的 stat
  const visibleStats = allStats.filter(s =>
    isMerged ? s.scope === 'merged_only' : s.scope !== 'merged_only'
  );

  let body = '';
  if (isMerged) {
    // 依 category 分區塊
    const sections = MERGED_CATEGORY_ORDER.map(cat => {
      const items = visibleStats.filter(s => s.category === cat);
      if (items.length === 0) return '';
      return `
        <h4 class="batch-section-h">${escapeHtml(CATEGORY_LABELS[cat] || cat)}</h4>
        <div class="batch-grid">${items.map(s => fieldHtml(s, valuesByStat, mode)).join('')}</div>
      `;
    }).join('');
    body = sections || '<p class="empty">尚無此分類的統計項</p>';
  } else {
    body = `<div class="batch-grid">${visibleStats.map(s => fieldHtml(s, valuesByStat, mode)).join('')}</div>`;
  }

  const actions = isAuthed ? `
    <div class="form-actions">
      <button type="submit" class="btn-primary">💾 儲存 ${MODE_LABELS[mode]} 數據</button>
      <button type="button" class="btn-secondary" data-clear-mode>清空此場別</button>
    </div>
    <p class="hint">空白欄位代表「未填」，儲存時會從資料庫移除。百分比請填 0–100 的數字（不含 %），整數請填整數，小數可保留兩位。</p>
  ` : '<p class="hint">登入後可編輯數據。</p>';

  return `
    <form id="mode-form" data-mode="${mode}">
      ${body}
      ${actions}
    </form>
  `;
}

function fieldHtml(s, valuesByStat, mode) {
  const v = valuesByStat[s.id]?.[mode];
  const placeholder = placeholderFor(s);
  // 番數類欄位若未填則預設顯示 0（方便 user 對照雀魂介面快速輸入）
  const isYaku = YAKU_CATEGORIES.includes(s.category);
  const displayValue = v != null ? v : (isYaku ? 0 : '');
  return `
    <label class="field" data-type="${s.value_type}">
      <span class="field-name">${escapeHtml(s.name)}<small>${labelFor(s)}</small></span>
      <input
        type="text"
        inputmode="decimal"
        name="stat_${s.id}"
        data-stat-id="${s.id}"
        data-value-type="${s.value_type}"
        value="${displayValue}"
        placeholder="${placeholder}"
        ${isAuthed ? '' : 'disabled'}>
    </label>
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

  document.getElementById('toggle-active-btn')?.addEventListener('click', async () => {
    const next = player.is_active === false ? true : false;
    const verb = next ? '加回排行榜' : '從排行榜排除';
    if (!confirm(`確定${verb}此雀士？\n（影響所有自動稱號與排行榜計算）`)) return;
    const { error } = await supabase.from('players').update({ is_active: next }).eq('id', player.id);
    if (error) return alert(`更新失敗：${error.message}`);
    await load();
    flash(`已${verb}`);
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
