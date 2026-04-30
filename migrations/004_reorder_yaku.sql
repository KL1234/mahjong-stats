-- ============================================================
-- 番次達成次數：重排順序對應雀魂遊戲內 UI、改名為遊戲內用字、新增流局滿貫
-- 並把 1/2/3 番役全部歸為單一分類 yaku_normal（依 display_order 排即可）
-- ============================================================

-- 0) 移除不存在的役（雀魂沒有「三色同槓」這個役）
DELETE FROM stats WHERE name = '三色同槓';

-- 1) 統一改用遊戲內用字
UPDATE stats SET name = '立直'     WHERE name = '立直次數';
UPDATE stats SET name = '一盃口'   WHERE name = '一杯口';
UPDATE stats SET name = '兩立直'   WHERE name = '雙立直';
UPDATE stats SET name = '二盃口'   WHERE name = '二杯口';
UPDATE stats SET name = '紅寶牌'   WHERE name = '赤寶牌';
UPDATE stats SET name = '裡寶牌'   WHERE name = '裏寶牌';

-- 2) 1/2/3 番役合併為 yaku_normal（順序仍照雀魂 UI，由 display_order 決定）
UPDATE stats SET category = 'yaku_normal'
  WHERE category IN ('yaku_1', 'yaku_2', 'yaku_3plus');

-- 3) 新增「流局滿貫」（雀魂 UI 列在寶牌之後、天和之前）
INSERT INTO stats (name, display_order, value_type, agg_method, category, scope) VALUES
  ('流局滿貫', 730, 'integer', 'sum', 'yaku_normal', 'merged_only')
ON CONFLICT (name) DO NOTHING;

-- 4) 重設 display_order 對應雀魂遊戲內順序
UPDATE stats SET display_order = 400 WHERE name = '門前清自摸和';
UPDATE stats SET display_order = 410 WHERE name = '立直';
UPDATE stats SET display_order = 420 WHERE name = '槍槓';
UPDATE stats SET display_order = 430 WHERE name = '嶺上開花';
UPDATE stats SET display_order = 440 WHERE name = '海底摸月';
UPDATE stats SET display_order = 450 WHERE name = '河底撈魚';
UPDATE stats SET display_order = 460 WHERE name = '役牌 白';
UPDATE stats SET display_order = 470 WHERE name = '役牌 發';
UPDATE stats SET display_order = 480 WHERE name = '役牌 中';
UPDATE stats SET display_order = 490 WHERE name = '役牌:門風牌';
UPDATE stats SET display_order = 500 WHERE name = '役牌:場風牌';
UPDATE stats SET display_order = 510 WHERE name = '斷么九';
UPDATE stats SET display_order = 520 WHERE name = '一盃口';
UPDATE stats SET display_order = 530 WHERE name = '平和';
UPDATE stats SET display_order = 540 WHERE name = '混全帶么九';
UPDATE stats SET display_order = 550 WHERE name = '一氣通貫';
UPDATE stats SET display_order = 560 WHERE name = '三色同順';
UPDATE stats SET display_order = 570 WHERE name = '兩立直';
UPDATE stats SET display_order = 580 WHERE name = '三色同刻';
UPDATE stats SET display_order = 590 WHERE name = '三槓子';
UPDATE stats SET display_order = 600 WHERE name = '對對和';
UPDATE stats SET display_order = 610 WHERE name = '三暗刻';
UPDATE stats SET display_order = 620 WHERE name = '小三元';
UPDATE stats SET display_order = 630 WHERE name = '混老頭';
UPDATE stats SET display_order = 640 WHERE name = '七對子';
UPDATE stats SET display_order = 650 WHERE name = '純全帶么九';
UPDATE stats SET display_order = 660 WHERE name = '混一色';
UPDATE stats SET display_order = 670 WHERE name = '二盃口';
UPDATE stats SET display_order = 680 WHERE name = '清一色';
UPDATE stats SET display_order = 690 WHERE name = '一發';
UPDATE stats SET display_order = 700 WHERE name = '寶牌';
UPDATE stats SET display_order = 710 WHERE name = '紅寶牌';
UPDATE stats SET display_order = 720 WHERE name = '裡寶牌';
UPDATE stats SET display_order = 730 WHERE name = '流局滿貫';
UPDATE stats SET display_order = 740 WHERE name = '天和';
UPDATE stats SET display_order = 750 WHERE name = '地和';
UPDATE stats SET display_order = 760 WHERE name = '大三元';
UPDATE stats SET display_order = 770 WHERE name = '四暗刻';
UPDATE stats SET display_order = 780 WHERE name = '字一色';
UPDATE stats SET display_order = 790 WHERE name = '綠一色';
UPDATE stats SET display_order = 800 WHERE name = '清老頭';
UPDATE stats SET display_order = 810 WHERE name = '國士無雙';
UPDATE stats SET display_order = 820 WHERE name = '小四喜';
UPDATE stats SET display_order = 830 WHERE name = '四槓子';
UPDATE stats SET display_order = 840 WHERE name = '九蓮寶燈';
UPDATE stats SET display_order = 850 WHERE name = '純正九蓮寶燈';
UPDATE stats SET display_order = 860 WHERE name = '四暗刻單騎';
UPDATE stats SET display_order = 870 WHERE name = '國士無雙十三面';
UPDATE stats SET display_order = 880 WHERE name = '大四喜';
