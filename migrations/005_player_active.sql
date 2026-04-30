-- 玩家「是否參與排行」開關
-- is_active=false 的玩家不會出現在排行榜與自動稱號的計算池中
ALTER TABLE players
  ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT TRUE;
