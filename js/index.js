import { supabase } from './supabase.js';
import { initAuthArea, setupModalClose, escapeHtml } from './ui.js';

initAuthArea();

async function loadPlayers() {
  const list = document.getElementById('player-list');
  const { data, error } = await supabase
    .from('players')
    .select('id, name, titles(name), player_stats(value, stats(name, display_order))')
    .order('id');

  if (error) {
    list.innerHTML = `<p class="error">載入失敗：${escapeHtml(error.message)}</p>`;
    console.error(error);
    return;
  }

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

  const sortedStats = (player.player_stats || [])
    .map(ps => ({
      name: ps.stats?.name,
      order: ps.stats?.display_order ?? 99,
      value: ps.value,
    }))
    .filter(s => s.name)
    .sort((a, b) => a.order - b.order);

  const stats = sortedStats.length
    ? sortedStats.map(s => `<li><span>${escapeHtml(s.name)}</span><strong>${s.value}%</strong></li>`).join('')
    : '<li class="empty-inline">（尚未填數值）</li>';

  return `
    <a class="player-card" href="player.html?id=${player.id}">
      <h3>${escapeHtml(player.name)}</h3>
      <div class="titles">${titles}</div>
      <ul class="stats">${stats}</ul>
    </a>
  `;
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
