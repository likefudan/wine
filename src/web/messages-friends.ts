// 朋友动态 (Friends.tsx, src/worker/friends.ts): kept apart from messages.ts, which spreads it in.

export const FRIEND_MESSAGES: Record<string, { tw: string; en: string }> = {
  朋友动态: { tw: "朋友動態", en: "Friends" },
  朋友的评价: { tw: "朋友的評價", en: "Friends' notes" },
  新: { tw: "新", en: "New" },
  "{n} 条新的": { tw: "{n} 則新的", en: "{n} new" },
  全部: { tw: "全部", en: "All" },
  更早的: { tw: "更早的", en: "Older" },
  "正在加载…": { tw: "載入中…", en: "Loading…" },
  盲评中: { tw: "盲評中", en: "Blind" },
  "盲评中：交了你自己的评分或笔记后就能看到。": {
    tw: "盲評中：交了你自己的評分或筆記後就能看到。",
    en: "Blind tasting: hand in your own score or note to see theirs.",
  },
  "这里是一起品鉴的朋友在共同的品鉴里记下的评价。他们单独记的酒和品酒地点不会出现在这里。": {
    tw: "這裡是一起品飲的朋友在共同的品飲裡記下的評價。他們單獨記的酒和品飲地點不會出現在這裡。",
    en: "Notes your friends wrote in tastings you share. Wines they log on their own, and where they tasted, never show here.",
  },
  "还没有朋友的动态。在品鉴里点「分享」，让同行的朋友扫码加入，一起记录。": {
    tw: "還沒有朋友的動態。在品飲裡點「分享」，讓同行的朋友掃碼加入，一起記錄。",
    en: "Nothing from friends yet. Tap Share in a tasting so friends can scan in and take notes with you.",
  },
};
