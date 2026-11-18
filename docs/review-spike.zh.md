# 专业评价数据源试验（2026-11-18）

设计文档 3.2 要求第二期动工前，先用 20 款左右的酒测一下 Wine-Searcher 和 CellarTracker 能不能用程序读取。本文是试验记录，结论已写回 [design.zh.md](design.zh.md) 的 3.2 节。

## 怎么测的

- **酒**：20 款常见纳帕酒（Opus One、Caymus、Silver Oak、Cask 23、Insignia、Silverado、Hess Mount Veeder、Pine Ridge、Shafer Hillside Select、Duckhorn Merlot、Frog's Leap、Mondavi To Kalon Reserve、Heitz Martha's Vineyard、Montelena 霞多丽、Far Niente、Cakebread 霞多丽、Quintessa、Dominus、Spottswoode、Faust），加 2 款波尔多（Lynch-Bages 2016、Montrose 2015），共 22 款。
- **在哪跑**：GitHub Actions（`.github/workflows/review-spike.yml`，脚本 `scripts/review_spike.py`）。GitHub 的机器和 Cloudflare Worker 一样是数据中心 IP，比较接近正式站的处境。
- **四种读法**，每款酒都试：
  1. 直接请求 Wine-Searcher 的酒款页（`/find/<酒名>/<年份>`），浏览器 UA，每次请求间隔 6 秒。
  2. 直接请求 CellarTracker 的搜索页，命中后再读酒款页。
  3. Claude 联网检索（Azure Foundry 上的 `web_search_20250305`，最多 5 次搜索），Sonnet 5.5 和 Haiku 5.5 各跑一遍。
  4. Claude 网页读取（`web_fetch_20250910`），让 Anthropic 的抓取器去读上面两个网址。
- 另用结构化输出（JSON schema）在 4 款酒上重跑了一次联网检索，确认在 Foundry 上能和联网检索一起用。

## 结果

| 读法 | 命中 | 说明 |
| --- | --- | --- |
| 直连 Wine-Searcher | 0 / 22 | 每次都是 403，PerimeterX 的“按住验证”页 |
| 直连 CellarTracker | 0 / 22 | 每次都是 202，AWS WAF 的 JavaScript 质询页，拿不到搜索结果 |
| Claude 网页读取 | 0 / 44 | 两个站都返回 `url_not_accessible` |
| Claude 联网检索（Sonnet 5.5） | 21 / 22 有评论家分数 | 共 75 个分数；18 款拿到 CellarTracker 社区均分和条数；19 款拿到 Wine-Searcher 参考价；21 款找到 Wine-Searcher 链接，20 款找到 CellarTracker 链接 |
| Claude 联网检索（Haiku 5.5） | 21 / 22 有评论家分数 | 共 62 个分数，漏掉的评论家更多，有 4 个分数的来源网址不在搜索结果里，还会把 Wine-Searcher 的汇总分当成评论家分数 |

直连两个站都被反爬虫拦下，而且换 IP、模拟浏览器去绕过本身就违反两站条款，所以不考虑。联网检索之所以能拿到 Wine-Searcher 的价格和 CellarTracker 的社区均分，是因为搜索引擎的索引和摘要里有这些数字；模型没有直接访问这两个站。

**分数从哪来**：评论家分数大多来自零售商页面转引（wine.com、Zachys、WHWC、各酒庄的 accolades 页等），很少来自评论家网站本身（多数要付费订阅）。社区均分全部来自 CellarTracker，参考价全部来自 Wine-Searcher。

**准确性**：每个分数都附了原文摘录和来源网址。75 个分数的摘录里都有这个数字，来源网址也都在搜索结果里。人工抽查 Opus One 2019、Spottswoode 2019、Shafer Hillside 2018、Montrose 2015 四款，数字和零售商页面一致，但有三类问题：
- **同一刊物不止一个分数**：Wine Advocate 给 Spottswoode 2019 有 Lisa Perrotti-Brown 的 100 分和 Joe Czerwinski 的 98 分；Montrose 2015 的 Vinous 有 93 和 95（不同评论人）。
- **桶边分是区间**：Opus One 2019 的 Wine Advocate 是 97-99，有些零售商只写 99。第一轮自由文本输出写成 99，结构化重跑并要求“照原样写”后变成 97-99。
- **两次运行不完全一致**：Sonnet 和 Haiku 都给出的同一评论家分数有 43 对，39 对一致；Opus One 的 Jeb Dunnuck 两次分别是 97 和 98（原评是 96-98 区间）。

**速度和成本**（Sonnet 5.5，按 Foundry 标价 $2/$10 每百万 token、$10 每千次搜索）：中位 16 秒，最慢 36 秒；平均每款约 7.3 万输入 token、2,200 输出 token、3.8 次搜索，约 **$0.21 一款**。Haiku 5.5 约 $0.03 一款，速度差不多。按“每款酒每个年份全站只查一次”算，1,000 款约 $210。

## 每款酒的结果

缩写：JS = James Suckling，WA = Wine Advocate / Robert Parker，V = Vinous，WSp = Wine Spectator，JD = Jeb Dunnuck，WE = Wine Enthusiast，D = Decanter。分数列是 Sonnet 5.5 第一轮的输出，Haiku 列是它找到的评论家分数个数。

| 酒 | Wine-Searcher 直连 | CellarTracker 直连 | Sonnet 找到的评论家分数 | 社区均分（CT） | 参考价（WS） | Haiku 评论家分数数 | 用时 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Opus One  2019 | 403 拦截 | 202 质询 | JS99 WA99 V97 WSp95 JD97 | 93.1（59 条） | $461 | 5 | 12.9s |
| Caymus Vineyards Cabernet Sauvignon Napa Valley 2021 | 403 拦截 | 202 质询 | JS94 | 90（150 条） | $95 | 2 | 17.9s |
| Silver Oak Napa Valley Cabernet Sauvignon 2018 | 403 拦截 | 202 质询 | JS97 D95 | 92.6（31 条） | $185 | 2 | 10.8s |
| Stag's Leap Wine Cellars Cask 23 Cabernet Sauvignon 2019 | 403 拦截 | 202 质询 | JD99 V96 WSp95 JS95 WE95 WA96 | — | $300 | 5 | 12.8s |
| Joseph Phelps Insignia 2019 | 403 拦截 | 202 质询 | JS98 JD99 V96 WA96 WE94 WSp94 | 93.7（35 条） | $383 | 3 | 15.6s |
| Silverado Vineyards Estate Cabernet Sauvignon 2019 | 403 拦截 | 202 质询 | JS93 WE89 JD87 | 89.4（19 条） | $46 | 3 | 9.4s |
| The Hess Collection Mount Veeder Cabernet Sauvignon 2019 | 403 拦截 | 202 质询 | WE94 JS92 | 92（15 条） | — | 2 | 16.8s |
| Pine Ridge Stags Leap District Cabernet Sauvignon 2019 | 403 拦截 | 202 质询 | WE95 | — | $185 | 2 | 10.9s |
| Shafer Hillside Select Cabernet Sauvignon 2018 | 403 拦截 | 202 质询 | JD100 JS99 V98 WA98 WE97 WSp95 | 95.1（32 条） | $377 | 2 | 15.3s |
| Duckhorn Napa Valley Merlot 2020 | 403 拦截 | 202 质询 | JS93 WE90 WRO93 | 89.9（40 条） | $54 | 4 | 14.1s |
| Frog's Leap Napa Valley Cabernet Sauvignon 2019 | 403 拦截 | 202 质询 | 自由文本解析失败；结构化重跑：V94 | 90.8（39 条） | $75 | 1 | 15.0s |
| Robert Mondavi To Kalon Reserve Cabernet Sauvignon 2018 | 403 拦截 | 202 质询 | JD97+ JS95 WE95 WSp94 | — | $232 | 3 | 16.4s |
| Heitz Cellar Martha's Vineyard Cabernet Sauvignon 2016 | 403 拦截 | 202 质询 | WA96 WSp95 | 94.7（36 条） | $292 | 2 | 19.4s |
| Chateau Montelena Napa Valley Chardonnay 2020 | 403 拦截 | 202 质询 | WA93 | 91.0（50 条） | $77 | 1 | 12.4s |
| Far Niente Cabernet Sauvignon Oakville 2019 | 403 拦截 | 202 质询 | WE98 | 92.8（36 条） | $189 | 1 | 16.9s |
| Cakebread Cellars Napa Valley Chardonnay 2021 | 403 拦截 | 202 质询 | — | 89.6（26 条） | $48 | 0 | 7.4s |
| Quintessa  2019 | 403 拦截 | 202 质询 | WE100 JS99 JD97 D96 WA95 WSp93 | 94.9（60 条） | $256 | 1 | 20.0s |
| Dominus Estate Dominus 2019 | 403 拦截 | 202 质询 | JS98 JD96 V98 WA98 WSp96 | 96.3（34 条） | $348 | 5 | 16.6s |
| Spottswoode Estate Cabernet Sauvignon 2019 | 403 拦截 | 202 质询 | WA100 WA98 JD97 V96 JS96 D98 | 95（30 条） | $269 | 5 | 35.9s |
| Faust Napa Valley Cabernet Sauvignon 2020 | 403 拦截 | 202 质询 | JS93 | 91.3（33 条） | — | 1 | 10.3s |
| Chateau Lynch-Bages Pauillac 2016 | 403 拦截 | 202 质询 | WA97 WSp97 D96 JD95 WE95 JS97 V96 | 94.7（116 条） | $225 | 1 | 27.0s |
| Chateau Montrose Saint-Estephe 2015 | 403 拦截 | 202 质询 | JS98 WE96 D96 WA95 JD95 WSp92 V95 | 93.5（53 条） | $204 | 11 | 20.3s |
