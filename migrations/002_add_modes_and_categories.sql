-- ============================================================
-- 加入「四人合併 / 三人合併」mode 與 stat 分類欄位
-- 並新增和牌分布、風格屬性、番數達成次數的種子資料
-- 在 Supabase SQL Editor 整段執行即可
-- ============================================================

-- 1) 擴充 player_stats.mode 加入 4M / 3M（四人合併 / 三人合併，不分東南）
ALTER TABLE player_stats DROP CONSTRAINT IF EXISTS player_stats_mode_check;
ALTER TABLE player_stats ADD CONSTRAINT player_stats_mode_check
  CHECK (mode IN ('4E', '4S', '3E', '3S', '4M', '3M'));

-- 2) stats 加入 category（分組）與 scope（拆場別 vs 只用合併 mode）
ALTER TABLE stats ADD COLUMN IF NOT EXISTS category TEXT NOT NULL DEFAULT 'basic';
ALTER TABLE stats ADD COLUMN IF NOT EXISTS scope TEXT NOT NULL DEFAULT 'per_mode';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'stats_scope_check'
  ) THEN
    ALTER TABLE stats ADD CONSTRAINT stats_scope_check
      CHECK (scope IN ('per_mode', 'merged_only'));
  END IF;
END $$;

-- 3) 種子：和牌分布（merged_only, percent）
INSERT INTO stats (name, display_order, value_type, agg_method, category, scope) VALUES
  ('立直和牌率', 200, 'percent', 'weighted_avg', 'win_dist', 'merged_only'),
  ('副露和牌率', 210, 'percent', 'weighted_avg', 'win_dist', 'merged_only'),
  ('默聽和牌率', 220, 'percent', 'weighted_avg', 'win_dist', 'merged_only')
ON CONFLICT (name) DO NOTHING;

-- 4) 種子：風格屬性（merged_only, integer）
INSERT INTO stats (name, display_order, value_type, agg_method, category, scope) VALUES
  ('攻', 300, 'integer', 'max', 'style', 'merged_only'),
  ('防', 310, 'integer', 'max', 'style', 'merged_only'),
  ('速', 320, 'integer', 'max', 'style', 'merged_only'),
  ('運', 330, 'integer', 'max', 'style', 'merged_only')
ON CONFLICT (name) DO NOTHING;

-- 5) 種子：番數達成次數（merged_only, integer, sum）
-- 1番役
INSERT INTO stats (name, display_order, value_type, agg_method, category, scope) VALUES
  ('門前清自摸和', 400, 'integer', 'sum', 'yaku_1', 'merged_only'),
  ('立直次數',     410, 'integer', 'sum', 'yaku_1', 'merged_only'),
  ('槍槓',         420, 'integer', 'sum', 'yaku_1', 'merged_only'),
  ('嶺上開花',     430, 'integer', 'sum', 'yaku_1', 'merged_only'),
  ('海底摸月',     440, 'integer', 'sum', 'yaku_1', 'merged_only'),
  ('河底撈魚',     450, 'integer', 'sum', 'yaku_1', 'merged_only'),
  ('役牌 白',      460, 'integer', 'sum', 'yaku_1', 'merged_only'),
  ('役牌 發',      470, 'integer', 'sum', 'yaku_1', 'merged_only'),
  ('役牌 中',      480, 'integer', 'sum', 'yaku_1', 'merged_only'),
  ('役牌:門風牌',  490, 'integer', 'sum', 'yaku_1', 'merged_only'),
  ('役牌:場風牌',  500, 'integer', 'sum', 'yaku_1', 'merged_only'),
  ('斷么九',       510, 'integer', 'sum', 'yaku_1', 'merged_only'),
  ('平和',         520, 'integer', 'sum', 'yaku_1', 'merged_only'),
  ('一杯口',       530, 'integer', 'sum', 'yaku_1', 'merged_only')
ON CONFLICT (name) DO NOTHING;

-- 寶牌（雖屬番數但獨立分組以便排行）
INSERT INTO stats (name, display_order, value_type, agg_method, category, scope) VALUES
  ('寶牌',   540, 'integer', 'sum', 'yaku_dora', 'merged_only'),
  ('赤寶牌', 550, 'integer', 'sum', 'yaku_dora', 'merged_only'),
  ('裏寶牌', 560, 'integer', 'sum', 'yaku_dora', 'merged_only')
ON CONFLICT (name) DO NOTHING;

-- 2番役
INSERT INTO stats (name, display_order, value_type, agg_method, category, scope) VALUES
  ('雙立直',     600, 'integer', 'sum', 'yaku_2', 'merged_only'),
  ('三色同順',   610, 'integer', 'sum', 'yaku_2', 'merged_only'),
  ('三色同刻',   620, 'integer', 'sum', 'yaku_2', 'merged_only'),
  ('一氣通貫',   630, 'integer', 'sum', 'yaku_2', 'merged_only'),
  ('對對和',     640, 'integer', 'sum', 'yaku_2', 'merged_only'),
  ('七對子',     650, 'integer', 'sum', 'yaku_2', 'merged_only'),
  ('混全帶么九', 660, 'integer', 'sum', 'yaku_2', 'merged_only'),
  ('混老頭',     670, 'integer', 'sum', 'yaku_2', 'merged_only'),
  ('三暗刻',     680, 'integer', 'sum', 'yaku_2', 'merged_only'),
  ('小三元',     710, 'integer', 'sum', 'yaku_2', 'merged_only')
ON CONFLICT (name) DO NOTHING;

-- 3番役以上
INSERT INTO stats (name, display_order, value_type, agg_method, category, scope) VALUES
  ('混一色',     800, 'integer', 'sum', 'yaku_3plus', 'merged_only'),
  ('純全帶么九', 810, 'integer', 'sum', 'yaku_3plus', 'merged_only'),
  ('二杯口',     820, 'integer', 'sum', 'yaku_3plus', 'merged_only'),
  ('清一色',     900, 'integer', 'sum', 'yaku_3plus', 'merged_only')
ON CONFLICT (name) DO NOTHING;

-- 役滿牌型
INSERT INTO stats (name, display_order, value_type, agg_method, category, scope) VALUES
  ('天和',           1000, 'integer', 'sum', 'yaku_yakuman', 'merged_only'),
  ('地和',           1010, 'integer', 'sum', 'yaku_yakuman', 'merged_only'),
  ('大三元',         1020, 'integer', 'sum', 'yaku_yakuman', 'merged_only'),
  ('四暗刻',         1030, 'integer', 'sum', 'yaku_yakuman', 'merged_only'),
  ('字一色',         1040, 'integer', 'sum', 'yaku_yakuman', 'merged_only'),
  ('綠一色',         1050, 'integer', 'sum', 'yaku_yakuman', 'merged_only'),
  ('清老頭',         1060, 'integer', 'sum', 'yaku_yakuman', 'merged_only'),
  ('國士無雙',       1070, 'integer', 'sum', 'yaku_yakuman', 'merged_only'),
  ('小四喜',         1080, 'integer', 'sum', 'yaku_yakuman', 'merged_only'),
  ('大四喜',         1090, 'integer', 'sum', 'yaku_yakuman', 'merged_only'),
  ('四槓子',         1100, 'integer', 'sum', 'yaku_yakuman', 'merged_only'),
  ('九蓮寶燈',       1110, 'integer', 'sum', 'yaku_yakuman', 'merged_only'),
  ('純正九蓮寶燈',   1120, 'integer', 'sum', 'yaku_yakuman', 'merged_only'),
  ('四暗刻單騎',     1130, 'integer', 'sum', 'yaku_yakuman', 'merged_only'),
  ('國士無雙十三面', 1140, 'integer', 'sum', 'yaku_yakuman', 'merged_only')
ON CONFLICT (name) DO NOTHING;
