-- 第四期 推荐 (docs/design.zh.md §11): 下一款试试 samples LWIN wines by appellation or region with an
-- index seek (src/worker/recs.ts), so a place reads a few rows instead of all it holds.
CREATE INDEX lwin_appellation ON lwin(appellation, lwin);
CREATE INDEX lwin_region ON lwin(region, lwin);
