import { supabase } from './supabase.js';
import { initAuthArea, escapeHtml } from './ui.js';

initAuthArea();

const TYPE_LABEL = { percent: '百分比', integer: '整數', decimal: '小數' };
const AGG_LABEL = { weighted_avg: '加權平均', sum: '加總', max: '取最大' };

let isAuthed = false;
let allStats = [];

const listArea = document.getElementById('stats-list-area');
const addForm = document.getElementById('add-stat-form');
const authHint = document.getElementById('auth-hint');

supabase.auth.getUser().then(r => {
  isAuthed = !!r.data.user;
  syncAuthUi();
  load();
});
supabase.auth.onAuthStateChange((_e, session) => {
  isAuthed = !!session?.user;
  syncAuthUi();
  render();
});

function syncAuthUi() {
  authHint.hidden = isAuthed;
}

async function load() {
  const { data, error } = await supabase
    .from('stats')
    .select('id, name, display_order, value_type, agg_method, unit')
    .order('display_order');

  if (error) {
    listArea.innerHTML = `<p class="error">載入失敗：${escapeHtml(error.message)}</p>`;
    return;
  }
  allStats = data || [];
  render();
}

function render() {
  if (!allStats) return;

  if (allStats.length === 0) {
    listArea.innerHTML = '<p class="empty">尚無統計項目</p>';
    return;
  }

  const rows = allStats.map((s, idx) => `
    <tr>
      <td>${idx + 1}</td>
      <td>${escapeHtml(s.name)}</td>
      <td><span class="badge type-${s.value_type}">${TYPE_LABEL[s.value_type] || s.value_type}</span></td>
      <td><span class="badge agg-${s.agg_method}">${AGG_LABEL[s.agg_method] || s.agg_method}</span></td>
      ${isAuthed ? `<td class="actions">
        <button class="btn-small edit-stat" data-id="${s.id}">編輯</button>
        <button class="btn-small move-up" data-id="${s.id}" ${idx === 0 ? 'disabled' : ''}>↑</button>
        <button class="btn-small move-down" data-id="${s.id}" ${idx === allStats.length - 1 ? 'disabled' : ''}>↓</button>
        <button class="btn-small btn-danger-outline delete-stat" data-id="${s.id}" data-name="${escapeHtml(s.name)}">刪除</button>
      </td>` : ''}
    </tr>
  `).join('');

  listArea.innerHTML = `
    <table class="stats-table">
      <thead>
        <tr>
          <th style="width:60px;">順序</th>
          <th>項目名稱</th>
          <th>數值型別</th>
          <th>合併方式</th>
          ${isAuthed ? '<th>操作</th>' : ''}
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
  `;

  attachHandlers();
}

function attachHandlers() {
  document.querySelectorAll('.edit-stat').forEach(btn => {
    btn.onclick = () => openEditDialog(parseInt(btn.dataset.id, 10));
  });

  document.querySelectorAll('.delete-stat').forEach(btn => {
    btn.onclick = async () => {
      const id = parseInt(btn.dataset.id, 10);
      const name = btn.dataset.name;
      if (!confirm(`確定刪除統計項目「${name}」？\n所有雀士此項目的數值都會一併移除。`)) return;
      const { error } = await supabase.from('stats').delete().eq('id', id);
      if (error) return alert(`刪除失敗：${error.message}`);
      await load();
    };
  });

  document.querySelectorAll('.move-up').forEach(btn => {
    btn.onclick = () => swap(parseInt(btn.dataset.id, 10), -1);
  });
  document.querySelectorAll('.move-down').forEach(btn => {
    btn.onclick = () => swap(parseInt(btn.dataset.id, 10), 1);
  });
}

function openEditDialog(id) {
  const stat = allStats.find(s => s.id === id);
  if (!stat) return;

  const newName = prompt(`編輯名稱：`, stat.name);
  if (newName === null) return;
  const trimmed = newName.trim();
  if (!trimmed) return alert('名稱不可空白');

  const newType = prompt('數值型別（percent / integer / decimal）：', stat.value_type);
  if (newType === null) return;
  if (!['percent', 'integer', 'decimal'].includes(newType)) return alert('型別錯誤');

  const newAgg = prompt('合併方式（weighted_avg / sum / max）：', stat.agg_method);
  if (newAgg === null) return;
  if (!['weighted_avg', 'sum', 'max'].includes(newAgg)) return alert('合併方式錯誤');

  supabase.from('stats')
    .update({ name: trimmed, value_type: newType, agg_method: newAgg })
    .eq('id', id)
    .then(({ error }) => {
      if (error) return alert(`更新失敗：${error.message}`);
      load();
    });
}

async function swap(id, direction) {
  const idx = allStats.findIndex(s => s.id === id);
  const target = idx + direction;
  if (target < 0 || target >= allStats.length) return;

  const a = allStats[idx];
  const b = allStats[target];

  const { error: e1 } = await supabase.from('stats').update({ display_order: b.display_order }).eq('id', a.id);
  if (e1) return alert(`調整失敗：${e1.message}`);
  const { error: e2 } = await supabase.from('stats').update({ display_order: a.display_order }).eq('id', b.id);
  if (e2) return alert(`調整失敗：${e2.message}`);

  await load();
}

addForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  if (!isAuthed) return alert('請先登入');
  const name = document.getElementById('new-stat-name').value.trim();
  const valueType = document.getElementById('new-stat-type').value;
  const aggMethod = document.getElementById('new-stat-agg').value;
  if (!name) return;
  const order = (allStats.length ? Math.max(...allStats.map(s => s.display_order ?? 0)) : 0) + 10;
  const { error } = await supabase.from('stats').insert({
    name, display_order: order, value_type: valueType, agg_method: aggMethod,
  });
  if (error) return alert(`新增失敗：${error.message}`);
  addForm.reset();
  await load();
});
