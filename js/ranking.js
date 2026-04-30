import { supabase } from './supabase.js';
import { initAuthArea, escapeHtml } from './ui.js';
import {
  FOUR_MODES, MODE_WEIGHT, MERGED_MODE_FOR,
  indexValues, gamesByMode, findTotalGamesStatId,
  aggregateStat, formatValue,
} from './aggregate.js';

initAuthArea();

// 排行榜定義（共用 export，給 index.js / player.js 計算自動稱號）
// - statName 模式：依某個統計項排序（自動套用 aggregateStat 合併）
// - custom 模式：自訂計算函式 (computed, ctx) => number | null；可指定 valueType 控制顯示格式
// - note：稱號代表的意思（顯示在排行榜卡片與稱號 tooltip）
export const RANKINGS = [
  // === 既有：基於 per_mode stats ===
  { title: '👑 和牌王',     statName: '和牌率',   order: 'desc', useThreshold: true,
    note: '和牌率最高（最會贏的人）' },
  { title: '💸 散財童子',   statName: '放銃率',   order: 'desc', useThreshold: true,
    note: '放銃率最高（最常送錢給別人）' },
  { title: '🚀 立直王',     statName: '立直率',   order: 'desc', useThreshold: true,
    note: '立直率最高（最愛喊立直）' },
  { title: '👹 自摸之鬼',   statName: '自摸率',   order: 'desc', useThreshold: true,
    note: '自摸率最高（不靠別人也能和）' },
  { title: '💥 重砲手',     statName: '平均打點', order: 'desc', useThreshold: true,
    note: '平均打點最高（一發入魂）' },
  { title: '🥇 順位王',     statName: '平均順位', order: 'asc',  useThreshold: true,
    note: '平均順位最佳（越低越強）' },
  { title: '📌 釘子戶',     statName: '最大連莊', order: 'desc', useThreshold: true,
    note: '最大連莊最高（賴在莊家位不走）' },
  { title: '🎲 副露王',     statName: '副露率',   order: 'desc', useThreshold: true,
    note: '副露率最高（吃碰到底）' },
  { title: '💩 被飛王',     statName: '被飛率',   order: 'desc', useThreshold: true,
    note: '被飛率最高（最常被擊沉）' },
  { title: '⚡ 速攻王',     statName: '和了巡數', order: 'asc',  useThreshold: true,
    note: '和了巡數最少（最快和牌）' },

  // === 既有：自訂 ===
  { title: '🎮 勤勞王', statName: '總對局數', order: 'desc', useThreshold: false,
    note: '加權對局數最多（東場 ×1 + 南場 ×2，依時長加權）',
    custom: c => (c.fourGamesByMode['4E'] || 0) * MODE_WEIGHT['4E']
              + (c.fourGamesByMode['4S'] || 0) * MODE_WEIGHT['4S'],
  },

  // === 新增：基於 merged_only stats ===
  { title: '🥇 1位王', statName: '一位率', order: 'desc', useThreshold: true,
    note: '一位率最高（最常拿 1 位）' },
  { title: '😵 4位王', statName: '四位率', order: 'desc', useThreshold: true,
    note: '四位率最高（最常掉到 4 位）' },
  { title: '🎴 立直和牌王', statName: '立直和牌率', order: 'desc', useThreshold: true,
    note: '和牌中以立直方式達成的比例最高' },
  { title: '🃏 副露和牌王', statName: '副露和牌率', order: 'desc', useThreshold: true,
    note: '和牌中以副露方式達成的比例最高' },
  { title: '🥷 影武者', statName: '默聽和牌率', order: 'desc', useThreshold: true,
    note: '默聽和牌率最高（無聲無息把錢拿走）' },
  { title: '🤖 斷么九機器人', order: 'desc', useThreshold: true,
    note: '斷么九 ÷ 和牌次數推算：和牌中斷么九佔比最高',
    valueType: 'percent',
    custom: (c, ctx) => ratioOverWinCount(c, ['斷么九'], ctx.stats),
  },
  { title: '💀 一發的屎人', order: 'desc', useThreshold: true,
    note: '一發 ÷ 立直總次數推算（立直率 × 對局數）：每立直一次能命中一發的比率',
    valueType: 'percent',
    custom: (c, ctx) => {
      const riichiRate = readWeightedPct(c, '立直率', ctx.stats);
      if (riichiRate == null) return null;
      const totalRiichi = c.fourGamesTotal * riichiRate / 100;
      if (totalRiichi === 0) return null;
      const ippatsu = readMergedCount(c, '一發', ctx.stats);
      if (ippatsu == null) return null;
      return ippatsu / totalRiichi * 100;
    },
  },
  { title: '🔥 混一色狂魔', order: 'desc', useThreshold: true,
    note: '混一色 ÷ 和牌次數推算：和牌中混一色佔比最高（一條道走到黑）',
    valueType: 'percent',
    custom: (c, ctx) => ratioOverWinCount(c, ['混一色'], ctx.stats),
  },
  { title: '🗡 七對子殺手', order: 'desc', useThreshold: true,
    note: '七對子 ÷ 和牌次數推算：和牌中七對子佔比最高（湊對成癮）',
    valueType: 'percent',
    custom: (c, ctx) => ratioOverWinCount(c, ['七對子'], ctx.stats),
  },
  { title: '📦 役滿收藏家', order: 'desc', useThreshold: false,
    note: '役滿牌型次數加總最多（含天和、地和、大三元、四暗刻、國士無雙等）。役滿太稀有故維持絕對次數',
    valueType: 'integer',
    custom: (c, ctx) => sumByCategory(c, 'yaku_yakuman', ctx.stats),
  },
  { title: '💎 寶牌戰士', order: 'desc', useThreshold: true,
    note: '(寶牌+紅+裡) ÷ 和牌次數推算：每次和牌平均拿到的寶牌張數',
    valueType: 'decimal',
    custom: (c, ctx) => {
      const winCount = estimateWinCount(c, ctx.stats);
      if (winCount == null || winCount === 0) return null;
      const dora = sumStats(c, ['寶牌', '紅寶牌', '裡寶牌'], ctx.stats);
      return dora / winCount;
    },
  },
  { title: '⛩ 全帶么九傳教士', order: 'desc', useThreshold: true,
    note: '(混全+純全) ÷ 和牌次數推算：和牌中么九系列佔比最高（么九信徒）',
    valueType: 'percent',
    custom: (c, ctx) => ratioOverWinCount(c, ['混全帶么九', '純全帶么九'], ctx.stats),
  },
  { title: '🎭 裝忙仔', order: 'desc', useThreshold: true,
    note: '立直率 × 放銃率 ÷ 100：立得勤、銃得也勤，看似很拚其實在裝忙',
    valueType: 'percent',
    custom: (c, ctx) => {
      const r = readWeightedPct(c, '立直率', ctx.stats);
      const f = readWeightedPct(c, '放銃率', ctx.stats);
      if (r == null || f == null) return null;
      return r * f / 100;
    },
  },
];

const TOP_N = 5;
// 自動稱號（首頁 / 玩家詳細頁顯示）固定使用此門檻
export const AUTO_TITLE_THRESHOLD = 100;

// === 共用：計算每位玩家的 computed 結構 ===
// 自動排除 is_active === false 的玩家（user 標記為「不參與排行」）
export function computeAllPlayers(players, stats) {
  const totalGamesId = findTotalGamesStatId(stats);
  return players
    .filter(p => p.is_active !== false)
    .map(p => {
      const valuesByStat = indexValues(p.player_stats);
      const fourGamesByMode = pickModes(gamesByMode(valuesByStat, totalGamesId), FOUR_MODES);
      const fourGamesTotal = Object.values(fourGamesByMode).reduce((a, v) => a + Number(v || 0), 0);
      return { player: p, valuesByStat, fourGamesByMode, fourGamesTotal };
    });
}

// === 共用：算出每位玩家拿到的「Top 1」自動稱號 ===
// 回傳: { [playerId]: [{ title, note }, ...] }
export function computeAutoTitles(players, stats, threshold = AUTO_TITLE_THRESHOLD) {
  const computed = computeAllPlayers(players, stats);
  const eligible = computed.filter(c => c.fourGamesTotal >= threshold);
  const titlesByPlayer = {};

  for (const r of RANKINGS) {
    const pool = r.useThreshold ? eligible : computed;
    const stat = r.statName ? stats.find(s => s.name === r.statName) : null;
    if (r.statName && !stat) continue;

    const rows = pool.map(c => {
      if (r.custom) {
        const v = r.custom(c, { stats });
        return v != null && v > 0 ? { player: c.player, value: v } : null;
      }
      const ar = aggregateStat(stat, c.valuesByStat, c.fourGamesByMode, FOUR_MODES);
      return ar.hasData ? { player: c.player, value: ar.value } : null;
    }).filter(Boolean);

    if (rows.length === 0) continue;
    rows.sort((a, b) => r.order === 'asc' ? a.value - b.value : b.value - a.value);
    const top1 = rows[0];
    if (!titlesByPlayer[top1.player.id]) titlesByPlayer[top1.player.id] = [];
    titlesByPlayer[top1.player.id].push({ title: r.title, note: r.note || '' });
  }
  return titlesByPlayer;
}

// =====================================================================
// 以下為 ranking.html 專用渲染
// =====================================================================

let allPlayers = [];
let allStats = [];
let threshold = 100;

const gridEl = document.getElementById('ranking-grid');
const statusEl = document.getElementById('status-line');
const thresholdSelect = document.getElementById('threshold-select');

// ranking.js 也作為共用模組被 import；下方 DOM 操作只在 ranking.html 上執行
if (gridEl) {
  thresholdSelect.addEventListener('change', () => {
    threshold = parseInt(thresholdSelect.value, 10);
    render();
  });
  load();
}

async function load() {
  const [playersRes, statsRes] = await Promise.all([
    supabase
      .from('players')
      .select('id, name, is_active, player_stats(stat_id, mode, value)')
      .order('id'),
    supabase
      .from('stats')
      .select('id, name, display_order, value_type, agg_method, unit, category, scope')
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

  const computed = computeAllPlayers(allPlayers, allStats);
  const eligible = computed.filter(c => c.fourGamesTotal >= threshold);

  statusEl.innerHTML = threshold > 0
    ? `符合「四人總對局數 ≥ ${threshold}」門檻的雀士：<strong>${eligible.length}</strong> / ${computed.length}`
    : `所有雀士共 <strong>${computed.length}</strong> 位`;

  const cards = RANKINGS.map(r => renderRankingCard(r, computed, eligible)).join('');
  gridEl.innerHTML = cards;
}

function renderRankingCard(ranking, computed, eligible) {
  let stat = null;
  if (ranking.statName) {
    stat = allStats.find(s => s.name === ranking.statName);
    if (!stat) {
      return `<div class="rank-card"><h3>${escapeHtml(ranking.title)}</h3><p class="empty">找不到統計項：${escapeHtml(ranking.statName)}</p></div>`;
    }
  }
  const formatStat = stat || { value_type: ranking.valueType || 'integer' };

  const pool = ranking.useThreshold ? eligible : computed;

  const rows = pool.map(c => {
    if (ranking.custom) {
      const v = ranking.custom(c, { stats: allStats });
      return v != null && v > 0 ? { player: c.player, value: v } : null;
    }
    const r = aggregateStat(stat, c.valuesByStat, c.fourGamesByMode, FOUR_MODES);
    return r.hasData ? { player: c.player, value: r.value } : null;
  }).filter(Boolean);

  const subtitle = ranking.statName
    ? `依據：${escapeHtml(ranking.statName)}`
    : '依據：自訂計算';
  const orderHint = ranking.order === 'asc' ? '（越低越好）' : '';

  if (rows.length === 0) {
    return `
      <div class="rank-card">
        <h3>${escapeHtml(ranking.title)}</h3>
        <p class="rank-stat-name">${subtitle}</p>
        ${ranking.note ? `<p class="rank-note">${escapeHtml(ranking.note)}</p>` : ''}
        <p class="empty">無符合資料的雀士</p>
      </div>
    `;
  }

  rows.sort((a, b) => ranking.order === 'asc' ? a.value - b.value : b.value - a.value);
  const top = rows.slice(0, TOP_N);

  const list = top.map((row, idx) => {
    const medal = idx === 0 ? '🥇' : idx === 1 ? '🥈' : idx === 2 ? '🥉' : `${idx + 1}.`;
    const klass = idx === 0 ? 'rank-1' : idx === 1 ? 'rank-2' : idx === 2 ? 'rank-3' : '';
    return `
      <li class="rank-row ${klass}">
        <span class="rank-medal">${medal}</span>
        <a class="rank-name" href="player.html?id=${row.player.id}">${escapeHtml(row.player.name)}</a>
        <span class="rank-value">${formatValue(row.value, formatStat)}</span>
      </li>
    `;
  }).join('');

  return `
    <div class="rank-card">
      <h3>${escapeHtml(ranking.title)}</h3>
      <p class="rank-stat-name">${subtitle} ${orderHint}</p>
      ${ranking.note ? `<p class="rank-note">${escapeHtml(ranking.note)}</p>` : ''}
      <ol class="rank-list">${list}</ol>
    </div>
  `;
}

// ===== Helpers for custom rankings =====
function pickModes(obj, modes) {
  const r = {};
  for (const m of modes) if (obj[m] != null) r[m] = obj[m];
  return r;
}

function sumByCategory(c, category, stats) {
  const mode = MERGED_MODE_FOR.four;
  return stats
    .filter(s => s.category === category && s.scope === 'merged_only')
    .reduce((sum, s) => sum + Number(c.valuesByStat[s.id]?.[mode] ?? 0), 0);
}

function sumStats(c, names, stats) {
  const mode = MERGED_MODE_FOR.four;
  return names.reduce((sum, n) => {
    const stat = stats.find(s => s.name === n);
    if (!stat) return sum;
    return sum + Number(c.valuesByStat[stat.id]?.[mode] ?? 0);
  }, 0);
}

function readWeightedPct(c, statName, stats) {
  const stat = stats.find(s => s.name === statName);
  if (!stat) return null;
  const r = aggregateStat(stat, c.valuesByStat, c.fourGamesByMode, FOUR_MODES);
  return r.hasData ? r.value : null;
}

// 讀某 merged_only stat 在 4M 的值；無資料回 null（區別於 0）
function readMergedCount(c, statName, stats) {
  const stat = stats.find(s => s.name === statName);
  if (!stat) return null;
  const v = c.valuesByStat[stat.id]?.[MERGED_MODE_FOR.four];
  return v == null ? null : Number(v);
}

// 推算四人合併和牌次數 = 和牌率(%) × 四人總對局數 / 100
function estimateWinCount(c, stats) {
  const winRate = readWeightedPct(c, '和牌率', stats);
  if (winRate == null) return null;
  return c.fourGamesTotal * winRate / 100;
}

// 「指定役名次數加總 / 和牌次數推算」百分比；用於斷么/混一色/七對子/全帶么九等高頻役
function ratioOverWinCount(c, names, stats) {
  const winCount = estimateWinCount(c, stats);
  if (winCount == null || winCount === 0) return null;
  const cnt = sumStats(c, names, stats);
  return cnt / winCount * 100;
}
