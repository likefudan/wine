import type { Depth } from "../shared/model";
import { tk } from "./i18n";

/** The three ways to record a wine, with what each is for (docs/design.zh.md §3.4). */
export const DEPTH_INFO: Record<Depth, { name: string; who: string; time: string }> = {
  quick: { name: tk("快记"), who: tk("打个分、点几个香气、写一句话"), time: tk("10 秒") },
  beginner: { name: tk("入门"), who: tk("第一次认真品酒：大白话提问，边喝边学"), time: tk("约 1 分钟") },
  standard: {
    name: tk("进阶"),
    who: tk("想建立体系：完整的 WSET 品鉴表，加缺陷和侍酒条件"),
    time: tk("3–5 分钟"),
  },
};
