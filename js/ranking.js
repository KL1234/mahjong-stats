import { supabase } from './supabase.js';
import { initAuthArea, escapeHtml } from './ui.js';
import {
  FOUR_MODES, MODE_WEIGHT,
  indexValues, gamesByMode, findTotalGamesStatId,
  aggregateStat, formatValue,
} from './aggregate.js';

initAuthArea();

// 排行榜定義：稱號、依據的統計項名稱、排序方向、是否套用門檻
const RANKINGS = [
  { title: '👑 和牌王',  statName: '和牌率',   order: 'desc', useThreshold: true  },
  { title: '💀 放銃王',  statName: '放銃率',   order: 'desc', useThreshold: true  },
  { title: '🚀 立直王',  statName: '立直率',   order: 'desc', useThreshold: true  },
  { title: '🎯 自摸王',  statName: '自摸率',   order: 'desc', useThreshold: true  },
  { title: '💰 打點王',  statName: '平均打點', order: 'desc', useThreshold: true  },
  { title: '🥇 順位王',  statName: '平均順位', order: 'asc',  useThreshold: true  },
  { title: '🏆 連莊王',  statName: '最大連莊', order: 'desc', useThreshold: true  },
  { title: '🎲 副露王',  statName: '副露率',   order: 'desc', useThreshold: true  },
  { title: '💩 被飛王',  statName: '被飛率',   order: 'desc', useThreshold: true  },
  { title: '⚡ 速攻王',  statName: '和了巡數', order: 'asc',  useThreshold: true  },
  {
    title: '🎮 勤勞王', statName: '總對局數', order: 'desc', useThreshold: false,
    note: '計算公式：東場數 × 1 + 南場數 × 2（依遊戲時長加權）',
    custom: c => (c.fourGamesByMode['4E'] || 0) * MODE_WEIGHT['4E']
              + (c.fourGamesByMode['4S'] || 0) * MODE_WEIGHT['4S'],
  },
];

const TOP_N = 5;

let allPlayers = [];
let allStats = [];
let threshold = 100;

const gridEl = document.getElementById('ranking-grid');
const statusEl = document.getElementById('status-line');
const thresholdSelect = document.getElementById('threshold-select');

thresholdSelect.addEventListener('change', () => {
  threshold = parseInt(thresholdSelect.value, 10);
  render();
});

async function load() {
  const [playersRes, statsRes] = await Promise.all([
    supabase
      .from('players')
      .select('id, name, player_stats(stat_id, mode, value)')
      .order('id'),
    supabase
      .from('stats')
      .select('id, name, display_order, value_type, agg_method, unit')
      .order('display_order'),
  ]);

  if (playersRes.error || statsRes.error) {
    gridEl.innerHTML = `<p class="error">載入失敗：${escapeHtml((playersRes.error || statsRes.error).message)}</p>`;
    return;
  }

  allPlayers = playersRes.data || [];
  allStats = statsRes.data || [];
  render();
}

function render() {
  if (allPlayers.length === 0) {
    gridEl.innerHTML = '<p class="empty">尚無雀士資料</p>';
    statusEl.textContent = '';
    return;
  }

  const totalGamesId = findTotalGamesStatId(allStats);

  // 預先算好：每位雀士的「四人合併」數據與四人總對局數
  const computed = allPlayers.map(p => {
    const valuesByStat = indexValues(p.player_stats);
    const fourGamesByMode = pickModes(gamesByMode(valuesByStat, totalGamesId), FOUR_MODES);
    const fourGamesTotal = Object.values(fourGamesByMode).reduce((a, v) => a + Number(v || 0), 0);
    return { player: p, valuesByStat, fourGamesByMode, fourGamesTotal };
  });

  const eligible = computed.filter(c => c.fourGamesTotal >= threshold);
  statusEl.innerHTML = threshold > 0
    ? `符合「四人總對局數 ≥ ${threshold}」門檻的雀士：<strong>${eligible.length}</strong> / ${computed.length}`
    : `所有雀士共 <strong>${computed.length}</strong> 位`;

  const cards = RANKINGS.map(r => renderRankingCard(r, computed, eligible)).join('');
  gridEl.innerHTML = cards;
}

function renderRankingCard(ranking, computed, eligible) {
  const stat = allStats.find(s => s.name === ranking.statName);
  if (!stat) {
    return `<div class="rank-card"><h3>${escapeHtml(ranking.title)}</h3><p class="empty">找不到統計項：${escapeHtml(ranking.statName)}</p></div>`;
  }

  // 「勤勞王」不套門檻，其他套
  const pool = ranking.useThreshold ? eligible : computed;

  const rows = pool.map(c => {
    if (ranking.custom) {
      const v = ranking.custom(c);
      return v > 0 ? { player: c.player, value: v } : null;
    }
    const r = aggregateStat(stat, c.valuesByStat, c.fourGamesByMode, FOUR_MODES);
    return r.hasData ? { player: c.player, value: r.value } : null;
  }).filter(Boolean);

  if (rows.length === 0) {
    return `
      <div class="rank-card">
        <h3>${escapeHtml(ranking.title)}</h3>
        <p class="rank-stat-name">依據：${escapeHtml(ranking.statName)}</p>
        <p class="empty">無符合資料的雀士</p>
      </div>
    `;
  }

  rows.sort((a, b) => ranking.order === 'asc' ? a.value - b.value : b.value - a.value);
  const top = rows.slice(0, TOP_N);

  const orderHint = ranking.order === 'asc' ? '（越低越好）' : '';

  const list = top.map((row, idx) => {
    const medal = idx === 0 ? '🥇' : idx === 1 ? '🥈' : idx === 2 ? '🥉' : `${idx + 1}.`;
    const klass = idx === 0 ? 'rank-1' : idx === 1 ? 'rank-2' : idx === 2 ? 'rank-3' : '';
    return `
      <li class="rank-row ${klass}">
        <span class="rank-medal">${medal}</span>
        <a class="rank-name" href="player.html?id=${row.player.id}">${escapeHtml(row.player.name)}</a>
        <span class="rank-value">${formatValue(row.value, stat)}</span>
      </li>
    `;
  }).join('');

  return `
    <div class="rank-card">
      <h3>${escapeHtml(ranking.title)}</h3>
      <p class="rank-stat-name">依據：${escapeHtml(ranking.statName)} ${orderHint}</p>
      ${ranking.note ? `<p class="rank-note">${escapeHtml(ranking.note)}</p>` : ''}
      <ol class="rank-list">${list}</ol>
    </div>
  `;
}

function pickModes(obj, modes) {
  const r = {};
  for (const m of modes) if (obj[m] != null) r[m] = obj[m];
  return r;
}

load();
