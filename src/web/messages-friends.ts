// 朋友动态 (Friends.tsx, src/worker/friends.ts) and 我 vs 专业 (Versus.tsx): kept apart from messages.ts, which spreads it in.

export const FRIEND_MESSAGES: Record<string, { tw: string; en: string }> = {
  朋友动态: { tw: "朋友動態", en: "Friends" },
  朋友的评价: { tw: "朋友的評價", en: "Friends' notes" },
  新: { tw: "新", en: "New" },
  "{n} 条新的": { tw: "{n} 則新的", en: "{n} new" },
  全部: { tw: "全部", en: "All" },
  更早的: { tw: "更早的", en: "Older" },
  "正在加载…": { tw: "載入中…", en: "Loading…" },
  "先评后看：交了你自己的评分或笔记后就能看到。": {
    tw: "先評後看：交了你自己的評分或筆記後就能看到。",
    en: "Score first: hand in your own score or note to see theirs.",
  },
  "这里是一起品鉴的朋友在共同的品鉴里记下的评价。他们单独记的酒和品酒地点不会出现在这里。": {
    tw: "這裡是一起品飲的朋友在共同的品飲裡記下的評價。他們單獨記的酒和品飲地點不會出現在這裡。",
    en: "Notes your friends wrote in tastings you share. Wines they log on their own, and where they tasted, never show here.",
  },
  "还没有朋友的动态。在品鉴里点「分享」，让同行的朋友扫码加入，一起记录。": {
    tw: "還沒有朋友的動態。在品飲裡點「分享」，讓同行的朋友掃碼加入，一起記錄。",
    en: "Nothing from friends yet. Tap Share in a tasting so friends can scan in and take notes with you.",
  },
  "我 vs 专业": { tw: "我 vs 專業", en: "Me vs the critics" },
  "酒评里提到 {n} 种香气，你也记下了 {k} 种。": {
    tw: "酒評裡提到 {n} 種香氣，你也記下了 {k} 種。",
    en: "The reviews mention {n} aromas; you noted {k} of them.",
  },
  "你还没记香气。酒评里提到了这些，拿起杯子闻闻看，找到了就点一下。": {
    tw: "你還沒記香氣。酒評裡提到了這些，拿起杯子聞聞看，找到了就點一下。",
    en: "You haven't noted any aromas yet. The reviews mention these: smell your glass and tap the ones you find.",
  },
  都闻到了: { tw: "都聞到了", en: "You both found" },
  "酒评里有，你没记的": { tw: "酒評裡有、你沒記的", en: "In the reviews, not in your notes" },
  "你记了{near}，都属于{family}，方向是对的。": {
    tw: "你記了{near}，都屬於{family}，方向是對的。",
    en: "You noted {near}: also {family}, so you were on the right track.",
  },
  找到了: { tw: "找到了", en: "Found it" },
  只有你闻到的: { tw: "只有你聞到的", en: "Only you found" },
  "没有对错：每个人的鼻子不一样，酒在杯里也会变。评论家写下的只是他们闻到的那几样。": {
    tw: "沒有對錯：每個人的鼻子不一樣，酒在杯裡也會變。評論家寫下的只是他們聞到的那幾樣。",
    en: "There's no right or wrong: every nose is different and wine changes in the glass. Critics only write down the few things they noticed.",
  },
};
