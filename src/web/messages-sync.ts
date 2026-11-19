/** Texts for keeping unsent notes safe (session expiry, changes the server refused). */
export const SYNC_MESSAGES: Record<string, { tw: string; en: string }> = {
  查看: { tw: "查看", en: "View" },
  没能保存的修改: { tw: "沒能儲存的修改", en: "Changes not saved" },
  "有 {n} 条修改云端没有收下，还留在这部手机上：{why}": {
    tw: "有 {n} 筆修改雲端沒有收下，還留在這支手機上：{why}",
    en: "{n} changes were not accepted and are still on this phone: {why}",
  },
  "有 {n} 条修改没能保存，见下方": {
    tw: "有 {n} 筆修改沒能儲存，見下方",
    en: "{n} changes couldn't be saved, see below",
  },
  再试一次: { tw: "再試一次", en: "Try again" },
  放弃这些修改: { tw: "放棄這些修改", en: "Discard these changes" },
  "放弃后，这些修改会从手机上删掉，以云端为准。确定放弃？": {
    tw: "放棄後，這些修改會從手機上刪掉，以雲端為準。確定放棄？",
    en: "These changes will be removed from this phone and the cloud copy kept. Discard them?",
  },
  "这部手机上还有 {n} 条记录没上传。登录过期了，重新登录后会自动上传。": {
    tw: "這支手機上還有 {n} 筆紀錄沒上傳。登入已過期，重新登入後會自動上傳。",
    en: "{n} changes on this phone haven't been uploaded yet. Your sign-in expired; sign in again and they'll upload automatically.",
  },
  品鉴者: { tw: "品飲者", en: "Taster" },
  删除账号和全部数据: { tw: "刪除帳號和全部資料", en: "Delete my account and all data" },
  "删除后，你的所有笔记、酒窖、酒标照片和你创建的品鉴都会永久删除，无法恢复。建议先在上面导出一份。确定删除？": {
    tw: "刪除後，你的所有筆記、酒窖、酒標照片和你建立的品飲都會永久刪除，無法復原。建議先在上面匯出一份。確定刪除？",
    en: "This permanently deletes all your notes, cellar, label photos and the tastings you created. It can't be undone. Consider exporting first. Delete?",
  },
  "最后确认：真的永久删除这个账号？": {
    tw: "最後確認：真的永久刪除這個帳號？",
    en: "Last check: permanently delete this account?",
  },
  "没有网络，请联网后再删除": {
    tw: "沒有網路，請連上網路後再刪除",
    en: "No connection. Please delete when you're online.",
  },
  请确认删除: { tw: "請確認刪除", en: "Please confirm the deletion" },
};
