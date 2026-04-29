import { supabase } from './supabase.js';
import { initAuthArea, setupModalClose, escapeHtml } from './ui.js';
import {
  FOUR_MODES, THREE_MODES,
  indexValues, gamesByMode, findTotalGamesStatId,
  aggregateStat, formatValue,
} from './aggregate.js';

initAuthArea();

let allStats = [];

async function loadPlayers() {
  const list = document.getElementById('player-list');
  const [playersRes, statsRes] = await Promise.all([
    supabase
      .from('players')
      .select('id, name, titles(name), player_stats(stat_id, mode, value)')
      .order('id'),
    supabase
      .from('stats')
      .select('id, name, display_order, value_type, agg_method, unit')
      .order('display_order'),
  ]);

  if (playersRes.error) {
    list.innerHTML = `<p class="error">載入失敗：${escapeHtml(playersRes.error.message)}</p>`;
    return;
  }
  allStats = statsRes.data || [];
  const data = playersRes.data;

  if (!data || data.length === 0) {
    list.innerHTML = '<p class="empty">尚無雀士資料，登入後可新增</p>';
    return;
  }

  list.innerHTML = data.map(renderPlayerCard).join('');
}

function renderPlayerCard(player) {
  const titles = (player.titles || [])
    .map(t => `<span class="tag">${escapeHtml(t.name)}</span>`)
    .join('') || '<span class="empty-inline">（無稱號）</span>';

  const valuesByStat = indexValues(player.player_stats);
  const totalId = findTotalGamesStatId(allStats);
  const allGames = gamesByMode(valuesByStat, totalId);

  const fourSummary = summarize(valuesByStat, pick(allGames, FOUR_MODES), FOUR_MODES);
  const threeSummary = summarize(valuesByStat, pick(allGames, THREE_MODES), THREE_MODES);

  return `
    <a class="player-card" href="player.html?id=${player.id}">
      <h3>${escapeHtml(player.name)}</h3>
      <div class="titles">${titles}</div>
      <div class="card-summary">
        <div class="summary-block">
          <span class="summary-label">四人合併</span>
          ${fourSummary}
        </div>
        <div class="summary-block">
          <span class="summary-label">三人合併</span>
          ${threeSummary}
        </div>
      </div>
    </a>
  `;
}

function summarize(valuesByStat, games, modes) {
  // 顯示三項：總對局數、和牌率、平均順位
  const picks = ['總對局數', '和牌率', '平均順位'];
  const items = picks.map(name => {
    const stat = allStats.find(s => s.name === name);
    if (!stat) return '';
    const r = aggregateStat(stat, valuesByStat, games, modes);
    const v = r.hasData ? formatValue(r.value, stat) : '—';
    return `<li><span>${escapeHtml(name)}</span><strong>${v}</strong></li>`;
  }).join('');
  return `<ul class="stats">${items}</ul>`;
}

function pick(obj, modes) {
  const r = {};
  for (const m of modes) if (obj[m] != null) r[m] = obj[m];
  return r;
}

document.getElementById('add-player-btn')?.addEventListener('click', () => {
  const modal = document.getElementById('add-player-modal');
  modal.hidden = false;
  document.getElementById('new-player-name').focus();
});

const addModal = document.getElementById('add-player-modal');
if (addModal) setupModalClose(addModal);

document.getElementById('add-player-form')?.addEventListener('submit', async (e) => {
  e.preventDefault();
  const errorEl = document.getElementById('add-player-error');
  errorEl.textContent = '';
  const name = document.getElementById('new-player-name').value.trim();
  if (!name) return;

  const { error } = await supabase.from('players').insert({ name });
  if (error) {
    errorEl.textContent = `新增失敗：${error.message}`;
    return;
  }
  addModal.hidden = true;
  e.target.reset();
  loadPlayers();
});

loadPlayers();
