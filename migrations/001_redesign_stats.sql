-- ============================================================
-- 重新設計 stats / player_stats（依雀魂四場別 + 數值型別）
-- ⚠️ 會清空現有 stats / player_stats 資料
-- 在 Supabase SQL Editor 整段執行即可
-- ============================================================

-- 1) 重建 stats
DROP TABLE IF EXISTS player_stats CASCADE;
DROP TABLE IF EXISTS stats CASCADE;

CREATE TABLE stats (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  display_order INT NOT NULL DEFAULT 0,
  -- 數值型別：percent (0~100, 顯示加 %) / integer (整數) / decimal (小數兩位)
  value_type TEXT NOT NULL DEFAULT 'percent'
    CHECK (value_type IN ('percent', 'integer', 'decimal')),
  -- 合併計算方式：weighted_avg (加權平均) / sum (加總) / max (取最大)
  agg_method TEXT NOT NULL DEFAULT 'weighted_avg'
    CHECK (agg_method IN ('weighted_avg', 'sum', 'max')),
  unit TEXT DEFAULT ''
);

-- 2) 重建 player_stats（多了 mode 欄位，PK 改為三欄複合）
CREATE TABLE player_stats (
  player_id INT NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  stat_id   INT NOT NULL REFERENCES stats(id)   ON DELETE CASCADE,
  -- 場別：4E=四人東, 4S=四人南, 3E=三人東, 3S=三人南
  mode TEXT NOT NULL CHECK (mode IN ('4E', '4S', '3E', '3S')),
  value NUMERIC NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (player_id, stat_id, mode)
);

CREATE INDEX idx_player_stats_player ON player_stats(player_id);

-- 3) RLS：沿用現有政策模式（所有人可讀；登入者可寫）
ALTER TABLE stats        ENABLE ROW LEVEL SECURITY;
ALTER TABLE player_stats ENABLE ROW LEVEL SECURITY;

CREATE POLICY "stats_read_all"        ON stats        FOR SELECT USING (true);
CREATE POLICY "stats_write_authed"    ON stats        FOR ALL    USING (auth.role() = 'authenticated') WITH CHECK (auth.role() = 'authenticated');
CREATE POLICY "pstats_read_all"       ON player_stats FOR SELECT USING (true);
CREATE POLICY "pstats_write_authed"   ON player_stats FOR ALL    USING (auth.role() = 'authenticated') WITH CHECK (auth.role() = 'authenticated');

-- 4) 種子資料：雀魂遊戲內 15 項
INSERT INTO stats (name, display_order, value_type, agg_method) VALUES
  ('和牌率',   10, 'percent', 'weighted_avg'),
  ('自摸率',   20, 'percent', 'weighted_avg'),
  ('放銃率',   30, 'percent', 'weighted_avg'),
  ('副露率',   40, 'percent', 'weighted_avg'),
  ('立直率',   50, 'percent', 'weighted_avg'),
  ('被飛率',   60, 'percent', 'weighted_avg'),
  ('一位率',   70, 'percent', 'weighted_avg'),
  ('二位率',   80, 'percent', 'weighted_avg'),
  ('三位率',   90, 'percent', 'weighted_avg'),
  ('四位率',  100, 'percent', 'weighted_avg'),
  ('總對局數', 110, 'integer', 'sum'),
  ('平均打點', 120, 'integer', 'weighted_avg'),
  ('平均順位', 130, 'decimal', 'weighted_avg'),
  ('最大連莊', 140, 'integer', 'max'),
  ('和了巡數', 150, 'decimal', 'weighted_avg');
