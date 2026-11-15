/* 数据导入层：把 Excel / WPS 里复制出来的表格（TSV 或 CSV）变成事件数据。
 * 纯函数，不碰 DOM，方便在 test.html 里自测。
 *
 * 三张表，各管各的：
 *   ① 条件表   阶段,星级,条件数          —— 只算进度
 *   ② 奖励表   阶段,星级,奖励物品描述     —— 只发东西
 *   ③ 里程碑   条件150 金币500000        —— 按总条件发东西
 */
(function (root, factory) {
  var api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.A9IO = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  var MAXSTAR = 6;

  function norm(s) {
    return String(s == null ? "" : s).toLowerCase().replace(/[\s\-_·.()（）]/g, "");
  }
  function num(v) {
    var s = String(v == null ? "" : v).replace(/[^\d.-]/g, "");
    if (s === "" || s === "-" || s === ".") return NaN;
    return Number(s);
  }
  function truthy(v) {
    var s = norm(v);
    return s === "是" || s === "y" || s === "yes" || s === "true" || s === "1" || s === "钥匙";
  }

  function splitLine(line, sep) {
    var out = [], cur = "", q = false;
    for (var i = 0; i < line.length; i++) {
      var ch = line.charAt(i);
      if (q) {
        if (ch === '"') {
          if (line.charAt(i + 1) === '"') { cur += '"'; i++; }
          else q = false;
        } else cur += ch;
      } else if (ch === '"') {
        q = true;
      } else if (ch === sep) {
        out.push(cur); cur = "";
      } else {
        cur += ch;
      }
    }
    out.push(cur);
    return out.map(function (s) { return s.trim(); });
  }

  function table(text) {
    var lines = String(text || "").replace(/\r\n?/g, "\n").split("\n")
      .filter(function (l) { return l.trim() !== ""; });
    if (!lines.length) return { header: null, rows: [] };

    var sep = (lines[0].indexOf("\t") >= 0) ? "\t" : ",";
    var grid = lines.map(function (l) { return splitLine(l, sep); });

    var first = grid[0][0] || "";
    var looksHeader = isNaN(num(first)) ||
      /阶段|名称|主工具车|解锁|星|条件|简称|钥匙|档位|奖励|no/i.test(grid[0].join(" "));
    var header = looksHeader ? grid[0] : null;
    var rows = looksHeader ? grid.slice(1) : grid;
    return { header: header, rows: rows };
  }

  function mapHeader(header, aliases) {
    var map = {};
    if (!header) return map;
    header.forEach(function (cell, i) {
      var n = norm(cell);
      Object.keys(aliases).forEach(function (field) {
        if (map[field] != null) return;
        if (aliases[field].some(function (a) { return norm(a) === n; })) map[field] = i;
      });
    });
    return map;
  }

  function pick(row, map, field, fallbackIndex) {
    var i = (map[field] != null) ? map[field] : fallbackIndex;
    return (i != null && i < row.length) ? row[i] : "";
  }

  /* ---------- 车辆 ---------- */
  var CAR_COLS = {
    name: ["名称", "全名", "车名", "车辆", "name"],
    short: ["简称", "缩写", "short"],
    maxStar: ["星级上限", "上限", "最高星级", "maxstar", "max"],
    key: ["钥匙车", "钥匙", "key"]
  };

  function parseCars(text) {
    var t = table(text);
    if (!t.rows.length) return { cars: [], errors: [], warnings: [] };

    var map = mapHeader(t.header, CAR_COLS);
    var errors = [], warnings = [], cars = [], seen = {};

    t.rows.forEach(function (row, idx) {
      var lineNo = idx + (t.header ? 2 : 1);
      var name = pick(row, map, "name", 0);
      if (!name) return;

      var short = pick(row, map, "short", 1) || name;
      var maxStar = num(pick(row, map, "maxStar", 2));
      if (isNaN(maxStar)) maxStar = 6;
      maxStar = Math.max(3, Math.min(8, Math.round(maxStar)));
      var key = truthy(pick(row, map, "key", 3));

      if (seen[norm(short)]) {
        errors.push("车辆第 " + lineNo + " 行：简称「" + short + "」重复了");
        return;
      }
      seen[norm(short)] = true;

      cars.push({
        id: "c" + (cars.length + 1) + "-" + norm(short).slice(0, 12),
        name: String(name),
        short: String(short),
        maxStar: maxStar,
        key: key
      });
    });

    if (!cars.length) errors.push("车辆表里没有解析到任何一辆车");
    return { cars: cars, errors: errors, warnings: warnings };
  }

  function resolveCar(label, cars) {
    var n = norm(label);
    if (!n) return null;
    for (var i = 0; i < cars.length; i++) {
      if (norm(cars[i].name) === n || norm(cars[i].short) === n || norm(cars[i].id) === n) return cars[i];
    }
    for (var j = 0; j < cars.length; j++) {
      var s = norm(cars[j].short);
      if (s && (n.indexOf(s) >= 0 || s.indexOf(n) >= 0)) return cars[j];
    }
    return null;
  }

  /* ---------- 奖励文本解析 ----------
   * 支持：金币10000 / 蓝币50 / 图纸包×1 / 图纸·MC20×2 / Vision 111图纸x2 / 金币×1W
   * 多个用 ; ； 、 , + 分隔 */
  function parseRewardItems(text, defaultCar) {
    var out = [];
    String(text || "").split(/[;；、,，+＋]/).forEach(function (part) {
      var p = part.trim();
      if (!p) return;

      var amount = 1, label = p;

      // 万 / W 后缀
      var mw = p.match(/^(.*?)[×xX*]?\s*([\d.]+)\s*([Ww万])\s*$/);
      if (mw && mw[1].trim()) {
        label = mw[1].trim();
        amount = Math.round(parseFloat(mw[2]) * 10000);
      } else {
        // 末尾数字，前面可带 × x X *
        var m = p.match(/^(.*?)(\d+)\s*$/);
        if (m && m[1].trim()) {
          label = m[1].trim().replace(/[×xX*]\s*$/, "").trim();
          amount = Number(m[2]);
        }
      }

      var name = label, target = null;
      var mt = label.match(/^(.+?)\s*[·@（(]\s*([^）)·@()]+)\s*[）)]?\s*$/);
      if (mt) {
        name = mt[1].trim();
        target = mt[2].trim();
      } else {
        var ms = label.match(/^(.+?)\s*(图纸包|图纸)$/);
        if (ms && ms[1].trim()) { target = ms[1].trim(); name = ms[2]; }
      }

      if (!target && defaultCar && (name === "图纸" || name === "图纸包")) target = defaultCar;
      out.push({ name: name, target: target, amount: amount });
    });
    return out;
  }

  function rewardKey(it) {
    return it.target ? (it.name + "·" + it.target) : it.name;
  }

  /* ---------- ① 条件表：阶段, 星级, 条件数 [+ 解锁条件, 主工具车] ---------- */
  var COND_COLS = {
    no: ["阶段", "阶段号", "序号", "no", "stage"],
    star: ["星级", "星", "star"],
    cond: ["条件数", "条件", "累计条件", "cond"],
    unlock: ["解锁条件", "解锁", "门槛", "unlock"],
    car: ["主工具车", "工具车", "车", "车辆", "car"]
  };

  function parseConditions(text, cars, baseStages) {
    var t = table(text);
    var errors = [], warnings = [], byNo = {}, order = [];
    var prev = {};
    (baseStages || []).forEach(function (s) { prev[s.no] = s; });

    if (!t.rows.length) {
      errors.push("条件表是空的");
      return { stages: [], errors: errors, warnings: warnings };
    }

    var map = mapHeader(t.header, COND_COLS);
    var lastNo = null;

    t.rows.forEach(function (row, idx) {
      var lineNo = idx + (t.header ? 2 : 1);

      var noRaw = pick(row, map, "no", 0);
      var no = String(noRaw).trim() === "" ? lastNo : num(noRaw);
      if (no == null || isNaN(no)) {
        errors.push("条件表第 " + lineNo + " 行：阶段号不是数字");
        return;
      }
      no = Math.round(no);
      lastNo = no;

      var s = byNo[no];
      if (!s) {
        s = byNo[no] = {
          no: no, unlock: null, car: null, carLabel: null,
          gains: [], _unlockSet: false, _carSet: false
        };
        order.push(no);
      }

      var uRaw = pick(row, map, "unlock", 3);
      if (String(uRaw).trim() !== "") {
        var u = num(uRaw);
        if (isNaN(u)) errors.push("条件表第 " + lineNo + " 行：解锁条件不是数字");
        else { s.unlock = Math.round(u); s._unlockSet = true; }
      }

      var carCell = pick(row, map, "car", 4);
      if (String(carCell).trim() !== "") {
        s._carSet = true;
        var unknownMark = /^\s*\?/.test(carCell);
        if (unknownMark) carCell = carCell.replace(/^\s*\?/, "").trim();
        var c = (!unknownMark && carCell) ? resolveCar(carCell, cars) : null;
        if (!unknownMark && carCell && !c) {
          errors.push("条件表第 " + lineNo + " 行：找不到车辆「" + carCell + "」，请检查车辆表里的简称");
        }
        s.car = c ? c.id : null;
        s.carLabel = (!c && carCell) ? carCell : null;
      }

      var star = num(pick(row, map, "star", 1));
      if (isNaN(star) || star < 1 || star > 8) {
        errors.push("条件表第 " + lineNo + " 行：星级要填 1~8");
        return;
      }
      star = Math.round(star);

      var condRaw = pick(row, map, "cond", 2);
      if (String(condRaw).trim() !== "") {
        var cond = num(condRaw);
        if (isNaN(cond)) {
          errors.push("条件表第 " + lineNo + " 行：条件数不是数字");
        } else {
          s.gains[star - 1] = Math.round(cond);
        }
      }
    });

    // 没写的解锁条件 / 主工具车，沿用同阶段原有的
    var stages = order.map(function (no) {
      var s = byNo[no];
      var old = prev[no];
      if (!s._unlockSet) s.unlock = old ? old.unlock : 0;
      if (!s._carSet) {
        s.car = old ? old.car : null;
        s.carLabel = old ? old.carLabel : null;
      }
      delete s._unlockSet;
      delete s._carSet;

      var g = [];
      for (var i = 0; i < MAXSTAR; i++) g.push(s.gains[i] == null ? null : s.gains[i]);
      s.gains = g;
      return s;
    });

    stages.forEach(function (s) {
      if (!s.gains.some(function (v) { return v != null; })) {
        errors.push("阶段 " + s.no + "：一个条件数都没填");
        return;
      }
      var p = null;
      for (var i = 0; i < s.gains.length; i++) {
        if (s.gains[i] == null) continue;
        if (p != null && s.gains[i] < p) {
          errors.push("阶段 " + s.no + "：" + (i + 1) + "★ 的条件比前面还少，星级条件必须递增");
          return;
        }
        p = s.gains[i];
      }
    });

    stages.sort(function (a, b) { return a.no - b.no; });

    if (stages.length && stages.every(function (s) { return !s.unlock; })) {
      warnings.push("条件表里没有解锁条件，所有阶段按 0 门槛处理（可加一列「解锁条件」）");
    }

    return { stages: stages, errors: errors, warnings: warnings };
  }

  /* ---------- ② 奖励表：阶段, 星级, 奖励 ---------- */
  var REWARD_COLS = {
    no: ["阶段", "阶段号", "no", "stage"],
    star: ["星级", "星", "star"],
    reward: ["奖励", "奖励内容", "奖励物品", "物品", "reward"]
  };

  function parseStageRewards(text) {
    var t = table(text);
    var list = [], errors = [];

    if (!t.rows.length) return { list: list, errors: errors, warnings: [] };

    var map = mapHeader(t.header, REWARD_COLS);
    var lastNo = null, lastStar = null;

    t.rows.forEach(function (row, idx) {
      var lineNo = idx + (t.header ? 2 : 1);

      var noRaw = pick(row, map, "no", 0);
      var no = String(noRaw).trim() === "" ? lastNo : num(noRaw);
      if (no == null || isNaN(no)) { errors.push("奖励表第 " + lineNo + " 行：阶段号不是数字"); return; }
      no = Math.round(no); lastNo = no;

      var starRaw = pick(row, map, "star", 1);
      var star = String(starRaw).trim() === "" ? lastStar : num(starRaw);
      if (star == null || isNaN(star)) { errors.push("奖励表第 " + lineNo + " 行：星级不是数字"); return; }
      star = Math.round(star); lastStar = star;

      var txt = String(pick(row, map, "reward", 2) || "").trim();
      if (!txt) return;

      list.push({ no: no, star: star, text: txt, items: parseRewardItems(txt) });
    });

    return { list: list, errors: errors, warnings: [] };
  }

  /* ---------- ③ 里程碑：条件150 金币500000 ---------- */
  function parseMilestones(text) {
    var out = [], errors = [];
    String(text || "").replace(/\r\n?/g, "\n").split("\n").forEach(function (line, idx) {
      var s = line.trim();
      if (!s) return;
      var m = s.match(/^(?:条件\s*)?[-—]?\s*(\d+)\s*[,，\s:：|]+(.+)$/);
      if (!m) {
        errors.push("里程碑第 " + (idx + 1) + " 行格式看不懂：应写成「条件150 金币500000」");
        return;
      }
      out.push({ at: Number(m[1]), text: m[2].trim(), items: parseRewardItems(m[2]) });
    });
    out.sort(function (a, b) { return a.at - b.at; });
    return { list: out, errors: errors, warnings: [] };
  }

  /* ---------- 旧版「条件计数器」表（进度 / 钥匙条件等），只在 JSON 里维护 ---------- */
  function parseSteps(text) {
    var out = [];
    String(text || "").split(/[;；]/).forEach(function (part) {
      var p = part.trim();
      if (!p) return;
      var m = p.split(/[=:：]/);
      if (m.length < 2) return;
      var at = num(m[0]), amount = num(m[1]);
      if (isNaN(at) || isNaN(amount)) return;
      out.push({ at: Math.round(at), amount: Math.round(amount) });
    });
    return out.sort(function (a, b) { return a.at - b.at; });
  }

  function parseCounters(text) {
    var t = table(text);
    var errors = [], warnings = [], rewards = [];
    var missingSteps = 0;
    if (!t.rows.length) return { rewards: rewards, errors: errors, warnings: warnings };

    var map = mapHeader(t.header, {
      name: ["名称", "奖励", "name"],
      type: ["类型", "type"],
      total: ["总量", "总数", "total"],
      steps: ["档位", "阶梯", "steps"]
    });

    t.rows.forEach(function (row, idx) {
      var lineNo = idx + (t.header ? 2 : 1);
      var name = pick(row, map, "name", 0);
      if (!name) return;
      var typeRaw = norm(pick(row, map, "type", 1));
      var total = num(pick(row, map, "total", 2));
      if (isNaN(total)) { errors.push("奖励第 " + lineNo + " 行：总量不是数字"); return; }

      var type = (typeRaw.indexOf("条件") >= 0 || typeRaw === "cond") ? "cond" : "step";
      var steps = parseSteps(pick(row, map, "steps", 3));
      if (type === "step" && !steps.length && total > 0) missingSteps++;

      rewards.push({
        key: "r" + rewards.length,
        name: String(name),
        type: type,
        total: Math.round(total),
        steps: steps
      });
    });

    if (missingSteps) warnings.push("有 " + missingSteps + " 项奖励还没填档位，界面上会显示「—」");
    return { rewards: rewards, errors: errors, warnings: warnings };
  }

  /* ---------- 组装 ---------- */
  function build(opts) {
    var base = opts.base || {};
    var errors = [], warnings = [];

    var carRes = opts.carsText && opts.carsText.trim()
      ? parseCars(opts.carsText)
      : { cars: (base.cars || []).slice(), errors: [], warnings: [] };

    var cond = parseConditions(opts.condText, carRes.cars, base.stages || []);
    var rw = parseStageRewards(opts.rewardText);
    var ms = parseMilestones(opts.mileText);

    errors = errors.concat(carRes.errors, cond.errors, rw.errors, ms.errors);
    warnings = warnings.concat(carRes.warnings, cond.warnings, rw.warnings, ms.warnings);

    // 把奖励表挂回各阶段，界面沿用 tierRewards
    cond.stages.forEach(function (s) {
      s.tierRewards = rw.list
        .filter(function (r) { return r.no === s.no; })
        .map(function (r) { return { star: r.star, text: r.text, items: r.items }; });
    });

    var sum = cond.stages.reduce(function (a, s) {
      var known = (s.gains || []).filter(function (v) { return v != null; });
      return a + (known.length ? Math.max.apply(null, known) : 0);
    }, 0);

    var total = num(opts.total);
    if (isNaN(total) || total <= 0) total = sum;
    if (!isNaN(total) && total < sum) {
      warnings.push("官方总条件（" + total + "）小于各阶段满星之和（" + sum + "），确认一下？");
    }

    var ev = {
      event: (opts.name || base.event || "未命名特赛"),
      updated: new Date().toISOString().slice(0, 10),
      totalConditions: Math.round(total),
      cars: carRes.cars,
      stages: cond.stages,
      stageRewards: rw.list,
      milestones: ms.list,
      rewards: (base.rewards || []).slice()
    };

    return { ev: ev, errors: errors, warnings: warnings, sum: sum };
  }

  /* ---------- 导出 ---------- */
  function toCsv(ev) {
    var cars = ["名称,简称,星级上限,钥匙车"];
    (ev.cars || []).forEach(function (c) {
      cars.push([c.name, c.short, c.maxStar || 6, c.key ? "是" : "否"].join(","));
    });

    var conds = ["阶段,星级,条件数,解锁条件,主工具车"];
    (ev.stages || []).slice().sort(function (a, b) { return a.no - b.no; }).forEach(function (s) {
      var car = (ev.cars || []).filter(function (c) { return c.id === s.car; })[0];
      var carCell = car ? car.short : (s.carLabel ? ("?" + s.carLabel) : "");
      var g = (s.gains || []).slice(0, MAXSTAR);
      while (g.length < MAXSTAR) g.push(null);
      var first = true;
      g.forEach(function (v, i) {
        if (v == null) return;
        conds.push([s.no, i + 1, v, first ? s.unlock : "", first ? carCell : ""].join(","));
        first = false;
      });
      if (first) conds.push([s.no, 1, 0, s.unlock, carCell].join(","));
    });

    var rws = ["阶段,星级,奖励"];
    (ev.stageRewards || []).forEach(function (r) {
      rws.push([r.no, r.star, (r.items || []).map(function (it) {
        return rewardKey(it) + "×" + it.amount;
      }).join(";")].join(","));
    });

    var miles = [];
    (ev.milestones || []).forEach(function (m) {
      miles.push("条件" + m.at + " " + (m.items || []).map(function (it) {
        return rewardKey(it) + "×" + it.amount;
      }).join(";"));
    });

    return {
      cars: cars.join("\n"),
      conditions: conds.join("\n"),
      rewards: rws.join("\n"),
      milestones: miles.join("\n")
    };
  }

  return {
    build: build,
    toCsv: toCsv,
    parseCars: parseCars,
    parseConditions: parseConditions,
    parseStageRewards: parseStageRewards,
    parseMilestones: parseMilestones,
    parseCounters: parseCounters,
    parseRewardItems: parseRewardItems,
    rewardKey: rewardKey,
    resolveCar: resolveCar,
    _table: table
  };
});
