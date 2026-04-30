-- 新增「一發」役（雀魂內列在 1 番役區），供「一發的屎人」排行榜使用
INSERT INTO stats (name, display_order, value_type, agg_method, category, scope) VALUES
  ('一發', 415, 'integer', 'sum', 'yaku_1', 'merged_only')
ON CONFLICT (name) DO NOTHING;
