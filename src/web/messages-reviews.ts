// 专业评价 (Reviews.tsx, src/worker/reviews.ts): kept apart from messages.ts, which spreads it in.

export const REVIEW_MESSAGES: Record<string, { tw: string; en: string }> = {
  专业评价: { tw: "專業評價", en: "Critic reviews" },
  "先记下你自己的感受，再看评论家怎么说。这样记下的才是你自己的味觉。": {
    tw: "先記下你自己的感受，再看評論家怎麼說。這樣記下的才是你自己的味覺。",
    en: "Note your own impressions first, then see what the critics say. That way your notes stay yours.",
  },
  现在就看: { tw: "現在就看", en: "Show now" },
  "加载中…": { tw: "載入中…", en: "Loading…" },
  "正在联网查找专业评价，一般 15 到 40 秒…": {
    tw: "正在上網搜尋專業評價，通常 15 到 40 秒…",
    en: "Searching the web for reviews, usually 15–40 seconds…",
  },
  "{date} 由 AI 联网查到，分数照来源原样显示": {
    tw: "{date} 由 AI 上網查到，分數照來源原樣顯示",
    en: "Found by AI web search on {date}; scores shown exactly as their sources print them",
  },
  报告错误: { tw: "回報錯誤", en: "Report a mistake" },
  重新查: { tw: "重新查", en: "Look up again" },
  "这次没能查到，可能是网络或 AI 暂时出错。": {
    tw: "這次沒能查到，可能是網路或 AI 暫時出錯。",
    en: "The lookup didn't work this time; the network or the AI may have hiccupped.",
  },
  再查一次: { tw: "再查一次", en: "Try again" },
  "过一会儿可以再试，或者先用自己的 AI 查。": {
    tw: "過一會兒可以再試，或者先用自己的 AI 查。",
    en: "Try again in a little while, or ask your own AI meanwhile.",
  },
  查专业评价: { tw: "查專業評價", en: "Look up critic reviews" },
  "AI 联网查评论家分数、社区均分和参考价，约 20 秒；查过一次，大家都能直接看。今天还能查 {n} 款。": {
    tw: "AI 上網查評論家分數、社群平均分和參考價，約 20 秒；查過一次，大家都能直接看。今天還能查 {n} 款。",
    en: "AI searches the web for critic scores, the community average and a reference price (about 20 s). Once looked up, everyone sees it. Lookups left today: {n}.",
  },
  "今天的查询次数用完了，明天再查，或者先用自己的 AI 查。": {
    tw: "今天的查詢次數用完了，明天再查，或者先用自己的 AI 查。",
    en: "You've used today's lookups. Try tomorrow, or ask your own AI meanwhile.",
  },
  "网站现在查不了专业评价，可以先用自己的 AI 查。": {
    tw: "網站現在查不了專業評價，可以先用自己的 AI 查。",
    en: "The site can't look up reviews right now. You can ask your own AI instead.",
  },
  "用户导入，未核实 · 只有你看得到": {
    tw: "使用者匯入，未核實 · 只有你看得到",
    en: "Imported by you, unverified · only you can see it",
  },
  "用户导入，未核实": { tw: "使用者匯入，未核實", en: "Imported, unverified" },
  重新导入: { tw: "重新匯入", en: "Import again" },
  "用自己的 AI 查": { tw: "用自己的 AI 查", en: "Ask your own AI" },
  "经 {site} 转引": { tw: "經 {site} 轉引", en: "via {site}" },
  "没找到评论家分数。": { tw: "沒找到評論家分數。", en: "No critic scores found." },
  社区均分: { tw: "社群平均分", en: "Community avg." },
  "{n} 条笔记": { tw: "{n} 筆筆記", en: "{n} notes" },
  未找到: { tw: "未找到", en: "Not found" },
  参考价: { tw: "參考價", en: "Avg. price" },
  适饮期: { tw: "適飲期", en: "Drink window" },
  酒评里提到的香气: { tw: "酒評裡提到的香氣", en: "Aromas the reviews mention" },
  "复制下面的提示词，粘贴到你常用的 AI（ChatGPT、Claude、豆包等，要能联网搜索），再把它的回答整段粘贴回来。导入的结果只有你看得到，标为“未核实”。":
    {
      tw: "複製下面的提示詞，貼到你常用的 AI（ChatGPT、Claude、Gemini 等，要能上網搜尋），再把它的回答整段貼回來。匯入的結果只有你看得到，標為「未核實」。",
      en: "Copy the prompt below into an AI you use (ChatGPT, Claude, Gemini… one that can search the web), then paste its whole answer back here. What you import is visible only to you and marked unverified.",
    },
  复制提示词: { tw: "複製提示詞", en: "Copy prompt" },
  "已复制提示词 ✓": { tw: "已複製提示詞 ✓", en: "Prompt copied ✓" },
  "没能自动复制，请长按下面的文字全选复制。": {
    tw: "沒能自動複製，請長按下面的文字全選複製。",
    en: "Couldn't copy automatically. Press and hold the text below to select and copy it.",
  },
  "AI 的回答": { tw: "AI 的回答", en: "The AI's answer" },
  "把 AI 的整段回答粘贴到这里": { tw: "把 AI 的整段回答貼到這裡", en: "Paste the AI's whole answer here" },
  "导入中…": { tw: "匯入中…", en: "Importing…" },
  导入: { tw: "匯入", en: "Import" },
  "哪里不对？": { tw: "哪裡不對？", en: "What's wrong?" },
  "例如：Wine Advocate 应该是 96 分": { tw: "例如：Wine Advocate 應該是 96 分", en: "e.g. Wine Advocate should be 96" },
  发送: { tw: "送出", en: "Send" },
  "收到了，谢谢！站长会核对。": { tw: "收到了，謝謝！站長會核對。", en: "Got it, thanks! The site owner will check." },
  "没有网络，专业评价要联网才能查": {
    tw: "沒有網路，專業評價要連上網路才能查",
    en: "You're offline; looking up reviews needs a connection",
  },
  // Server messages (src/worker/reviews.ts)
  专业评价查询还没有开通: { tw: "專業評價查詢還沒有開通", en: "Review lookups aren't set up yet" },
  "本月的专业评价查询额度用完了，可以先用自己的 AI 查": {
    tw: "本月的專業評價查詢額度用完了，可以先用自己的 AI 查",
    en: "This month's review lookups are used up. You can ask your own AI instead.",
  },
  "今天的专业评价查询次数用完了，可以先用自己的 AI 查": {
    tw: "今天的專業評價查詢次數用完了，可以先用自己的 AI 查",
    en: "You've used today's review lookups. You can ask your own AI instead.",
  },
  "请粘贴 AI 的回答": { tw: "請貼上 AI 的回答", en: "Please paste the AI's answer" },
  "没找到结果段落，请把 AI 回答的最后一段（含 === WINE-JOURNAL === 那几行）完整粘贴进来": {
    tw: "沒找到結果段落，請把 AI 回答的最後一段（含 === WINE-JOURNAL === 那幾行）完整貼進來",
    en: "Couldn't find the result block. Paste the end of the AI's answer, including the === WINE-JOURNAL === lines.",
  },
  "今天报告得太多了，明天再试": { tw: "今天回報太多次了，明天再試", en: "Too many reports today; try tomorrow" },
};
