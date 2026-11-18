import type { Depth } from "../shared/model";
import { tk } from "./i18n";

/** The four ways to record a wine, with what each is for (docs/design.zh.md §3.4). */
export const DEPTH_INFO: Record<Depth, { name: string; who: string; time: string }> = {
  quick: { name: tk("快记"), who: tk("打个分、点几个香气、写一句话"), time: tk("10 秒") },
  beginner: { name: tk("入门"), who: tk("第一次认真品酒：大白话提问，边喝边学"), time: tk("约 1 分钟") },
  standard: { name: tk("进阶"), who: tk("喝过一些、想建立体系：按 WSET 四步走"), time: tk("2–3 分钟") },
  expert: { name: tk("专业"), who: tk("老手：全部字段、缺陷、侍酒条件、盲品猜酒"), time: tk("不限") },
};
