/* 特赛数据：每期特赛换一份，改这个文件即可，不用改代码。
 * 数据来源：用户提供的游戏内截图（One-Eleven：特殊赛事返场）
 *
 * gains：主工具车各星级下该阶段能拿到的【累计】条件数
 *        [1★, 2★, 3★, 4★, 5★, 6★]，null = 没数据 / 不可达
 *        2★ 的值包含 1★ 的（例：[3, 6, 10, 14, 19] 表示 2★ 比 1★ 多 3）
 *
 * ⚠ 截图只给了满星总量，低星曲线未知，所以现在每行只有一列有数。
 *   这种「只有一列」的阶段会被当作各星级都能拿满，并在界面上标⚠，等你补。 */
window.A9_EVENT = {
  event: "One-Eleven：特殊赛事返场",
  updated: "2026-11-08",
  totalConditions: 376,

  // maxStar：星级上限 3/4/5/6；key：钥匙车
  cars: [
    { id: "vision111",  name: "Mercedes-Benz Vision One-Eleven",          short: "Vision 111", maxStar: 6, key: true  },
    { id: "visionamg",  name: "Mercedes-Benz 2022 Showcar Vision AMG",     short: "VisionAMG",  maxStar: 4, key: false },
    { id: "hellcat",    name: "Dodge Charger SRT Hellcat Redeye Widebody", short: "地狱猫",      maxStar: 5, key: false },
    { id: "c63",        name: "Mercedes-Benz C 63 AMG DTM",                short: "C63",        maxStar: 5, key: false },
    { id: "mc20",       name: "Maserati MC20",                             short: "MC20",       maxStar: 6, key: true  },
    { id: "spano",      name: "Spania GTA 2015 GTA Spano",                 short: "Spano",      maxStar: 6, key: false },
    { id: "supersnake", name: "Ford Shelby Super Snake",                   short: "超级蛇",      maxStar: 6, key: false }
  ],

  stages: [
    { no: 1, unlock: 0,   car: "vision111",  gains: [null, null, null, null, null, 14] },
    { no: 2, unlock: 10,  car: "visionamg",  gains: [null, null, null, 12,   null, null] },
    { no: 3, unlock: 20,  car: "hellcat",    gains: [null, null, null, null, 11,   null] },
    { no: 4, unlock: 30,  car: "c63",        gains: [null, null, null, null, 12,   null] },
    { no: 5, unlock: 40,  car: "mc20",       gains: [null, null, null, null, null, 11] },
    { no: 6, unlock: 50,  car: "vision111",  gains: [null, null, null, null, null, 17] },
    { no: 7, unlock: 70,  car: "spano",      gains: [null, null, null, null, null, 17] },
    { no: 8, unlock: 90,  car: "supersnake", gains: [null, null, null, null, null, 18] },
    { no: 9, unlock: 105, car: null, carLabel: "PT？（待补）", gains: [null, null, null, null, null, 19] }
  ],

  /* 奖励表：阶段 + 星级 → 奖励文本（每期从「奖励表」导入） */
  stageRewards: [],

  /* 里程碑：达到多少条件给什么（每期从「里程碑」导入） */
  milestones: [],

  /* type:
   *   "cond" —— 分子就是当前累计条件数（图上「进度 / 钥匙条件 / 商店包条件」就是这种）
   *   "step" —— 需要档位表 steps:[{at:条件数, amount:数量}]，没填就显示「待补」 */
  rewards: [
    { key: "blueprint", name: "图纸",      type: "step", total: 66 },
    { key: "progress",  name: "进度",      type: "cond", total: 376 },
    { key: "key",       name: "钥匙",      type: "step", total: 1 },
    { key: "goldcard",  name: "金卡",      type: "step", total: 14 },
    { key: "keycond",   name: "钥匙条件",   type: "cond", total: 303 },
    { key: "pack",      name: "图纸包",     type: "step", total: 75 },
    { key: "shopcond",  name: "商店包条件", type: "cond", total: 235 },
    { key: "blue",      name: "蓝币",      type: "step", total: 5342 },
    { key: "coin",      name: "金币",      type: "step", total: 9450000, div: 10000, unit: "W" }
  ]
};
