// 昵称和头像 (Profile.tsx, src/worker/profile.ts): kept apart from messages.ts, which spreads it in.

export const PROFILE_MESSAGES: Record<string, { tw: string; en: string }> = {
  编辑资料: { tw: "編輯個人資料", en: "Edit profile" },
  编辑: { tw: "編輯", en: "Edit" },
  头像: { tw: "大頭貼", en: "Photo" },
  昵称: { tw: "暱稱", en: "Display name" },
  "保存中…": { tw: "儲存中…", en: "Saving…" },
  缩放: { tw: "縮放", en: "Zoom" },
  "没有网络，请稍后再试": { tw: "沒有網路，請稍後再試", en: "No connection. Please try again later." },
  "用的是你上传的照片。": { tw: "目前用的是你上傳的照片。", en: "Using the photo you uploaded." },
  "现在不显示头像。": { tw: "目前不顯示大頭貼。", en: "No photo is shown." },
  "现在用的是 Google 账号的头像。": {
    tw: "目前用的是 Google 帳號的大頭貼。",
    en: "Using your Google account's photo.",
  },
  "还没有头像。": { tw: "還沒有大頭貼。", en: "No photo yet." },
  换一张照片: { tw: "換一張照片", en: "Change photo" },
  上传照片: { tw: "上傳照片", en: "Upload photo" },
  "用 Google 头像": { tw: "用 Google 大頭貼", en: "Use Google photo" },
  不用头像: { tw: "不用大頭貼", en: "No photo" },
  "这张照片打不开，请换一张": {
    tw: "這張照片打不開，請換一張",
    en: "This photo can't be opened. Please pick another.",
  },
  "拖动、双指缩放，把脸放进圆圈里。": {
    tw: "拖曳、雙指縮放，把臉放進圓圈裡。",
    en: "Drag and pinch to fit your face in the circle.",
  },
  "昵称和头像会显示在一起品鉴的朋友那里、朋友动态和分享图上。": {
    tw: "暱稱和大頭貼會顯示給一起品飲的朋友，也會出現在朋友動態和分享圖上。",
    en: "Friends you taste with see your display name and photo, in Friends and on share images too.",
  },
  "留空就用 Google 账号的名字（{name}）。": {
    tw: "留白就用 Google 帳號的名字（{name}）。",
    en: "Leave it empty to use your Google name ({name}).",
  },
  "留空就用邮箱的前半段。": {
    tw: "留白就用電子郵件 @ 前面的部分。",
    en: "Leave it empty to use the first part of your email.",
  },
  "Google 名字：{name}": { tw: "Google 名字：{name}", en: "Google name: {name}" },
  // From the server and src/shared/model.ts checkNickname().
  请填写昵称: { tw: "請填寫暱稱", en: "Please enter a display name" },
  "昵称最多 20 个字": { tw: "暱稱最多 20 個字", en: "A display name can be at most 20 characters" },
  "昵称只能用文字、数字、空格和 . - _ ' ( ) ·": {
    tw: "暱稱只能用文字、數字、空格和 . - _ ' ( ) ·",
    en: "Use letters, digits, spaces and . - _ ' ( ) · only",
  },
  昵称要以文字或数字开头: { tw: "暱稱要以文字或數字開頭", en: "Start with a letter or a digit" },
  昵称里不要连着打空格: { tw: "暱稱裡不要連續打空格", en: "No double spaces, please" },
  请选择一张照片: { tw: "請選擇一張照片", en: "Please pick a photo" },
  "照片格式不对，请换一张": {
    tw: "照片格式不對，請換一張",
    en: "That photo's format won't work. Please pick another.",
  },
  "照片太大了，请换一张": { tw: "照片太大了，請換一張", en: "That photo is too large. Please pick another." },
  请选择头像: { tw: "請選擇大頭貼", en: "Please choose a photo option" },
  找不到这张照片: { tw: "找不到這張照片", en: "Photo not found" },
};
