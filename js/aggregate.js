// 場別常數與合併計算
export const MODES = ['4E', '4S', '3E', '3S'];
export const MODE_LABELS = { '4E': '四人東', '4S': '四人南', '3E': '三人東', '3S': '三人南' };
// 時間權重：南場 ≈ 東場 × 2
export const MODE_WEIGHT = { '4E': 1, '4S': 2, '3E': 1, '3S': 2 };
export const FOUR_MODES = ['4E', '4S'];
export const THREE_MODES = ['3E', '3S'];

const TOTAL_GAMES_NAME = '總對局數';

export function findTotalGamesStatId(stats) {
  return stats.find(s => s.name === TOTAL_GAMES_NAME)?.id ?? null;
}

// 將 player_stats 陣列轉成 { [statId]: { [mode]: value } }
export function indexValues(playerStats) {
  const map = {};
  for (const ps of playerStats || []) {
    if (!map[ps.stat_id]) map[ps.stat_id] = {};
    map[ps.stat_id][ps.mode] = Number(ps.value);
  }
  return map;
}

// 取出 { [mode]: 總對局數 }
export function gamesByMode(valuesByStat, totalGamesStatId) {
  if (!totalGamesStatId) return {};
  return valuesByStat[totalGamesStatId] || {};
}

// 對單一 stat 在指定 modes 範圍內合併
// 回傳 { value, breakdown, hasData }
export function aggregateStat(stat, valuesByStat, gamesPerMode, modes) {
  const perMode = valuesByStat[stat.id] || {};
  const present = modes.filter(m => perMode[m] != null);
  if (present.length === 0) return { value: null, breakdown: '無資料', hasData: false };

  if (stat.agg_method === 'sum') {
    const sum = present.reduce((a, m) => a + perMode[m], 0);
    const parts = present.map(m => `${MODE_LABELS[m]} ${formatRaw(perMode[m], stat)}`).join(' + ');
    return { value: sum, breakdown: `${parts} = ${formatRaw(sum, stat)}`, hasData: true };
  }

  if (stat.agg_method === 'max') {
    let best = present[0];
    for (const m of present) if (perMode[m] > perMode[best]) best = m;
    const list = present.map(m => `${MODE_LABELS[m]} ${formatRaw(perMode[m], stat)}`).join(', ');
    return { value: perMode[best], breakdown: `max(${list}) = ${formatRaw(perMode[best], stat)}（取自 ${MODE_LABELS[best]}）`, hasData: true };
  }

  // weighted_avg：權重 = 該場別總對局數 × 場別時長權重
  let weightSum = 0, valueSum = 0;
  const parts = [];
  for (const m of present) {
    const games = Number(gamesPerMode[m] || 0);
    const w = games * MODE_WEIGHT[m];
    if (w === 0) continue;
    valueSum += perMode[m] * w;
    weightSum += w;
    parts.push(`${MODE_LABELS[m]}(${formatRaw(perMode[m], stat)} × ${games}局 × ${MODE_WEIGHT[m]})`);
  }
  if (weightSum === 0) {
    return { value: null, breakdown: '需先填「總對局數」才能加權', hasData: false };
  }
  const avg = valueSum / weightSum;
  return {
    value: avg,
    breakdown: `[${parts.join(' + ')}] ÷ ${weightSum} = ${formatRaw(avg, stat)}`,
    hasData: true,
  };
}

// 顯示用格式（含單位）
export function formatValue(v, stat) {
  if (v == null || v === '') return '—';
  return formatRaw(Number(v), stat);
}

function formatRaw(n, stat) {
  if (stat.value_type === 'percent') return `${round2(n)}%`;
  if (stat.value_type === 'integer') return Math.round(n).toLocaleString();
  if (stat.value_type === 'decimal') return round2(n).toString();
  return String(n);
}

function round2(n) {
  return Math.round(n * 100) / 100;
}
