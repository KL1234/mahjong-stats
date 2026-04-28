import { supabase } from './supabase.js';
import { initAuthArea, escapeHtml } from './ui.js';

initAuthArea();

const params = new URLSearchParams(location.search);
const playerId = parseInt(params.get('id'), 10);
const detailEl = document.getElementById('player-detail');

let isAuthed = false;
let player = null;
let allStats = [];

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
      .select('id, name, titles(id, name), player_stats(stat_id, value)')
      .eq('id', playerId)
      .single(),
    supabase
      .from('stats')
      .select('id, name, display_order')
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

  const valueMap = new Map((player.player_stats || []).map(ps => [ps.stat_id, ps.value]));

  const statsRows = allStats.map(s => {
    const v = valueMap.get(s.id);
    const display = v == null ? '—' : `${v}%`;
    return `
      <tr>
        <td>${escapeHtml(s.name)}</td>
        <td class="value-cell">${display}</td>
        ${isAuthed ? `<td>
          <button class="btn-small edit-stat" data-stat-id="${s.id}" data-current="${v ?? ''}">編輯</button>
        </td>` : ''}
      </tr>
    `;
  }).join('') || `<tr><td colspan="${isAuthed ? 3 : 2}" class="empty-inline">尚無統計項目</td></tr>`;

  const titles = (player.titles || []).map(t => `
    <span class="tag">
      ${escapeHtml(t.name)}
      ${isAuthed ? `<button class="tag-remove" data-title-id="${t.id}" title="移除">×</button>` : ''}
    </span>
  `).join('') || '<span class="empty-inline">（尚無稱號）</span>';

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
      <h3>統計數值</h3>
      <table class="stats-table">
        <thead>
          <tr>
            <th>項目</th>
            <th>數值</th>
            ${isAuthed ? '<th>操作</th>' : ''}
          </tr>
        </thead>
        <tbody>${statsRows}</tbody>
      </table>
      ${isAuthed ? `
        <p class="hint">數值請輸入 0–100 的數字（不含百分號），可保留兩位小數。清空輸入框可刪除該數值。<br>
        要新增或刪除統計項目，請到 <a href="stats.html">統計項目管理</a>。</p>
      ` : ''}
    </section>

    ${isAuthed ? `
      <section class="danger-zone">
        <button id="delete-player-btn" class="btn-danger">刪除此雀士</button>
      </section>
    ` : ''}
  `;

  attachHandlers();
}

function attachHandlers() {
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

  document.querySelectorAll('.edit-stat').forEach(btn => {
    btn.onclick = async () => {
      const statId = parseInt(btn.dataset.statId, 10);
      const current = btn.dataset.current;
      const input = prompt('輸入新的數值（0–100，可小數兩位）：\n（清空後按確定可刪除此數值）', current);
      if (input === null) return;

      if (input.trim() === '') {
        const { error } = await supabase
          .from('player_stats')
          .delete()
          .eq('player_id', player.id)
          .eq('stat_id', statId);
        if (error) return alert(`刪除失敗：${error.message}`);
      } else {
        const value = parseFloat(input);
        if (isNaN(value) || value < 0 || value > 100) {
          alert('請輸入 0–100 的數字');
          return;
        }
        const { error } = await supabase.from('player_stats').upsert({
          player_id: player.id,
          stat_id: statId,
          value: Number(value.toFixed(2)),
          updated_at: new Date().toISOString(),
        });
        if (error) return alert(`更新失敗：${error.message}`);
      }
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

load();
