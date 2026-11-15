/* 纯计算层：不碰 DOM，可单独用 node 测试。
 *
 * 核心是「单调闭包」：条件只增不减，所以反复扫描阶段表直到不再有新阶段被打通，
 * 结果与勾选顺序、游玩顺序无关，一定收敛。
 *
 * 每个阶段的贡献不是固定的，而是由主工具车星级决定：
 *   gains = [1★可拿, 2★可拿, 3★可拿, ...]   —— 累计值，2★ 的包含 1★ 的
 */
(function (root, factory) {
  var api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.A9Calc = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  function carIndex(ev) {
    var m = {};
    (ev.cars || []).forEach(function (c) { m[c.id] = c; });
    return m;
  }

  function cloneState(s) {
    var owned = {}, stars = {};
    Object.keys(s.owned || {}).forEach(function (k) { owned[k] = s.owned[k]; });
    Object.keys(s.stars || {}).forEach(function (k) { stars[k] = s.stars[k]; });
    return { owned: owned, stars: stars };
  }

  /* 统一成 [g1, g2, ...]：null = 该星级没数据 / 不可达 */
  function normGains(stage) {
    var g = Array.isArray(stage.gains) ? stage.gains.slice(0, 8) : null;
    if (!g) {
      if (typeof stage.total === "number") g = [stage.total];   // 兼容旧数据：只有总数
      else g = [];
    }
    while (g.length < 6) g.push(null);
    return g.map(function (v) {
      if (v === null || v === undefined || v === "") return null;
      var n = Number(v);
      return isNaN(n) ? null : n;
    });
  }

  function knownIdx(g) {
    var out = [];
    for (var i = 0; i < g.length; i++) if (g[i] != null) out.push(i);
    return out;
  }

  function stageTotal(g) {
    var ks = knownIdx(g), m = 0;
    ks.forEach(function (i) { if (g[i] > m) m = g[i]; });
    return m;
  }

  /* 某星级下能拿多少条件。
   * 只填了一列（通常是满星）时，视为未分星级，所有星级都按它算 —— 这样旧数据不会归零。 */
  function gainAt(g, star) {
    var ks = knownIdx(g);
    if (!ks.length) return 0;
    if (ks.length === 1) return g[ks[0]];
    var v = 0;
    for (var i = 0; i < g.length; i++) {
      if (i + 1 > star) break;
      if (g[i] != null) v = g[i];
    }
    return v;
  }

  /* 第一个能拿到条件的星级（0 = 全都拿不到） */
  function minStarOf(g) {
    for (var i = 0; i < g.length; i++) if (g[i] != null && g[i] > 0) return i + 1;
    return 0;
  }

  function stageGain(stage, star) { return gainAt(normGains(stage), star); }
  function stageTotalOf(stage) { return stageTotal(normGains(stage)); }
  function stageMinStar(stage) { return minStarOf(normGains(stage)); }

  function stageLabel(stage, byId) {
    if (stage.carLabel) return stage.carLabel;
    var c = byId && byId[stage.car];
    return (c && (c.short || c.name)) || stage.car || "—";
  }

  function evaluate(ev, state) {
    var byId = carIndex(ev);
    var rows = (ev.stages || []).slice()
      .sort(function (a, b) { return a.no - b.no; })
      .map(function (s) {
        var g = normGains(s);
        return {
          no: s.no, unlock: s.unlock, car: s.car, carLabel: s.carLabel,
          trial: !!s.trial, trialStar: Number(s.trialStar) || 1,
          gains: g, total: stageTotal(g), minStar: minStarOf(g),
          flat: knownIdx(g).length === 1,
          status: "locked", got: 0, star: 0, cum: 0, maxCum: 0,
          label: stageLabel(s, byId)
        };
      });

    var cond = 0;
    var changed = true;
    var guard = 0;

    while (changed && guard++ <= rows.length + 5) {
      changed = false;
      for (var i = 0; i < rows.length; i++) {
        var r = rows[i];
        if (r.status !== "locked") continue;      // done / partial / blocked 不再重判
        if (cond < r.unlock) continue;            // 门槛没到

        // 没指定车辆 = 数据不全，按可打处理
        if (!r.car) {
          r.star = 99;
        } else if (r.trial) {
          // 免费试驾：没车就借用系统车（trialStar）；自己有车就取两者更高的星级，不会倒退
          var ownStar = (state.owned && state.owned[r.car]) ? (state.stars[r.car] || 0) : 0;
          r.star = Math.max(ownStar, r.trialStar || 1);
        } else {
          if (!(state.owned && state.owned[r.car])) {
            r.status = "blocked";
            r.star = 0;
            changed = true;
            continue;
          }
          r.star = state.stars[r.car] || 0;
        }

        var gain = gainAt(r.gains, r.star);
        if (gain <= 0) {                          // 星级不够，这阶段一点都拿不到
          r.status = "blocked";
          changed = true;
          continue;
        }

        r.got = gain;
        cond += gain;
        r.status = (gain >= r.total) ? "done" : "partial";
        changed = true;
      }
    }

    var cum = 0, maxCum = 0;
    rows.forEach(function (r) {
      maxCum += r.total;
      cum += r.got;
      r.cum = cum;
      r.maxCum = maxCum;
    });

    var available = rows.reduce(function (a, r) { return a + r.total; }, 0);
    return {
      cond: cond,
      rows: rows,
      available: available,
      doneCount: rows.filter(function (r) { return r.status === "done"; }).length,
      partialCount: rows.filter(function (r) { return r.status === "partial"; }).length,
      unlockedCount: rows.filter(function (r) { return r.status !== "locked"; }).length
    };
  }

  function blankState(ev) {
    var owned = {}, stars = {};
    // 有星才有车：默认 0★ + 未解锁，界面点 1★ 即视为已解锁
    (ev.cars || []).forEach(function (c) { owned[c.id] = false; stars[c.id] = 0; });
    return { owned: owned, stars: stars };
  }

  function maxState(ev) {
    var owned = {}, stars = {};
    (ev.cars || []).forEach(function (c) { owned[c.id] = true; stars[c.id] = c.maxStar || 6; });
    return { owned: owned, stars: stars };
  }

  /* 升车模拟：每辆车「解锁」或「+1★」分别能多拿多少条件 */
  function recommend(ev, state) {
    var baseRes = evaluate(ev, state);
    var base = baseRes.cond;
    var out = [];

    (ev.cars || []).forEach(function (c) {
      var max = c.maxStar || 6;
      var owned = !!(state.owned && state.owned[c.id]);
      var cur = state.stars[c.id] || 0;

      var next, label;
      if (!owned) { next = 1; label = "解锁并 " + next + "★"; }
      else if (cur < max) { next = cur + 1; label = "升到 " + next + "★"; }
      else return;

      var t = cloneState(state);
      t.owned[c.id] = true;
      t.stars[c.id] = next;

      var res = evaluate(ev, t);
      out.push({
        carId: c.id,
        name: c.short || c.name,
        fullName: c.name,
        label: label,
        star: next,
        gain: res.cond - base,
        cond: res.cond,
        stages: res.doneCount - baseRes.doneCount
      });
    });

    return out.sort(function (a, b) {
      return b.gain - a.gain || a.star - b.star || a.name.localeCompare(b.name);
    });
  }

  return {
    evaluate: evaluate,
    blankState: blankState,
    maxState: maxState,
    recommend: recommend,
    stageGain: stageGain,
    stageTotal: stageTotalOf,
    stageMinStar: stageMinStar,
    stageLabel: stageLabel
  };
});
