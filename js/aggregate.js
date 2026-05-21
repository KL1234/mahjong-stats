// 場別常數與合併計算
export const MODES = ['4E', '4S', '3E', '3S'];
export const MERGED_MODES = ['4M', '3M'];
export const ALL_MODES = [...MODES, ...MERGED_MODES];
export const MODE_LABELS = {
  '4E': '四人東', '4S': '四人南',
  '3E': '三人東', '3S': '三人南',
  '4M': '四人合併', '3M': '三人合併',
};
// 場別平均局數：考慮連莊/西入後的實際平均
// 四人場：東風 ≈ 4.5 局、南風 ≈ 8.5 局（總局數 = 東風場 × 4.5 + 南風場 × 8.5）
// 三人場：暫沿用舊 1:2 比例（待蒐集到平均局數資料後再調整）
export const MODE_WEIGHT = { '4E': 4.5, '4S': 8.5, '3E': 1, '3S': 2 };
export const FOUR_MODES = ['4E', '4S'];
export const THREE_MODES = ['3E', '3S'];
// scope='merged_only' 的 stat 直接讀這個 mode 的值
export const MERGED_MODE_FOR = { four: '4M', three: '3M' };

const TOTAL_GAMES_NAME = '總對局數';

// 需做「場 → 每局」生存分析換算的統計項
// 場被飛率為「整場至少被飛一次」的機率，必須用 1-(1-r)^(1/平均局數) 換成每局風險才能跨場別比較
const SURVIVAL_CONVERT_STATS = new Set(['被飛率']);

// 「每場」指標：每場只產生一個結果（如 平均順位），權重應只用場數，不乘以平均局數
const MATCH_WEIGHTED_STATS = new Set(['平均順位']);

export function isSurvivalConvertStat(stat) {
  return SURVIVAL_CONVERT_STATS.has(stat?.name);
}

export function isMatchWeightedStat(stat) {
  return MATCH_WEIGHTED_STATS.has(stat?.name);
}

// 場被飛率(%) → 每局被飛率(%)
export function perHandFromPerMatch(perMatchPct, avgHands) {
  if (perMatchPct == null || avgHands == null || avgHands <= 0) return null;
  const r = Math.max(0, Math.min(1, perMatchPct / 100));
  return (1 - Math.pow(1 - r, 1 / avgHands)) * 100;
}

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

  // scope='merged_only'：直接讀 4M 或 3M 那一筆，不做加權
  if (stat.scope === 'merged_only') {
    const mergedMode = modes === FOUR_MODES || modes[0] === '4E'
      ? MERGED_MODE_FOR.four
      : MERGED_MODE_FOR.three;
    const v = perMode[mergedMode];
    if (v == null) return { value: null, breakdown: '無資料（直填欄位）', hasData: false };
    return {
      value: v,
      breakdown: `${MODE_LABELS[mergedMode]}（直填）= ${formatRaw(v, stat)}`,
      hasData: true,
    };
  }

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

  // 被飛率：先把場被飛率換成每局被飛率，再依「該場別總局數」加權
  if (isSurvivalConvertStat(stat)) {
    let totalHands = 0, valueSum = 0;
    const parts = [];
    for (const m of present) {
      const matches = Number(gamesPerMode[m] || 0);
      const avgHands = MODE_WEIGHT[m];
      if (matches === 0) continue;
      const hands = matches * avgHands;
      const perHandPct = perHandFromPerMatch(perMode[m], avgHands);
      if (perHandPct == null) continue;
      valueSum += perHandPct * hands;
      totalHands += hands;
      parts.push(`${MODE_LABELS[m]}[1-(1-${formatRaw(perMode[m], stat)})^(1/${avgHands})=${formatRaw(perHandPct, stat)} × ${matches}場 × ${avgHands}局]`);
    }
    if (totalHands === 0) {
      return { value: null, breakdown: '需先填「總對局數」才能加權', hasData: false };
    }
    const avg = valueSum / totalHands;
    return {
      value: avg,
      breakdown: `每局被飛率：[${parts.join(' + ')}] ÷ ${totalHands}局 = ${formatRaw(avg, stat)}`,
      hasData: true,
    };
  }

  // weighted_avg：
  // - 一般 stat（每局指標）：權重 = 場數 × 平均局數 ≈ 該場別總局數
  // - 每場指標（如平均順位）：權重 = 場數
  const useMatchWeight = isMatchWeightedStat(stat);
  let weightSum = 0, valueSum = 0;
  const parts = [];
  for (const m of present) {
    const matches = Number(gamesPerMode[m] || 0);
    const w = useMatchWeight ? matches : matches * MODE_WEIGHT[m];
    if (w === 0) continue;
    valueSum += perMode[m] * w;
    weightSum += w;
    parts.push(useMatchWeight
      ? `${MODE_LABELS[m]}(${formatRaw(perMode[m], stat)} × ${matches}場)`
      : `${MODE_LABELS[m]}(${formatRaw(perMode[m], stat)} × ${matches}場 × ${MODE_WEIGHT[m]}局)`);
  }
  if (weightSum === 0) {
    return { value: null, breakdown: '需先填「總對局數」才能加權', hasData: false };
  }
  const avg = valueSum / weightSum;
  const unit = useMatchWeight ? '場' : '局';
  return {
    value: avg,
    breakdown: `[${parts.join(' + ')}] ÷ ${weightSum}${unit} = ${formatRaw(avg, stat)}`,
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
