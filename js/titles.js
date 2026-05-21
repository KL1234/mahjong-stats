import { supabase } from './supabase.js';
import { initAuthArea, escapeHtml } from './ui.js';
import { RANKINGS, AUTO_TITLE_THRESHOLD } from './ranking.js';

initAuthArea();

// 自訂稱號的公式說明（key = title）
const CUSTOM_FORMULAS = {
  '🎮 勤勞王':
    '四人東場數 × 4.5 + 四人南場數 × 8.5（≈ 累積總局數）',
  '🤖 斷么九機器人':
    '斷么九次數 ÷ 推算和牌次數 × 100%',
  '💀 一發的屎人':
    '一發次數 ÷ 推算立直次數 × 100%（推算立直次數 = 立直率(%) × 推算總局數 ÷ 100）',
  '🔥 混一色狂魔':
    '混一色次數 ÷ 推算和牌次數 × 100%',
  '🗡 七對子殺手':
    '七對子次數 ÷ 推算和牌次數 × 100%',
  '📦 役滿收藏家':
    'Σ 役滿類別所有牌型次數（天和+地和+大三元+四暗刻+國士無雙+…）',
  '💎 寶牌戰士':
    '(寶牌+紅寶牌+裡寶牌) ÷ 推算和牌次數',
  '⛩ 全帶么九傳教士':
    '(混全帶么九+純全帶么九) ÷ 推算和牌次數 × 100%',
  '🎭 裝忙仔':
    '立直率(%) × 放銃率(%) ÷ 100',
};

const WIN_COUNT_NOTE = '推算和牌次數 = 和牌率(%) × 推算總局數 ÷ 100；推算總局數 = 4E場×4.5 + 4S場×8.5';

const AGG_FORMULA = {
  weighted_avg:
    '加權平均：Σ(該場別數值 × 場數 × 平均局數) ÷ Σ(場數 × 平均局數)；四人東平均局數=4.5、四人南=8.5',
  sum: '四人東 + 四人南 兩場別加總',
  max: 'max(四人東, 四人南)：取最大值（含取自哪個場別）',
};

const SCOPE_LABEL = {
  per_mode: '依東/南場分別輸入後合併',
  merged_only: '直接讀玩家輸入的「四人合併」資料（不分東南）',
};

const area = document.getElementById('title-cards-area');

load();

async function load() {
  const { data, error } = await supabase
    .from('stats')
    .select('id, name, value_type, agg_method, scope, category')
    .order('display_order');

  if (error) {
    area.innerHTML = `<p class="error">載入失敗：${escapeHtml(error.message)}</p>`;
    return;
  }
  render(data || []);
}

function render(stats) {
  const cards = RANKINGS.map(r => renderCard(r, stats)).join('');
  area.innerHTML = cards;
}

function renderCard(ranking, stats) {
  const stat = ranking.statName ? stats.find(s => s.name === ranking.statName) : null;
  const orderText = ranking.order === 'asc'
    ? '<span class="order-asc">↓ 越低越強</span>'
    : '<span class="order-desc">↑ 越高越強</span>';
  const thresholdText = ranking.useThreshold
    ? `四人總場數 ≥ 門檻（排行榜可調，自動稱號固定 ${AUTO_TITLE_THRESHOLD} 局）`
    : '無門檻（所有雀士皆列入）';

  const rows = [];

  if (ranking.statName) {
    rows.push(row('依據統計項', `<strong>${escapeHtml(ranking.statName)}</strong>${stat ? '' : ' <span class="warn">（資料庫中找不到此統計項）</span>'}`));
    if (stat) {
      rows.push(row('場別劃分', escapeHtml(SCOPE_LABEL[stat.scope] || stat.scope || '—')));
      if (stat.name === '被飛率') {
        rows.push(row(
          '計算公式',
          '每局被飛率 = 1 − (1 − 場被飛率)^(1/平均局數)，再依該場別實際總局數加權平均。<br>東/南場必須先做這個換算才能直接比較。',
        ));
      } else if (stat.name === '平均順位') {
        rows.push(row(
          '計算公式',
          '每場一個結果，權重 = 該場別<strong>場數</strong>（不乘平均局數）：<br>Σ(該場別平均順位 × 場數) ÷ Σ(場數)。',
        ));
      } else if (stat.scope === 'merged_only') {
        rows.push(row('計算公式', '直接讀「四人合併」欄位輸入值。'));
      } else {
        rows.push(row('計算公式', escapeHtml(AGG_FORMULA[stat.agg_method] || stat.agg_method || '—')));
      }
    }
  } else if (CUSTOM_FORMULAS[ranking.title]) {
    rows.push(row('依據統計項', '自訂計算'));
    rows.push(row('計算公式', escapeHtml(CUSTOM_FORMULAS[ranking.title])));
    if (needsWinCountNote(ranking.title)) {
      rows.push(row('附註', escapeHtml(WIN_COUNT_NOTE)));
    }
  }

  rows.push(row('排序方向', orderText));
  rows.push(row('門檻', escapeHtml(thresholdText)));

  return `
    <div class="title-card">
      <h4>${escapeHtml(ranking.title)}</h4>
      <p class="title-note">${escapeHtml(ranking.note || '')}</p>
      <table class="formula-table compact"><tbody>${rows.join('')}</tbody></table>
    </div>
  `;
}

function row(label, html) {
  return `<tr><th>${escapeHtml(label)}</th><td>${html}</td></tr>`;
}

function needsWinCountNote(title) {
  return [
    '🤖 斷么九機器人',
    '🔥 混一色狂魔',
    '🗡 七對子殺手',
    '💎 寶牌戰士',
    '⛩ 全帶么九傳教士',
  ].includes(title);
}
