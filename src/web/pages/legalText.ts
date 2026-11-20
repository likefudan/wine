import type { Lang } from "../../shared/model";

/**
 * The privacy policy and terms, written out whole in each language (as on the badminton site) rather
 * than looked up sentence by sentence in messages.ts: legal text reads better kept together. A string
 * is a paragraph, an array a bulleted list. {site} and {host} stand for the app's name and address,
 * so a rename or a new domain needs no edit here. Change all three languages together, and the date
 * with them. When a feature starts collecting, sharing or sending out something new, say so here.
 */
export interface LegalDoc {
  updated: string;
  sections: { h: string; body: (string | string[])[] }[];
}

/** The same address the badminton site's policy gives. */
const CONTACT = "likefudan@gmail.com";

export const PRIVACY: Record<Lang, LegalDoc> = {
  "zh-CN": {
    updated: "最后更新：2026 年 11 月 20 日",
    sections: [
      {
        h: "这个网站是谁的",
        body: [
          "{site}（{host}）是一个品酒日记：记下喝过的每一款酒、自己的评分和香气，管理酒窖，也可以和一起品酒的朋友共同评价。网站由个人开发和运营，不是公司，目前免费。运营者（见下面的「联系我们」）能接触到网站的全部数据，只用于维护网站。本政策说明网站收集哪些信息、拿来做什么、谁能看到、保存多久。",
        ],
      },
      {
        h: "我们收集的信息",
        body: [
          [
            "Google 登录：你的 Google 账号编号、邮箱、姓名和头像链接。详见下一节。",
            "个人资料：你可以另外填一个昵称、上传一张头像（在手机上裁成小方图后再上传），或者选择不用头像；还有你选的语言和记录深度。",
            "品酒记录：酒的信息（酒庄、酒名、年份、产区、葡萄品种等）、你的评分、外观、香气、口感、文字笔记、品酒日期，以及你拍的酒标照片。",
            "品酒地点（自愿）：只有你打开「记下品酒地点」并允许浏览器定位后，才会在你品一款酒时记下当时的位置（经纬度、精度，以及查到的地点名称和地址）。可以随时在「我」里关掉，也可以删掉某一条记录的地点。",
            "酒窖：你登记的存酒，例如数量、价格、存放位置和适饮期。",
            "一起品鉴：你创建或加入的品鉴、里面的酒、品鉴的地点，以及你在其中交出的评分和笔记。盲品里还有你的猜测。",
            "专业评价：你粘贴导入的评价文字，以及你对查到的评价提出的纠错。",
            "AI 用量：每次调用 AI 的时间、功能、所用模型和费用，记在你的账号下，用来控制每天的免费额度和网站的开销。",
            "技术信息：保持登录用的 Cookie（30 天，持续使用会自动续期）。为了没有信号时也能记录，你的记录会在你这部手机的浏览器里存一份；语言、外观等偏好也只存在浏览器里。托管网站的 Cloudflare 会短期保存运行日志（请求时间、地址和出错信息）。网站没有广告，不用第三方统计工具，也不跟踪你在其他网站上的活动。",
          ],
        ],
      },
      {
        h: "来自 Google 的信息",
        body: [
          "用 Google 登录时，网站只请求最基本的登录信息（openid、email、profile），拿到的是你的 Google 账号编号、邮箱、姓名和头像链接。网站读不到你的 Gmail 邮件、通讯录、日历、云端硬盘或其他任何 Google 数据。",
          [
            "账号编号和邮箱：用来确认是你、把记录存到你的账号下；网站运营者在成员列表里能看到你的邮箱，用于审核新用户。邮箱不会显示给其他用户。",
            "姓名和头像：在你自己的页面上显示；在你加入的品鉴和朋友动态里，一起品酒的人会看到你的名字和头像。你可以改用自己的昵称和头像，或者不用头像。",
          ],
          "这些信息不会出售，不会用于广告，不会发给 AI 模型，也不会用来训练任何 AI 模型；除了为运行本网站所必需（见「第三方服务」）之外，不会转给任何人。{site} 对从 Google API 取得的信息的使用和转移，遵守《Google API 服务用户数据政策》，包括其中的「有限使用」要求。",
          "删除账号时，这些信息会和你的其他数据一起删除。你也可以随时在 Google 账号的「第三方应用和服务」里撤销本网站的访问权限。",
        ],
      },
      {
        h: "这些信息用来做什么",
        body: [
          "只用于提供这个品酒日记：登录和识别你、保存和同步你的记录、让你和朋友一起品鉴、根据你自己的记录给出口味总结和推荐、提醒酒窖里该喝的酒、控制 AI 功能的用量，以及维护网站。我们不出售个人信息，也不用于广告。",
        ],
      },
      {
        h: "AI 和第三方服务",
        body: [
          "为了提供功能，下面这些内容会交给第三方处理。发给 AI 的内容里不包含你的姓名、邮箱或品酒地点。",
          [
            "Cloudflare：网站、数据库和照片都托管在 Cloudflare 上。",
            "Google 登录：见上一节。",
            "AI 模型（经微软 Azure AI Foundry 调用，主要是 Anthropic 的 Claude；如果你在设置里选了其他模型，则是那个模型）：读酒标时发送你拍的酒标照片；生成分享图上的品酒短评时发送这款酒的信息和你这次的品酒记录（包括你写的文字笔记）；查专业评价时只发送酒的名称和年份，由模型联网搜索公开的评价。",
            "Google 地图平台（Places 和 Geocoding）：输入酒庄或地点时，发送你输入的文字来联想地址；记下品酒地点或点「用当前位置」时，发送当时的经纬度来查附近的地点名称。这些请求由网站的服务器发出，不带你的账号信息。",
          ],
          "这些服务按各自的条款和隐私政策处理数据。",
        ],
      },
      {
        h: "谁能看到",
        body: [
          [
            "只有你自己：你单独记的酒、酒窖、品酒地点、口味总结和推荐、AI 用量。",
            "一起品鉴的人：在同一个品鉴里的成员能看到你的名字和头像、你加的酒，以及你在这个品鉴里交出的评分和笔记（开了「先评后看」时，对方要先交出自己的评价才看得到）。这些评价也会出现在他们的「朋友动态」里。你在品鉴之外单独记的内容，他们看不到。",
            "拿到链接或二维码的人：品鉴的创建者可以把品鉴设为公开，或分享它的二维码。打开链接的人不用登录就能看到这个品鉴和里面的酒；成员的评价要在揭晓之后（或没开「先评后看」时）才对他们显示。",
            "所有用户：你新添加到酒册里的酒（酒庄、酒名、年份、产区这些酒本身的信息）会进入大家共用的酒目录，不显示是谁添加的；你发起查找的专业评价结果也供所有人查看。",
            "分享图：只有你自己点了分享，图片才会发到你选择的地方。",
            "网站运营者：能看到成员列表（名字、邮箱、加入时间）和每个人的 AI 用量，维护网站时能接触到数据库里的数据。",
          ],
        ],
      },
      {
        h: "保存在哪里、保存多久",
        body: [
          "数据保存在 Cloudflare 位于美国的服务器上，传输全程加密（HTTPS）。只要账号还在，记录就一直保存。",
          "你可以随时在「我 → 通用」里导出自己的全部数据（CSV 或 JSON），也可以在同一页删除账号。删除账号会立刻永久删除你的笔记、酒窖、酒标照片、头像、你创建的品鉴和登录信息。为了不影响其他人，下面这些会以不带你名字的方式保留：你添加到共用酒目录里的酒、你发起查找的专业评价、你在别人的品鉴里加的酒，以及 AI 费用记录。数据库的备份最多再保留 30 天。",
        ],
      },
      {
        h: "年龄",
        body: [
          "本网站与酒有关，只面向已达到所在地法定饮酒年龄的成年人，不面向未成年人，也不会有意收集未成年人的信息。",
        ],
      },
      {
        h: "政策的变更",
        body: ["本政策更新时，会修改页面顶部的日期；有重要变化时，会在网站上提示。"],
      },
      {
        h: "联系我们",
        body: [`对本政策有疑问，或想查询、更正、删除你的信息，请联系网站运营者：${CONTACT}。`],
      },
    ],
  },
  "zh-TW": {
    updated: "最後更新：2026 年 11 月 20 日",
    sections: [
      {
        h: "這個網站是誰的",
        body: [
          "{site}（{host}）是一本品酒日記：記下喝過的每一款酒、自己的評分和香氣，管理酒窖，也可以和一起品酒的朋友共同評價。網站由個人開發和營運，不是公司，目前免費。營運者（見下面的「聯絡我們」）能接觸到網站的全部資料，只用於維護網站。本政策說明網站蒐集哪些資訊、拿來做什麼、誰能看到、保存多久。",
        ],
      },
      {
        h: "我們蒐集的資訊",
        body: [
          [
            "Google 登入：你的 Google 帳號編號、電子郵件、姓名和大頭貼連結。詳見下一節。",
            "個人資料：你可以另外填一個暱稱、上傳一張大頭貼（在手機上裁成小方圖後再上傳），或者選擇不用大頭貼；還有你選的語言和記錄深度。",
            "品飲記錄：酒的資訊（酒莊、酒名、年份、產區、葡萄品種等）、你的評分、外觀、香氣、口感、文字筆記、品飲日期，以及你拍的酒標照片。",
            "品飲地點（自願）：只有你開啟「記下品飲地點」並允許瀏覽器定位後，才會在你品一款酒時記下當時的位置（經緯度、精確度，以及查到的地點名稱和地址）。可以隨時在「我」裡關掉，也可以刪掉某一筆記錄的地點。",
            "酒窖：你登記的存酒，例如數量、價格、存放位置和適飲期。",
            "一起品飲：你建立或加入的品飲、裡面的酒、品飲的地點，以及你在其中交出的評分和筆記。盲品裡還有你的猜測。",
            "專業評價：你貼上匯入的評價文字，以及你對查到的評價提出的更正。",
            "AI 用量：每次呼叫 AI 的時間、功能、所用模型和費用，記在你的帳號下，用來控制每天的免費額度和網站的開銷。",
            "技術資訊：保持登入用的 Cookie（30 天，持續使用會自動延長）。為了沒有訊號時也能記錄，你的記錄會在你這支手機的瀏覽器裡存一份；語言、外觀等偏好也只存在瀏覽器裡。代管網站的 Cloudflare 會短期保存運作記錄（請求時間、位址和錯誤訊息）。網站沒有廣告，不用第三方統計工具，也不追蹤你在其他網站上的活動。",
          ],
        ],
      },
      {
        h: "來自 Google 的資訊",
        body: [
          "用 Google 登入時，網站只要求最基本的登入資訊（openid、email、profile），拿到的是你的 Google 帳號編號、電子郵件、姓名和大頭貼連結。網站讀不到你的 Gmail 郵件、聯絡人、日曆、雲端硬碟或其他任何 Google 資料。",
          [
            "帳號編號和電子郵件：用來確認是你、把記錄存到你的帳號下；網站營運者在成員清單裡能看到你的電子郵件，用於審核新使用者。電子郵件不會顯示給其他使用者。",
            "姓名和大頭貼：在你自己的頁面上顯示；在你加入的品飲和朋友動態裡，一起品酒的人會看到你的名字和大頭貼。你可以改用自己的暱稱和大頭貼，或者不用大頭貼。",
          ],
          "這些資訊不會出售，不會用於廣告，不會傳給 AI 模型，也不會用來訓練任何 AI 模型；除了為運作本網站所必需（見「第三方服務」）之外，不會轉給任何人。{site} 對從 Google API 取得的資訊的使用和轉移，遵守《Google API 服務使用者資料政策》，包括其中的「有限使用」規定。",
          "刪除帳號時，這些資訊會和你的其他資料一起刪除。你也可以隨時在 Google 帳戶的「第三方應用程式和服務」裡撤銷本網站的存取權。",
        ],
      },
      {
        h: "這些資訊用來做什麼",
        body: [
          "只用於提供這本品酒日記：登入和辨識你、保存和同步你的記錄、讓你和朋友一起品飲、根據你自己的記錄給出口味總結和推薦、提醒酒窖裡該喝的酒、控制 AI 功能的用量，以及維護網站。我們不出售個人資訊，也不用於廣告。",
        ],
      },
      {
        h: "AI 和第三方服務",
        body: [
          "為了提供功能，下面這些內容會交給第三方處理。傳給 AI 的內容裡不包含你的姓名、電子郵件或品飲地點。",
          [
            "Cloudflare：網站、資料庫和照片都代管在 Cloudflare 上。",
            "Google 登入：見上一節。",
            "AI 模型（經微軟 Azure AI Foundry 呼叫，主要是 Anthropic 的 Claude；如果你在設定裡選了其他模型，則是那個模型）：讀酒標時傳送你拍的酒標照片；產生分享圖上的品飲短評時傳送這款酒的資訊和你這次的品飲記錄（包括你寫的文字筆記）；查專業評價時只傳送酒的名稱和年份，由模型上網搜尋公開的評價。",
            "Google 地圖平台（Places 和 Geocoding）：輸入酒莊或地點時，傳送你輸入的文字來建議地址；記下品飲地點或點「用目前位置」時，傳送當時的經緯度來查附近的地點名稱。這些請求由網站的伺服器發出，不帶你的帳號資訊。",
          ],
          "這些服務依各自的條款和隱私權政策處理資料。",
        ],
      },
      {
        h: "誰能看到",
        body: [
          [
            "只有你自己：你單獨記的酒、酒窖、品飲地點、口味總結和推薦、AI 用量。",
            "一起品飲的人：在同一個品飲裡的成員能看到你的名字和大頭貼、你加的酒，以及你在這個品飲裡交出的評分和筆記（開了「先評後看」時，對方要先交出自己的評價才看得到）。這些評價也會出現在他們的「朋友動態」裡。你在品飲之外單獨記的內容，他們看不到。",
            "拿到連結或 QR code 的人：品飲的建立者可以把品飲設為公開，或分享它的 QR code。打開連結的人不用登入就能看到這個品飲和裡面的酒；成員的評價要在揭曉之後（或沒開「先評後看」時）才對他們顯示。",
            "所有使用者：你新加到酒冊裡的酒（酒莊、酒名、年份、產區這些酒本身的資訊）會進入大家共用的酒目錄，不顯示是誰加的；你發起查找的專業評價結果也供所有人查看。",
            "分享圖：只有你自己點了分享，圖片才會傳到你選擇的地方。",
            "網站營運者：能看到成員清單（名字、電子郵件、加入時間）和每個人的 AI 用量，維護網站時能接觸到資料庫裡的資料。",
          ],
        ],
      },
      {
        h: "保存在哪裡、保存多久",
        body: [
          "資料保存在 Cloudflare 位於美國的伺服器上，傳輸全程加密（HTTPS）。只要帳號還在，記錄就一直保存。",
          "你可以隨時在「我 → 一般」裡匯出自己的全部資料（CSV 或 JSON），也可以在同一頁刪除帳號。刪除帳號會立刻永久刪除你的筆記、酒窖、酒標照片、大頭貼、你建立的品飲和登入資訊。為了不影響其他人，下面這些會以不帶你名字的方式保留：你加到共用酒目錄裡的酒、你發起查找的專業評價、你在別人的品飲裡加的酒，以及 AI 費用記錄。資料庫的備份最多再保留 30 天。",
        ],
      },
      {
        h: "年齡",
        body: [
          "本網站與酒有關，只面向已達到所在地法定飲酒年齡的成年人，不面向未成年人，也不會有意蒐集未成年人的資訊。",
        ],
      },
      {
        h: "政策的變更",
        body: ["本政策更新時，會修改頁面頂端的日期；有重要變化時，會在網站上提示。"],
      },
      {
        h: "聯絡我們",
        body: [`對本政策有疑問，或想查詢、更正、刪除你的資訊，請聯絡網站營運者：${CONTACT}。`],
      },
    ],
  },
  en: {
    updated: "Last updated: November 20, 2026",
    sections: [
      {
        h: "Who runs this site",
        body: [
          '{site} ({host}) is a wine tasting journal: you record each wine you taste with your own score and aromas, keep track of your cellar, and can rate wines together with the friends you taste with. It is built and run by an individual, not a company, and is currently free. The operator (see "Contact" below) can access all of the site\'s data and uses it only to keep the site running. This policy explains what the site collects, what it is used for, who can see it, and how long it is kept.',
        ],
      },
      {
        h: "Information we collect",
        body: [
          [
            "Google sign-in: your Google account ID, email address, name and profile picture link. See the next section.",
            "Profile: you can add a nickname of your own and upload a photo (cropped to a small square on your phone before it is uploaded), or choose no picture; also the language and note depth you pick.",
            "Tasting notes: the wine's details (producer, name, vintage, region, grapes and so on), your score, appearance, aromas, palate, written notes, the date, and the label photos you take.",
            'Tasting location (optional): only if you turn on "Save tasting location" and allow your browser to share it, the site notes where you were when you tasted a wine (coordinates, accuracy, and the place name and address it looked up). You can turn this off any time under Me, or remove the location from a single note.',
            "Cellar: the bottles you record, such as quantity, price, where they are kept and their drinking window.",
            "Shared tastings: the tastings you create or join, their wines and place, and the scores and notes you hand in there. In blind tastings, also your guesses.",
            "Pro reviews: review text you paste in, and corrections you report on reviews the site found.",
            "AI usage: the time, feature, model and cost of each AI call, kept under your account to enforce the free daily allowance and manage the site's costs.",
            "Technical information: a cookie that keeps you signed in (30 days, renewed while you keep using the site). So that you can take notes with no signal, a copy of your notes is kept in your phone's browser; preferences such as language and appearance also stay in your browser. Cloudflare, which hosts the site, keeps short-term operational logs (request time, address and errors). The site has no ads and no third-party analytics, and does not track you across other sites.",
          ],
        ],
      },
      {
        h: "Information from Google",
        body: [
          "When you sign in with Google, the site asks only for basic sign-in information (the openid, email and profile scopes) and receives your Google account ID, email address, name and profile picture link. It cannot read your Gmail, contacts, calendar, Drive or any other Google data.",
          [
            "Account ID and email address: used to recognize you and keep your notes under your account. The site operator sees your email address in the member list, to review new sign-ups. It is not shown to other users.",
            "Name and profile picture: shown on your own pages; in tastings you join and in the friends feed, the people you taste with see your name and picture. You can use a nickname and photo of your own instead, or no picture.",
          ],
          '{site} does not sell this information, does not use it for advertising, does not send it to AI models, and does not use it to train any AI model. It is not transferred to anyone except as needed to run the site (see "AI and third-party services"). {site}\'s use and transfer of information received from Google APIs adheres to the Google API Services User Data Policy, including the Limited Use requirements.',
          'When you delete your account, this information is deleted with the rest of your data. You can also revoke the site\'s access at any time under "Third-party apps & services" in your Google Account.',
        ],
      },
      {
        h: "How it is used",
        body: [
          "Only to provide this tasting journal: signing you in and recognizing you, saving and syncing your notes, letting you taste together with friends, summarizing your taste and suggesting wines from your own notes, reminding you of cellar bottles that are ready, limiting use of the AI features, and keeping the site running. We do not sell personal information or use it for advertising.",
        ],
      },
      {
        h: "AI and third-party services",
        body: [
          "To provide its features, the site passes the following to third parties. Nothing sent to an AI model includes your name, email address or tasting location.",
          [
            "Cloudflare: hosts the site, its database and the photos.",
            "Google sign-in: see the previous section.",
            "AI models (called through Microsoft Azure AI Foundry; mainly Anthropic's Claude, or another model if you pick one in settings): to read a label, the label photo you take; to write the tasting note on a share card, the wine's details and your tasting note for it (including what you wrote); to look up pro reviews, only the wine's name and vintage, which the model uses to search the web for published reviews.",
            'Google Maps Platform (Places and Geocoding): when you type a winery or place, the text you type, to suggest addresses; when a tasting location is saved or you tap "Use current location", the coordinates at that moment, to find nearby place names. These requests are made by the site\'s server and carry no account information.',
          ],
          "These services handle data under their own terms and privacy policies.",
        ],
      },
      {
        h: "Who can see it",
        body: [
          [
            "Only you: wines you note on your own, your cellar, tasting locations, your taste summary and suggestions, and your AI usage.",
            'People you taste with: members of the same tasting see your name and picture, the wines you add, and the scores and notes you hand in within that tasting (with "Rate first, then compare" on, only after they hand in their own). These notes also appear in their friends feed. They cannot see anything you note outside the tasting.',
            "Anyone with the link or QR code: a tasting's host can make it public or share its QR code. People who open the link can see the tasting and its wines without signing in; members' notes are shown to them only after the reveal (or when \"Rate first, then compare\" is off).",
            "All users: a wine you add that is new to the site (its producer, name, vintage, region and other facts about the wine itself) joins the shared wine catalogue, without showing who added it. The results of a pro review lookup you start are also available to everyone.",
            "Share cards: an image leaves the site only when you choose to share it, to wherever you send it.",
            "The site operator: sees the member list (name, email address, sign-up date) and each person's AI usage, and can access the data in the database when maintaining the site.",
          ],
        ],
      },
      {
        h: "Where and how long it is kept",
        body: [
          "Data is stored on Cloudflare's servers in the United States and is encrypted in transit (HTTPS). Your notes are kept for as long as you have an account.",
          "You can export all of your data (CSV or JSON) at any time under Me → General, and delete your account on the same page. Deleting your account immediately and permanently removes your notes, cellar, label photos, profile picture, the tastings you created and your sign-in details. So that other people are not affected, the following stay without your name: wines you added to the shared catalogue, pro review lookups you started, wines you added to other people's tastings, and AI cost records. Database backups are kept for up to 30 more days.",
        ],
      },
      {
        h: "Age",
        body: [
          "This site is about wine and is meant only for adults of legal drinking age where they live. It is not directed at minors and does not knowingly collect information from them.",
        ],
      },
      {
        h: "Changes to this policy",
        body: [
          "When this policy changes, the date at the top changes too; important changes are also announced on the site.",
        ],
      },
      {
        h: "Contact",
        body: [
          `For questions about this policy, or to ask about, correct or delete your information, contact the site operator: ${CONTACT}.`,
        ],
      },
    ],
  },
};

export const TERMS: Record<Lang, LegalDoc> = {
  "zh-CN": {
    updated: "最后更新：2026 年 11 月 20 日",
    sections: [
      {
        h: "服务是什么",
        body: [
          "{site}（{host}）是一个品酒日记，帮你记录喝过的酒、管理酒窖、和朋友一起品鉴。网站由个人免费提供。使用本网站，即表示你同意这些条款和《隐私政策》。",
        ],
      },
      {
        h: "谁可以使用",
        body: [
          "你必须已达到所在国家或地区的法定饮酒年龄。本网站只是记录工具，不卖酒，也不鼓励过量饮酒。请理性饮酒，酒后不要开车。网站上的内容不是健康或医疗建议。",
        ],
      },
      {
        h: "你的账号",
        body: [
          [
            "用 Google 账号登录，一人一个账号。请保管好你的 Google 账号：能登录它的人就能看到和修改你的记录。",
            "新账号有时需要等运营者审核；审核前可以正常记录，但读酒标、地点联想等有成本的功能暂时不能用。",
            "AI 功能（读酒标、品酒短评、专业评价查找）每天有次数上限，上限可能调整。",
            "不要冒用他人身份、用程序批量抓取或调用网站、绕过用量限制，或干扰网站运行。违反这些条款的账号可能被停用或删除。",
          ],
        ],
      },
      {
        h: "你的内容",
        body: [
          [
            "你的笔记、评分和照片归你所有。你授权本网站保存它们，并按你的选择显示给和你一起品鉴的人，仅为提供本服务。",
            "你加到品鉴里交出的评价，同一个品鉴的成员能看到；公开的品鉴，拿到链接的人也能看到。分享前请想好。",
            "不要上传违法的内容、侵犯他人权利的内容，或含有他人隐私的照片。",
            "你新添加的酒的基本信息会进入大家共用的酒目录，在你删除账号后仍会保留（不带你的名字）。",
            "你可以随时导出自己的数据或删除账号，见《隐私政策》。",
          ],
        ],
      },
      {
        h: "AI 内容和专业评价",
        body: [
          [
            "读酒标、品酒短评、口味总结和推荐由 AI 或程序自动生成，可能出错。酒标读出的内容请在保存前核对。",
            "专业评价是 AI 联网查到的公开评分和摘要，附有来源链接，可能不完整或不准确；评分和评语的权利属于各自的发布者，请以原文为准。",
            "推荐、适饮期提醒和价格信息仅供参考，不构成购买或投资建议。",
          ],
        ],
      },
      {
        h: "按现状提供",
        body: [
          "网站免费提供，可能有错误，也可能暂时无法访问。运营者会尽力保护你的数据，但不保证数据永不丢失，建议定期导出备份。运营者可以调整功能、设定用量限制，或停止提供服务；停止服务前会尽量提前在网站上通知，让你有时间导出数据。在法律允许的范围内，运营者不对使用本网站造成的间接损失负责。",
        ],
      },
      {
        h: "条款的变更",
        body: ["条款更新时，会修改页面顶部的日期。更新后继续使用网站，即表示你接受新的条款。"],
      },
      {
        h: "联系我们",
        body: [`对这些条款有疑问，请联系网站运营者：${CONTACT}。`],
      },
    ],
  },
  "zh-TW": {
    updated: "最後更新：2026 年 11 月 20 日",
    sections: [
      {
        h: "服務是什麼",
        body: [
          "{site}（{host}）是一本品酒日記，幫你記錄喝過的酒、管理酒窖、和朋友一起品飲。網站由個人免費提供。使用本網站，即表示你同意這些條款和《隱私權政策》。",
        ],
      },
      {
        h: "誰可以使用",
        body: [
          "你必須已達到所在國家或地區的法定飲酒年齡。本網站只是記錄工具，不賣酒，也不鼓勵過量飲酒。請理性飲酒，喝酒不開車。網站上的內容不是健康或醫療建議。",
        ],
      },
      {
        h: "你的帳號",
        body: [
          [
            "用 Google 帳號登入，一人一個帳號。請保管好你的 Google 帳號：能登入它的人就能看到和修改你的記錄。",
            "新帳號有時需要等營運者審核；審核前可以正常記錄，但讀酒標、地點建議等有成本的功能暫時不能用。",
            "AI 功能（讀酒標、品飲短評、專業評價查找）每天有次數上限，上限可能調整。",
            "不要冒用他人身分、用程式大量擷取或呼叫網站、繞過用量限制，或干擾網站運作。違反這些條款的帳號可能被停用或刪除。",
          ],
        ],
      },
      {
        h: "你的內容",
        body: [
          [
            "你的筆記、評分和照片歸你所有。你授權本網站保存它們，並依你的選擇顯示給和你一起品飲的人，僅為提供本服務。",
            "你在品飲裡交出的評價，同一個品飲的成員能看到；公開的品飲，拿到連結的人也能看到。分享前請想好。",
            "不要上傳違法的內容、侵害他人權利的內容，或含有他人隱私的照片。",
            "你新加的酒的基本資訊會進入大家共用的酒目錄，在你刪除帳號後仍會保留（不帶你的名字）。",
            "你可以隨時匯出自己的資料或刪除帳號，見《隱私權政策》。",
          ],
        ],
      },
      {
        h: "AI 內容和專業評價",
        body: [
          [
            "讀酒標、品飲短評、口味總結和推薦由 AI 或程式自動產生，可能出錯。酒標讀出的內容請在儲存前核對。",
            "專業評價是 AI 上網查到的公開評分和摘要，附有來源連結，可能不完整或不準確；評分和評語的權利屬於各自的發布者，請以原文為準。",
            "推薦、適飲期提醒和價格資訊僅供參考，不構成購買或投資建議。",
          ],
        ],
      },
      {
        h: "依現狀提供",
        body: [
          "網站免費提供，可能有錯誤，也可能暫時無法使用。營運者會盡力保護你的資料，但不保證資料永不遺失，建議定期匯出備份。營運者可以調整功能、設定用量限制，或停止提供服務；停止服務前會盡量提前在網站上通知，讓你有時間匯出資料。在法律允許的範圍內，營運者不對使用本網站造成的間接損失負責。",
        ],
      },
      {
        h: "條款的變更",
        body: ["條款更新時，會修改頁面頂端的日期。更新後繼續使用網站，即表示你接受新的條款。"],
      },
      {
        h: "聯絡我們",
        body: [`對這些條款有疑問，請聯絡網站營運者：${CONTACT}。`],
      },
    ],
  },
  en: {
    updated: "Last updated: November 20, 2026",
    sections: [
      {
        h: "What the service is",
        body: [
          "{site} ({host}) is a wine tasting journal that helps you record the wines you taste, keep track of your cellar and taste together with friends. It is provided for free by an individual. By using the site you agree to these terms and to the Privacy Policy.",
        ],
      },
      {
        h: "Who may use it",
        body: [
          "You must be of legal drinking age in the country or region where you live. The site is only a tool for keeping notes: it does not sell alcohol or encourage drinking to excess. Please drink responsibly and never drink and drive. Nothing on the site is health or medical advice.",
        ],
      },
      {
        h: "Your account",
        body: [
          [
            "You sign in with a Google account, one account per person. Keep that Google account safe: anyone who can sign in to it can see and change your notes.",
            "A new account sometimes waits for the operator's approval. Until then you can take notes as usual, but features that cost money to run, such as label reading and place lookups, are not available.",
            "The AI features (label reading, share-card notes, pro review lookups) have daily limits, which may change.",
            "Don't pretend to be someone else, scrape or call the site in bulk with programs, work around usage limits, or interfere with the site. Accounts that break these terms may be disabled or deleted.",
          ],
        ],
      },
      {
        h: "Your content",
        body: [
          [
            "Your notes, scores and photos are yours. You allow the site to store them and to show them to the people you taste with, as you choose, only to provide the service.",
            "Notes you hand in within a tasting can be seen by that tasting's members, and for a public tasting by anyone with the link. Think before you share.",
            "Don't upload anything unlawful, anything that infringes other people's rights, or photos that reveal other people's private information.",
            "The basic facts of a wine you add join the shared wine catalogue and stay there (without your name) after you delete your account.",
            "You can export your data or delete your account at any time; see the Privacy Policy.",
          ],
        ],
      },
      {
        h: "AI content and pro reviews",
        body: [
          [
            "Label readings, share-card notes, taste summaries and suggestions are generated automatically by AI or by the site's code and can be wrong. Check what was read from a label before saving it.",
            "Pro reviews are published scores and summaries that an AI found by searching the web, shown with links to their sources. They may be incomplete or inaccurate; the scores and reviews belong to their publishers, and the original is what counts.",
            "Suggestions, drinking-window reminders and prices are for reference only and are not buying or investment advice.",
          ],
        ],
      },
      {
        h: "Provided as is",
        body: [
          "The site is free and may have mistakes or be unavailable for a while. The operator does their best to protect your data but cannot promise it will never be lost; exporting a backup now and then is a good idea. The operator may change features, set usage limits, or stop providing the service, and will try to give notice on the site beforehand so you have time to export your data. To the extent the law allows, the operator is not liable for indirect losses from using the site.",
        ],
      },
      {
        h: "Changes to these terms",
        body: [
          "When these terms change, the date at the top changes too. Using the site after an update means you accept the new terms.",
        ],
      },
      {
        h: "Contact",
        body: [`For questions about these terms, contact the site operator: ${CONTACT}.`],
      },
    ],
  },
};
