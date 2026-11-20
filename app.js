(function () {
  "use strict";

  var CALC = window.A9Calc;
  var IO = window.A9IO;
  var DEFAULT = window.A9_EVENT;
  var K_EVENT = "a9.event.v1";
  var K_STATE = "a9.state.v1";

  var EV = null;
  var ST = null;
  var lastParse = null;

  function $(id) { return document.getElementById(id); }

  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function clone(o) { return JSON.parse(JSON.stringify(o)); }
  function fmt(n) { return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ","); }
  function fmtMoney(r, n) {
    if (r.div) return Math.round(n / r.div) + (r.unit || "");
    return fmt(n);
  }
  function normKey(s) {
    return String(s == null ? "" : s).toLowerCase().replace(/[\s\-_·.()（）]/g, "");
  }

  /* ---------- 存取 ---------- */

  function loadEvent() {
    try {
      var raw = localStorage.getItem(K_EVENT);
      if (raw) {
        var e = JSON.parse(raw);
        if (e && Array.isArray(e.stages) && Array.isArray(e.cars)) return e;
      }
    } catch (err) { /* file:// 下可能不可用 */ }
    return clone(DEFAULT);
  }
  function saveEvent() {
    try { localStorage.setItem(K_EVENT, JSON.stringify(EV)); } catch (e) {}
  }

  /* ---------- 读取后台（数据管理面板）保存的特赛数据 ---------- */
  var K_BACKEND = "a9.manage.saved";

  function emptyEvent() {
    return {
      event: "", updated: "", totalConditions: 0,
      cars: [], stages: [], stageRewards: [], milestones: [], rewards: []
    };
  }

  function readLocalEvent() {
    try {
      var raw = localStorage.getItem(K_EVENT);
      if (!raw) return null;
      var e = JSON.parse(raw);
      if (e && Array.isArray(e.stages) && e.stages.length) return e;
    } catch (err) {}
    return null;
  }

  function findCatalogCar(name) {
    var list = (window.A9_CARS && window.A9_CARS.cars) || [];
    var k = normKey(name);
    if (!k) return null;
    for (var i = 0; i < list.length; i++) {
      if (normKey(list[i].name) === k) return list[i];
    }
    for (var j = 0; j < list.length; j++) {
      var n = normKey(list[j].name);
      if (n && (n.indexOf(k) >= 0 || k.indexOf(n) >= 0)) return list[j];
    }
    return null;
  }

  /* 后台结构： [{stage, unlock, car, stars:[{star, cond, rewards[]}]}]
   * 也支持 { stages: [...], milestones: [...] } 的新结构。
   * 条件是按星级新增的，这里累加成 gains（累计）给计算引擎用。 */
  function buildFromManage(arr, milestones) {
    var cars = [], seen = {};
    var stages = [];
    var total = 0;

    function useCar(name) {
      if (!name) return null;
      var hit = findCatalogCar(name);
      var id, rec;
      if (hit) {
        id = "m-" + hit.id;
        rec = { id: id, name: hit.name, short: hit.alias || hit.name, maxStar: hit.stars || 6, key: !!hit.key };
      } else {
        id = "m-" + normKey(name).slice(0, 24);
        rec = { id: id, name: name, short: name, maxStar: 6, key: false };
      }
      if (!seen[id]) { seen[id] = true; cars.push(rec); }
      return id;
    }

    arr.forEach(function (s) {
      var rows = (s.stars || []).slice().sort(function (a, b) { return a.star - b.star; });
      if (!rows.length) return;

      var gains = [null, null, null, null, null, null];
      var acc = 0;
      var tierRewards = [];
      var carId = useCar(s.car);   // 先登记主工具车，车库里排在前面
      if (carId && s.isTrial) {
        var rec = null;
        for (var ci = 0; ci < cars.length; ci++) { if (cars[ci].id === carId) { rec = cars[ci]; break; } }
        if (rec) {
          var ts = Number(s.trialStar) || 1;
          rec.trialStar = Math.max(rec.trialStar || 0, ts);
        }
      }

      rows.forEach(function (r) {
        acc += Number(r.cond) || 0;
        gains[r.star - 1] = acc;
        (r.rewards || []).forEach(function (rw) {
          if (rw.type === "图纸" && rw.carName) useCar(rw.carName);
          tierRewards.push({
            star: r.star,
            text: rw.type + " ×" + rw.amount,
            items: [{ name: rw.type, target: rw.carName || null, amount: Number(rw.amount) || 0 }]
          });
        });
      });

      var maxGain = 0;
      gains.forEach(function (g) { if (g != null && g > maxGain) maxGain = g; });
      total += maxGain;

      stages.push({
        no: Number(s.stage),
        unlock: Number(s.unlock) || 0,
        trial: !!s.isTrial,
        trialStar: Number(s.trialStar) || 1,
        peak: !!s.isPeak,
        car: carId,
        gains: gains,
        tierRewards: tierRewards
      });
    });

    stages.sort(function (a, b) { return a.no - b.no; });

    var ms = (milestones || []).map(function (m) {
      var items = (m.rewards || []).map(function (rw) {
        if (rw.type === "图纸" && rw.carName) useCar(rw.carName);
        return { name: rw.type, target: rw.carName || null, amount: Number(rw.amount) || 0 };
      });
      return {
        at: Number(m.at) || 0,
        text: items.map(function (it) { return it.name + " ×" + it.amount; }).join("; "),
        items: items
      };
    }).filter(function (m) { return m.at > 0 && m.items.length; })
      .sort(function (a, b) { return a.at - b.at; });

    return {
      event: "特赛进度",
      updated: new Date().toISOString().slice(0, 10),
      totalConditions: total,
      cars: cars,
      stages: stages,
      stageRewards: [],
      milestones: ms,
      rewards: []
    };
  }

  /* 线上数据文件 event.js → localStorage 兜底（?preview=1 时反过来，先看本地草稿） */
  function buildEventFrom(d) {
    if (!d) return null;
    var stages = Array.isArray(d) ? d : (d && d.stages);
    var miles = (!Array.isArray(d) && d && d.milestones) || [];
    if (!Array.isArray(stages) || !stages.length) return null;
    var ev = buildFromManage(stages, miles);
    return ev.stages.length ? ev : null;
  }

  function readBackend() {
    var fromFile = null, fromLocal = null;

    try {
      if (window.A9_MANAGE_DATA && window.A9_MANAGE_DATA.stages) fromFile = window.A9_MANAGE_DATA;
    } catch (e) {}

    try {
      var raw = localStorage.getItem(K_BACKEND);
      if (raw) fromLocal = JSON.parse(raw);
    } catch (e) {}

    var preferLocal = /[?&](preview|local)=1/.test(location.search);
    var order = preferLocal ? [fromLocal, fromFile] : [fromFile, fromLocal];

    for (var i = 0; i < order.length; i++) {
      var ev = buildEventFrom(order[i]);
      if (ev) return ev;
    }
    return null;
  }

  function stateKey() { return K_STATE + ":" + (EV.event || "default"); }

  function loadState() {
    var base = CALC.blankState(EV);
    var saved = null;
    try {
      var raw = localStorage.getItem(stateKey());
      if (raw) saved = JSON.parse(raw);
    } catch (e) {}

    EV.cars.forEach(function (c) {
      var hasOwn = !!(saved && saved.owned && typeof saved.owned[c.id] === "boolean");
      var hasStar = !!(saved && saved.stars && typeof saved.stars[c.id] === "number");

      if (hasOwn) base.owned[c.id] = saved.owned[c.id];
      if (hasStar) base.stars[c.id] = Math.max(0, Math.min(saved.stars[c.id], c.maxStar || 6));

      // 图纸车：有星就有车，老存档里「1★ + 未解锁」这种矛盾状态自动修正；钥匙车不看星级
      if (!c.key && base.stars[c.id] >= 1 && !base.owned[c.id]) base.owned[c.id] = true;
    });
    return base;
  }
  function saveState() {
    try { localStorage.setItem(stateKey(), JSON.stringify(ST)); } catch (e) {}
  }

  /* 换数据时按「简称」把车库搬过去：车还是那辆车，不用重新点一遍 */
  function carryState(oldST, oldEv, newEv) {
    var s = CALC.blankState(newEv);
    if (!oldST || !oldEv) return s;
    var byShort = {};
    (oldEv.cars || []).forEach(function (c) { byShort[normKey(c.short || c.name)] = c.id; });
    (newEv.cars || []).forEach(function (c) {
      var oldId = byShort[normKey(c.short || c.name)];
      if (!oldId) return;
      if (typeof oldST.owned[oldId] === "boolean") {
        s.owned[c.id] = oldST.owned[oldId];
        s.stars[c.id] = Math.min(oldST.stars[oldId] || 1, c.maxStar || 6);
      }
    });
    return s;
  }

  /* ---------- 渲染 ---------- */

  function render() {
    var res = CALC.evaluate(EV, ST);
    renderEvent(res);
    renderGarage();
    renderRewards(res);
    renderMilestones(res);
    renderProgress(res);
    renderAdvice(res);
    saveState();
  }

  function renderEvent(res) {
    var chip = $("eventName");
    if (EV.event) {
      chip.textContent = EV.event;
      chip.style.display = "inline-block";
    } else {
      chip.style.display = "none";
    }

    if (!res.rows.length) {
      $("hero").innerHTML = '<div class="ev-empty">暂无特赛数据，请管理员录入</div>';
      return;
    }

    var total = EV.totalConditions || res.available || 1;
    var pct = Math.min(100, (res.cond / total) * 100);
    var C = 2 * Math.PI * 40;

    var next = null;
    for (var i = 0; i < res.rows.length; i++) {
      var st = res.rows[i].status;
      if (st !== "done" && st !== "empty") { next = res.rows[i]; break; }
    }

    var sub;
    if (!next) {
      sub = "已全部打通";
    } else if (next.status === "locked") {
      sub = "距阶段 " + next.no + " 还差 " + Math.max(0, next.unlock - res.cond) + " 条件";
    } else if (next.status === "partial") {
      sub = "阶段 " + next.no + " 还差 " + (next.total - next.got) + " 条件";
    } else if (!next.car) {
      sub = "阶段 " + next.no + " 已解锁";
    } else if (!ST.owned[next.car]) {
      sub = "阶段 " + next.no + " 需要「" + next.label + "」";
    } else {
      sub = "阶段 " + next.no + " 需要「" + next.label + "」" + next.minStar + "★";
    }

    $("hero").innerHTML =
      '<div class="ev-ring">' +
        '<svg viewBox="0 0 96 96" aria-hidden="true">' +
          '<circle class="ev-track" cx="48" cy="48" r="40"/>' +
          '<circle class="ev-arc" cx="48" cy="48" r="40" style="stroke-dasharray:' + C.toFixed(1) +
            ";stroke-dashoffset:" + (C * (1 - pct / 100)).toFixed(1) + '"/>' +
        "</svg>" +
        '<div class="ev-ring-num"><b>' + fmt(res.cond) + "</b><span>/ " + fmt(total) + "</span></div>" +
      "</div>" +
      '<div class="ev-hmain">' +
        "<h2>当前进度</h2>" +
        "<p>当前 <b>" + fmt(res.cond) + "</b> 条件 · " + esc(sub) + "</p>" +
        '<div class="ev-hbar"><i style="width:' + pct.toFixed(1) + '%"></i></div>' +
      "</div>";
  }

  function starsHtml(max, cur) {
    var h = "";
    for (var i = 1; i <= max; i++) {
      h += '<span class="star' + (i <= cur ? " on" : "") + '" data-star="' + i + '">★</span>';
    }
    return h;
  }

  function chkHtml(label, on) {
    return '<span class="chk' + (on ? " on" : "") + '"><i class="box">' + (on ? "✓" : "") + "</i>" + label + "</span>";
  }

  function dtCell(label, val) {
    return '<div class="dt-cell"><span>' + esc(label) + "</span><b>" +
      esc(String(val == null || val === "" ? "-" : val)) + "</b></div>";
  }
  function n0(v) { return v == null ? "-" : Math.round(v); }
  function n1(v) { return v == null ? "-" : Math.round(v * 10) / 10; }
  function n2(v) { return v == null ? "-" : Math.round(v * 100) / 100; }

  /* 车辆详情：基础 / 图纸分布 / 性能 / 零件 / 费用 */
  function openCarDetail(carId) {
    var car = null;
    for (var i = 0; i < EV.cars.length; i++) { if (EV.cars[i].id === carId) { car = EV.cars[i]; break; } }
    if (!car) return;

    var cat = findCatalogCar(car.name);
    $("carTitle").textContent = car.name;

    var h = "";
    if (!cat) {
      h = '<div class="dt-empty">图鉴里还没有这台车的完整数据。可以在「车辆数据管理」里补全。</div>';
    } else {
      h += '<div class="dt-sec"><h4>基础</h4><div class="dt-grid">' +
        dtCell("等级", cat.cls || "-") +
        dtCell("星级上限", (cat.stars || car.maxStar || 6) + "★") +
        dtCell("总分", cat.score == null ? "-" : cat.score) +
      "</div></div>";

      var bp = cat.bp || [];
      var bpHtml;
      if (!bp.length) {
        bpHtml = '<div class="dt-empty">图纸数据未知</div>';
      } else {
        bpHtml = '<div class="dt-grid">';
        var from = cat.key ? 2 : 1;
        for (var s = from; s <= (cat.stars || bp.length); s++) {
          bpHtml += dtCell(s + "★", bp[cat.key ? s - 2 : s - 1]);
        }
        bpHtml += '<div class="dt-cell total"><span>总计</span><b>' +
          (cat.bpTotal == null ? "-" : cat.bpTotal) + "</b></div></div>";
      }
      h += '<div class="dt-sec"><h4>图纸分布</h4>' + bpHtml + "</div>";

      var p = cat.perf || {};
      h += '<div class="dt-sec"><h4>性能</h4><div class="dt-grid">' +
        dtCell("极速", n1(p.top)) + dtCell("加速", n2(p.accel)) +
        dtCell("操控", n2(p.handling)) + dtCell("氮气", n2(p.nitroPower)) +
      "</div></div>";
      h += '<div class="dt-sec"><div class="dt-grid">' +
        dtCell("空速", n0(p.air)) + dtCell("氮速", n0(p.nitro)) +
        dtCell("单喷", p.spray == null ? "-" : p.spray + "s") +
      "</div></div>";

      var parts = cat.parts || {};
      h += '<div class="dt-sec"><h4>进口零件 · 费用</h4><div class="dt-grid">' +
        dtCell("蓝", parts.blue) + dtCell("紫", parts.purple) + dtCell("黄", parts.yellow) +
      "</div></div>";
      h += '<div class="dt-sec"><div class="dt-grid g2">' +
        dtCell("改装费用", cat.cost == null ? "-" : Number(cat.cost).toLocaleString("en-US")) +
        dtCell("钥匙车", cat.key ? "是" : "否") +
      "</div></div>";
    }

    $("carBody").innerHTML = h;
    $("carSheet").hidden = false;
  }

  function renderGarage() {
    var h = "";
    EV.cars.forEach(function (car) {
      var max = car.maxStar || 6;
      var cur = ST.stars[car.id] || 0;
      var owned = !!ST.owned[car.id];
      var stars = "";
      for (var s = 1; s <= max; s++) {
        stars += '<i class="' + (s <= cur ? "on" : "") + '" data-star="' + s + '">★</i>';
      }
      var shown = car.short || car.name;

      h +=
        '<div class="ev-car" data-car="' + car.id + '">' +
          '<div class="ev-car-top">' +
            (car.key ? '<span class="ev-key" title="钥匙车">🔑</span>' : "") +
            '<span class="ev-cname" title="' + esc(car.name) + '">' + esc(shown) + "</span>" +
            '<button class="ev-detail" type="button" data-detail="' + car.id + '">详情</button>' +
          "</div>" +
          '<div class="ev-car-bot">' +
            '<div class="ev-stars' + (owned ? "" : " dim") + '">' + stars + "</div>" +
            '<button class="ev-pill ' + (owned ? "on" : "off") + '" type="button" data-own="' + car.id + '">' +
              (owned ? "已解锁" : "未解锁") + "</button>" +
          "</div>" +
        "</div>";
    });
    $("garage").innerHTML = h || '<div class="ev-empty">还没有车辆数据</div>';
  }

  /* 试驾车在 loadState 里预置好了，这里不再额外处理 */

  /* 把「阶段+星级」上的奖励汇总成 名称 → {已得, 总量} */
  function tierRewardSummary(res) {
    var map = {}, byNo = {};
    (EV.stages || []).forEach(function (s) { byNo[s.no] = s; });

    res.rows.forEach(function (r) {
      var st = byNo[r.no];
      if (!st || !st.tierRewards) return;
      st.tierRewards.forEach(function (t) {
        (t.items || []).forEach(function (it) {
          var key = IO.rewardKey(it);
          var m = map[key] || (map[key] = { got: 0, total: 0, base: it.name });
          m.total += it.amount;
          if (r.status !== "locked" && t.star <= (r.star || 0)) m.got += it.amount;
        });
      });
    });
    return map;
  }

  function renderMilestones(res) {
    var list = EV.milestones || [];
    var host = $("milestones");
    var card = host.closest(".ev-card") || $("msCard");
    if (!list.length) {
      host.innerHTML = '<div class="ev-empty">还没有里程碑数据</div>';
      if (card) card.style.display = "none";
      return;
    }
    if (card) card.style.display = "";
    host.innerHTML = list.map(function (m) {
      var done = res.cond >= m.at;
      return '<div class="ms' + (done ? " done" : "") + '">' +
        '<span class="ms-at">' + fmt(m.at) + "</span>" +
        '<span class="ms-txt">' + esc(m.text) + "</span>" +
        '<span class="ms-st">' + (done ? "已达成" : "差 " + fmt(m.at - res.cond)) + "</span>" +
      "</div>";
    }).join("");
  }

  function compactNum(n) {
    if (n == null) return "—";
    if (Math.abs(n) >= 100000000) {
      return (n / 100000000).toFixed(1).replace(/\.0$/, "") + "亿";
    }
    if (Math.abs(n) >= 10000) {
      var w = n / 10000;
      return (w >= 100 ? Math.round(w) : Math.round(w * 10) / 10) + "万";
    }
    return String(Math.round(n));
  }

  var RW_ICON = {
    "图纸": '<svg viewBox="0 0 24 24" fill="none" stroke="#5b7cfa" stroke-width="1.7" stroke-linejoin="round"><path d="M6 3h8l4 4v14H6z"/><path d="M14 3v4h4"/></svg>',
    "金币": '<svg viewBox="0 0 24 24" fill="none" stroke="#d99a00" stroke-width="1.6"><ellipse cx="12" cy="7" rx="7" ry="3"/><path d="M5 7v4c0 1.7 3.1 3 7 3s7-1.3 7-3V7"/><path d="M5 11v4c0 1.7 3.1 3 7 3s7-1.3 7-3v-4"/></svg>',
    "蓝币": '<svg viewBox="0 0 24 24" fill="none" stroke="#3b82f6" stroke-width="1.7"><circle cx="12" cy="12" r="8"/><path d="M12 7v10M9 9.5h6M9 14.5h6"/></svg>',
    "抽包": '<svg viewBox="0 0 24 24" fill="none" stroke="#8b5cf6" stroke-width="1.7" stroke-linejoin="round"><path d="M4 8h16v11H4z"/><path d="M4 8 6.5 4h11L20 8M12 8v11M9 4v4M15 4v4"/></svg>',
    "钥匙": '<svg viewBox="0 0 24 24" fill="none" stroke="#d99a00" stroke-width="1.7"><circle cx="8" cy="12" r="4"/><path d="M12 12h9M17 12v4M20 12v3"/></svg>',
    "金卡": '<svg viewBox="0 0 24 24" fill="none" stroke="#c2410c" stroke-width="1.7"><rect x="3" y="6" width="18" height="12" rx="2"/><path d="M3 10h18"/></svg>',
    "进度": '<svg viewBox="0 0 24 24" fill="none" stroke="#2f9e64" stroke-width="1.7" stroke-linejoin="round"><path d="M5 21V4M5 5h11l-2 3 2 3H5"/></svg>'
  };
  var RW_ORDER = ["图纸", "金币", "蓝币", "抽包", "钥匙", "金卡", "进度"];

  function renderRewards(res) {
    var auto = tierRewardSummary(res);
    var map = {}, order = [];

    function add(name, got, total) {
      var key = (name.indexOf("图纸") === 0) ? "图纸" : name;
      if (!map[key]) { map[key] = { got: 0, total: 0 }; order.push(key); }
      map[key].got += got;
      map[key].total += total;
    }

    (EV.rewards || []).forEach(function (r) {
      var a = auto[r.name];
      if (a) { add(r.name, a.got, a.total); return; }
      if (r.type === "cond") { add(r.name, Math.min(res.cond, r.total), r.total); return; }
      if (Array.isArray(r.steps) && r.steps.length) {
        var cur = r.steps.reduce(function (acc, s) {
          return (s.at <= res.cond) ? acc + (s.amount || 0) : acc;
        }, 0);
        add(r.name, cur, r.total);
      }
      // 没有数据的奖励不显示成空块
    });

    Object.keys(auto).forEach(function (name) {
      add(name, auto[name].got, auto[name].total);
    });

    // 里程碑奖励也算进总览：条件到了就算已得
    (EV.milestones || []).forEach(function (m) {
      (m.items || []).forEach(function (it) {
        var key = IO.rewardKey(it);
        add(key, (res.cond >= m.at) ? (it.amount || 0) : 0, it.amount || 0);
      });
    });

    order.sort(function (a, b) {
      var ia = RW_ORDER.indexOf(a), ib = RW_ORDER.indexOf(b);
      if (ia < 0) ia = 99;
      if (ib < 0) ib = 99;
      return ia - ib;
    });

    var h = order.slice(0, 8).map(function (name) {
      var m = map[name];
      var icon = RW_ICON[name] ||
        '<svg viewBox="0 0 24 24" fill="none" stroke="#98a2b3" stroke-width="1.7"><circle cx="12" cy="12" r="8"/></svg>';
      var tail = (m.total && m.total !== m.got) ? ' <em>/' + compactNum(m.total) + "</em>" : "";
      return '<div class="ev-tile">' + icon +
        "<b>" + compactNum(m.got) + "</b>" +
        "<span>" + esc(name) + tail + "</span></div>";
    }).join("");

    $("rewards").innerHTML = h;
    $("rewardHint").textContent = "";

    var card = $("rewardsCard");
    if (card) card.style.display = h ? "" : "none";
  }

  function renderProgress(res) {
    if (!res.rows.length) {
      $("progress").innerHTML = '<div class="ev-empty">暂无特赛数据</div>';
      $("blockNote").innerHTML = "";
      if ($("stageCount")) $("stageCount").textContent = "";
      return;
    }
    if ($("stageCount")) $("stageCount").textContent = "共 " + res.rows.length + " 个阶段";

    $("progress").innerHTML = res.rows.map(function (r) {
      var empty = r.status === "empty";
      var pct = r.total ? (r.got / r.total) * 100 : 0;
      var dotCls = r.status === "done" ? "done" : (r.status === "partial" ? "part" : "");
      var star = (r.car && r.star > 0 && r.star < 90) ? " " + r.star + "★" : "";
      return '<div class="ev-stage ' + r.status + (r.status === "locked" ? " locked" : "") + '">' +
        '<span class="ev-dot ' + dotCls + '">' + r.no + "</span>" +
        '<span class="ev-smain"><b>阶段 ' + r.no + "</b><small>" + esc(r.label || "") + star + "</small></span>" +
        '<span class="ev-flag">' +
          (r.peak ? '<span class="ev-peak">巅峰</span>' : "") +
          (r.trial ? '<span class="ev-trial">试驾 ' + r.trialStar + "★</span>" : "") +
        "</span>" +
        '<div class="ev-sbar"><i style="width:' + pct.toFixed(1) + '%"></i></div>' +
        '<span class="ev-snum">' + (empty ? "—" : r.got + "/" + r.total) + "</span>" +
      "</div>";
    }).join("");

    $("blockNote").innerHTML = "";
  }

  /* 打通这个阶段需要多少星（最后一档已知星级） */
  function needStarOf(gains) {
    var last = -1;
    for (var i = 0; i < gains.length; i++) { if (gains[i] != null) last = i; }
    return last + 1;
  }

  /* 升车建议 = 通关清单：要打通（含最后一个阶段）还差哪些车、要到几星 */
  function renderAdvice(res) {
    var card = $("advice").closest(".ev-card") || $("adviceCard");

    if (!EV.cars.length || !EV.stages.length) {
      $("advice").innerHTML = "";
      if (card) card.style.display = "none";
      return;
    }
    if (card) card.style.display = "";

    var byCar = {};
    var lastStage = 0;

    res.rows.forEach(function (r) {
      if (r.no > lastStage) lastStage = r.no;
      if (r.status === "done" || r.status === "empty" || !r.car) return;

      var need = r.minStar || 1;   // 能打这个阶段的最低星级（不是打满）

      var owned = !!ST.owned[r.car];
      var cur = owned ? (ST.stars[r.car] || 0) : 0;
      if (r.trial) cur = Math.max(cur, r.trialStar || 0);
      if (cur >= need) return;              // 试驾星级或自有星级已经够

      var m = byCar[r.car];
      if (!m) {
        m = byCar[r.car] = { label: r.label, need: 0, cur: cur, owned: owned, stages: [] };
      }
      if (need > m.need) m.need = need;
      m.cur = Math.max(m.cur, cur);
      m.owned = m.owned || owned;
      if (m.stages.indexOf(r.no) < 0) m.stages.push(r.no);
    });

    var items = Object.keys(byCar).map(function (id) { return byCar[id]; });
    items.sort(function (a, b) { return a.stages[0] - b.stages[0]; });

    var h = "";
    if (!items.length) {
      h = '<div class="ev-hint" style="padding:0">当前车库已经能打通全部 ' + res.rows.length + " 个阶段。</div>";
    } else {
      h = items.map(function (m) {
        var st = m.stages.slice().sort(function (a, b) { return a - b; }).join("、");
        return '<div class="adv">' +
          '<span class="who"><b>' + esc(m.label) + "</b> · 阶段 " + st + "</span>" +
          '<span class="gain">' + (m.owned ? "需 " : "解锁并 ") + m.need + "★</span>" +
        "</div>";
      }).join("");
      h += '<div class="ev-hint">备齐后可以打到阶段 ' + lastStage + "（最后一个阶段）</div>";
    }
    $("advice").innerHTML = h;
  }

  /* ---------- 数据面板 ---------- */

  function fillCsv() {
    var c = IO.toCsv(EV);
    $("csvCond").value = c.conditions;
    $("csvRew").value = c.rewards;
    $("csvMile").value = c.milestones;
    $("csvCars").value = c.cars;
    $("evName").value = EV.event || "";
    $("evTotal").value = EV.totalConditions || "";
    doParse();
  }

  function renderPreview(r) {
    var h = "";
    h += '<div class="pv-sum">阶段 <b>' + r.ev.stages.length + "</b> · 车辆 <b>" + r.ev.cars.length +
      "</b> · 奖励 <b>" + (r.ev.stageRewards || []).length + "</b> 条 · 里程碑 <b>" +
      (r.ev.milestones || []).length + "</b> · 合计 <b>" + r.sum + "</b> 条件（官方 " +
      r.ev.totalConditions + "）</div>";

    if (r.errors.length) {
      h += '<div class="pv-err">' + r.errors.map(function (e) { return "<div>" + esc(e) + "</div>"; }).join("") + "</div>";
    }
    if (r.warnings.length) {
      h += '<div class="pv-warn">' + r.warnings.map(function (e) { return "<div>" + esc(e) + "</div>"; }).join("") + "</div>";
    }
    if (r.ev.stages.length) {
      h += '<div class="pv-table"><div class="pv-row head">' +
        '<span class="pv-no">阶段</span><span>主工具车</span>' +
        '<span class="pv-curve">1★~6★ 累计条件</span><span class="pv-unlock">解锁</span></div>';
      r.ev.stages.forEach(function (s) {
        var car = r.ev.cars.filter(function (c) { return c.id === s.car; })[0];
        var curve = (s.gains || []).map(function (v) { return v == null ? "—" : v; }).join("/");
        h += '<div class="pv-row">' +
          '<span class="pv-no">' + s.no + "</span>" +
          '<span class="pv-car">' + esc(car ? car.short : (s.carLabel || "—")) + "</span>" +
          '<span class="pv-curve">' + curve + "</span>" +
          '<span class="pv-unlock">' + s.unlock + "</span>" +
          "</div>";
      });
      h += "</div>";
    }
    $("csvPreview").innerHTML = h;
    $("btnApplyCsv").disabled = r.errors.length > 0;
  }

  function doParse() {
    lastParse = IO.build({
      name: $("evName").value.trim(),
      total: $("evTotal").value,
      carsText: $("csvCars").value,
      condText: $("csvCond").value,
      rewardText: $("csvRew").value,
      mileText: $("csvMile").value,
      base: EV
    });
    renderPreview(lastParse);
    $("csvMsg").textContent = lastParse.errors.length
      ? "有 " + lastParse.errors.length + " 处要修的问题，改完再点预览"
      : "检查无误，可以点「应用」";
  }

  function applyCsv() {
    if (!lastParse || lastParse.errors.length) return;
    var oldEv = EV, oldST = ST;
    EV = lastParse.ev;
    ST = carryState(oldST, oldEv, EV);
    saveEvent();

    $("dataBox").value = JSON.stringify(EV, null, 2);
    $("evName").value = EV.event;
    $("evTotal").value = EV.totalConditions;
    render();
    $("csvMsg").textContent = "已应用：" + EV.event + "（" + EV.stages.length + " 阶段 / " + EV.totalConditions + " 条件）";
  }

  /* ---------- 事件 ---------- */

  function bind() {
    $("btnClear").addEventListener("click", function () {
      ST = CALC.blankState(EV);
      render();
    });

    $("btnMax").addEventListener("click", function () {
      ST = CALC.maxState(EV);
      render();
    });

    function carById(id) {
      for (var ci = 0; ci < EV.cars.length; ci++) {
        if (EV.cars[ci].id === id) return EV.cars[ci];
      }
      return null;
    }

    $("garage").addEventListener("click", function (e) {
      var star = e.target.closest("[data-star]");
      if (star) {
        var box = star.closest(".ev-car");
        var id = box && box.getAttribute("data-car");
        if (!id) return;
        var car = carById(id);
        var isKey = !!(car && car.key);
        var n = parseInt(star.getAttribute("data-star"), 10);
        var cur = ST.stars[id] || 0;
        ST.stars[id] = (cur === n) ? n - 1 : n;
        // 图纸车：有星就有车（1★ 表示已经用图纸解锁）
        // 钥匙车：解锁只看钥匙，星级不参与，这里不动 owned
        if (!isKey) ST.owned[id] = ST.stars[id] >= 1;
        render();
        return;
      }
      var own = e.target.closest("[data-own]");
      if (own) {
        var cid = own.getAttribute("data-own");
        var kc = carById(cid);
        var keyCar = !!(kc && kc.key);
        var isOn = own.classList.contains("on");
        ST.owned[cid] = !isOn;
        if (keyCar) {
          // 钥匙车：解锁靠钥匙，解锁后至少是 1★；星级本身不动
          if (!isOn) ST.stars[cid] = Math.max(1, ST.stars[cid] || 1);
        } else {
          ST.stars[cid] = isOn ? 0 : Math.max(1, ST.stars[cid] || 1);
        }
        render();
        return;
      }
      var detail = e.target.closest("[data-detail]");
      if (detail) {
        openCarDetail(detail.getAttribute("data-detail"));
      }
    });

    // 车辆详情弹层
    $("carSheet").addEventListener("click", function (e) {
      if (e.target.closest("[data-close]")) $("carSheet").hidden = true;
    });

    // 数据面板已移除（改用「特赛数据管理」），有元素时才绑定旧逻辑
    if (!$("dataPanel")) return;

    // 打开数据面板时，如果还空着就自动填入当前数据
    $("dataPanel").addEventListener("toggle", function () {
      if (!$("dataPanel").open) return;
      if ($("csvCond").value.trim()) return;
      fillCsv();
    });

    $("btnFill").addEventListener("click", fillCsv);
    $("btnParse").addEventListener("click", doParse);
    $("btnApplyCsv").addEventListener("click", applyCsv);

    [$("csvCond"), $("csvRew"), $("csvMile"), $("csvCars"), $("evName"), $("evTotal")].forEach(function (el) {
      el.addEventListener("input", function () {
        $("btnApplyCsv").disabled = true;
        $("csvMsg").textContent = "内容有改动，点「预览」检查一下";
      });
    });

    $("btnApply").addEventListener("click", function () {
      try {
        var obj = JSON.parse($("dataBox").value);
        if (!obj || !Array.isArray(obj.stages) || !Array.isArray(obj.cars)) {
          throw new Error("缺少 stages 或 cars 数组");
        }
        var oldEv = EV, oldST = ST;
        EV = obj;
        ST = carryState(oldST, oldEv, EV);
        saveEvent();
        $("evName").value = EV.event || "";
        $("evTotal").value = EV.totalConditions || "";
        render();
        $("dataMsg").textContent = "已应用 JSON：" + (EV.event || "未命名") + "，" + EV.stages.length + " 个阶段";
      } catch (err) {
        $("dataMsg").textContent = "解析失败：" + err.message;
      }
    });

    $("btnExport").addEventListener("click", function () {
      try {
        var blob = new Blob([JSON.stringify(EV, null, 2)], { type: "application/json" });
        var a = document.createElement("a");
        a.href = URL.createObjectURL(blob);
        a.download = (EV.event || "event") + ".json";
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        $("dataMsg").textContent = "已导出";
      } catch (err) {
        $("dataMsg").textContent = "导出失败：" + err.message;
      }
    });

    $("btnImport").addEventListener("click", function () { $("fileInput").click(); });

    $("fileInput").addEventListener("change", function (e) {
      var f = e.target.files && e.target.files[0];
      if (!f) return;
      var fr = new FileReader();
      fr.onload = function () {
        try {
          var obj = JSON.parse(fr.result);
          if (!obj || !Array.isArray(obj.stages) || !Array.isArray(obj.cars)) {
            throw new Error("这不是一份特赛数据（缺少 stages / cars）");
          }
          var oldEv = EV, oldST = ST;
          EV = obj;
          ST = carryState(oldST, oldEv, EV);
          saveEvent();
          $("dataBox").value = JSON.stringify(EV, null, 2);
          $("evName").value = EV.event || "";
          $("evTotal").value = EV.totalConditions || "";
          render();
          $("dataMsg").textContent = "已导入：" + (EV.event || "未命名");
        } catch (err) {
          $("dataMsg").textContent = "导入失败：" + err.message;
        }
      };
      fr.readAsText(f, "utf-8");
      e.target.value = "";
    });
  }

  function init() {
    // 优先用数据管理面板保存的数据；其次用本页 CSV 应用过的数据；都没有就空状态
    var be = readBackend();
    EV = be || readLocalEvent() || emptyEvent();

    ST = loadState();
    if (/[?&]full=1/.test(location.search)) ST = CALC.maxState(EV);
    if ($("dataBox")) {
      $("dataBox").value = JSON.stringify(EV, null, 2);
      $("evName").value = EV.event || "";
      $("evTotal").value = EV.totalConditions || "";
    }
    bind();
    render();

    if (location.hash === "#data" && $("dataPanel")) {
      $("dataPanel").open = true;
      if (!$("csvCond").value.trim()) fillCsv();
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
