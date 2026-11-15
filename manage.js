(function () {
  "use strict";

  var CARS = (window.A9_CARS && window.A9_CARS.cars) || [];
  var TYPES = ["图纸", "金币", "蓝币", "金卡", "抽包", "其他"];
  var MAXSTAR = 6;
  var DRAFT = "a9.manage.v1";
  var SAVED = "a9.manage.saved";

  var ICON = {
    "图纸": '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"><path d="M4 1.8h5.4L13 5.4v8.8H4z"/><path d="M9.2 1.8v3.6H13"/></svg>',
    "金币": '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.3"><ellipse cx="8" cy="4.6" rx="4.8" ry="2.1"/><path d="M3.2 4.6v3c0 1.2 2.1 2.1 4.8 2.1s4.8-.9 4.8-2.1v-3"/><path d="M3.2 7.6v3c0 1.2 2.1 2.1 4.8 2.1s4.8-.9 4.8-2.1v-3"/></svg>',
    "蓝币": '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.3"><circle cx="8" cy="8" r="5.6"/><path d="M8 4.6v6.8M5.8 6.2h4.4M5.8 9.8h4.4"/></svg>',
    "金卡": '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4"><rect x="1.8" y="3.4" width="12.4" height="9.2" rx="1.7"/><path d="M1.8 6.6h12.4"/></svg>',
    "抽包": '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"><path d="M2.6 5.6h10.8v7.8H2.6z"/><path d="M2.6 5.6 4.6 2.6h6.8l2 3M8 5.6v7.8M6 2.6v3M10 2.6v3"/></svg>',
    "其他": '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4"><circle cx="8" cy="8" r="5.8"/><path d="M8 7.4v3.4M8 5.3v.2" stroke-linecap="round"/></svg>'
  };
  var KEY = { "图纸": "bp", "金币": "coin", "蓝币": "blue", "金卡": "card", "抽包": "pack", "其他": "other" };

  var state = null;
  var collapsed = {};
  var rwBox = null;   // 当前正在编辑奖励的对象（星级行 或 里程碑）
  var rwType = "图纸";
  var rwCar = "";
  var carPick = { kind: "stage", i: -1 };

  function $(id) { return document.getElementById(id); }
  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  /* ---------- 数据 ---------- */
  function mkStar(n) { return { star: n, cond: 0, rewards: [] }; }
  function mkStage(no) {
    return {
      stage: no, unlock: 0, car: "",
      isTrial: false, trialStar: 1,
      stars: [mkStar(1), mkStar(2)]
    };
  }
  function mkMs() { return { at: 0, rewards: [] }; }
  function defaultState() { return { stages: [mkStage(1)], milestones: [] }; }

  /* 兼容旧结构：reward 对象 / qty 字段 */
  function normalizeRewards(row) {
    if (Array.isArray(row.rewards)) return row.rewards;
    if (row.reward) {
      var r = row.reward;
      if (r.qty != null && r.amount == null) r.amount = r.qty;
      delete r.qty;
      row.rewards = [r];
    } else {
      row.rewards = [];
    }
    delete row.reward;
    return row.rewards;
  }

  function rewardsOf(row) {
    if (!row) return [];
    return normalizeRewards(row);
  }

  function normalizeStage(s) {
    s.unlock = Number(s.unlock) || 0;
    s.isTrial = !!s.isTrial;
    s.trialStar = Number(s.trialStar) || 1;
    (s.stars || []).forEach(normalizeRewards);
    return s;
  }

  /* 同时兼容旧数组和新 { stages, milestones } 两种存档 */
  function normalizeState(d) {
    var stages = Array.isArray(d) ? d : (d && d.stages) || [];
    var miles = (!Array.isArray(d) && d && d.milestones) || [];
    stages.forEach(normalizeStage);
    miles.forEach(function (m) {
      m.at = Number(m.at) || 0;
      normalizeRewards(m);
    });
    return { stages: stages, milestones: miles };
  }

  function load() {
    try {
      var raw = localStorage.getItem(DRAFT);
      if (raw) {
        var st = normalizeState(JSON.parse(raw));
        if (st.stages.length) return st;
      }
    } catch (e) {}
    return defaultState();
  }

  function persist() {
    try { localStorage.setItem(DRAFT, JSON.stringify(state)); } catch (e) {}
  }

  /* 导出 */
  function rewardsOut(box) {
    return rewardsOf(box).map(function (rw) {
      var o = { type: rw.type };
      if (rw.type === "图纸" && rw.carName) o.carName = rw.carName;
      o.amount = rw.amount;
      return o;
    });
  }

  function collect() {
    return {
      stages: state.stages.map(function (s) {
        return {
          stage: s.stage,
          unlock: s.unlock || 0,
          isTrial: !!s.isTrial,
          trialStar: Number(s.trialStar) || 1,
          car: s.car || null,
          stars: s.stars.slice().sort(function (a, b) { return a.star - b.star; }).map(function (r) {
            return { star: r.star, cond: r.cond, rewards: rewardsOut(r) };
          })
        };
      }),
      milestones: (state.milestones || []).map(function (m) {
        return { at: m.at || 0, rewards: rewardsOut(m) };
      })
    };
  }

  /* ---------- 渲染 ---------- */
  function starSvg() {
    return '<svg viewBox="0 0 16 16" fill="currentColor"><path d="M8 1.6 10 6l4.6.6-3.4 3.2.9 4.6L8 12.2 3.9 14.4l.9-4.6L1.4 6.6 6 6z"/></svg>';
  }

  function condBtnHtml(row, i, j) {
    return '<div class="cond-field">' +
      '<input class="cond-input" type="number" inputmode="numeric" min="0" step="1" ' +
        'value="' + (row.cond || 0) + '" data-i="' + i + '" data-j="' + j + '" aria-label="条件数">' +
      '<button class="cond-caret" data-act="cond" type="button" aria-label="从列表选择">▾</button>' +
    "</div>";
  }

  function qtyText(q) {
    if (q >= 10000) {
      var w = q / 10000;
      return (w % 1 === 0 ? w : w.toFixed(1)) + "万";
    }
    return String(q);
  }

  function shortCar(name) {
    if (!name) return "";
    var hit = null;
    for (var i = 0; i < CARS.length; i++) {
      if (CARS[i].name === name) { hit = CARS[i]; break; }
    }
    if (hit && hit.alias) return hit.alias;
    return name.length > 9 ? name.slice(0, 8) + "…" : name;
  }

  function amountText(rw) {
    if (rw.type === "金币" || rw.type === "蓝币") return qtyText(rw.amount);
    return "x" + rw.amount;
  }

  function rewardSlotHtml(row) {
    var list = rewardsOf(row);
    if (!list.length) {
      return '<button class="rw-btn" data-act="reward" type="button">＋ 奖励</button>';
    }
    var first = list[0];
    var inner;
    if (first.type === "图纸") {
      inner = "<b>x" + first.amount + '</b><span class="t">' + esc(shortCar(first.carName)) + "</span>";
    } else if (first.type === "金币" || first.type === "蓝币") {
      inner = "<b>" + qtyText(first.amount) + "</b>";
    } else {
      inner = "<b>x" + first.amount + "</b>";
    }
    var more = list.length > 1 ? '<i class="more">+' + (list.length - 1) + "</i>" : "";

    var title = list.map(function (r) {
      return r.type + (r.carName ? "·" + shortCar(r.carName) : "") + " " + amountText(r);
    }).join(" / ");

    return '<button class="rw-tag rw-' + (KEY[first.type] || "other") + '" data-act="reward" type="button" title="' +
      esc(title) + '">' + (ICON[first.type] || ICON["其他"]) + inner + more + "</button>";
  }

  function nextStarOf(stars) {
    for (var n = 1; n <= MAXSTAR; n++) {
      var has = false;
      for (var i = 0; i < stars.length; i++) { if (stars[i].star === n) { has = true; break; } }
      if (!has) return n;
    }
    return 0;
  }

  function trialOptions(cur) {
    var h = "";
    for (var n = 1; n <= MAXSTAR; n++) {
      h += '<option value="' + n + '"' + (Number(cur) === n ? " selected" : "") + ">" + n + "★</option>";
    }
    return h;
  }

  function stageHtml(s, i) {
    var rows = s.stars.map(function (r, j) {
      return '<div class="srow" data-i="' + i + '" data-j="' + j + '">' +
        '<span class="srow-star">' + starSvg() + "<span>" + r.star + "★</span></span>" +
        condBtnHtml(r, i, j) +
        '<div class="rw-slot">' + rewardSlotHtml(r) + "</div>" +
        '<button class="del" data-act="delstar" type="button" aria-label="删除该星级">×</button>' +
      "</div>";
    }).join("");

    var canAddStar = nextStarOf(s.stars) > 0;

    return '<section class="stage' + (collapsed[i] ? " closed" : "") + '" data-i="' + i + '">' +
      '<div class="stage-head">' +
        '<div class="stage-title" data-act="toggle">阶段 ' + s.stage + ' <span class="chev">▾</span></div>' +
        '<button class="car-btn' + (s.car ? "" : " ph") + '" data-act="car" type="button">' +
          '<span class="txt">' + esc(s.car || "选择车辆") + '</span><span class="caret">▼</span>' +
        "</button>" +
      "</div>" +
      '<div class="stage-trial">' +
        '<button class="trial-chk' + (s.isTrial ? " on" : "") + '" data-act="trial" type="button">' +
          '<span class="box">' + (s.isTrial ? "✓" : "") + "</span>免费试驾" +
        "</button>" +
        (s.isTrial
          ? '<select class="trial-star" data-i="' + i + '">' + trialOptions(s.trialStar) + "</select>" +
            '<span class="trial-hint">系统试驾星级</span>'
          : "") +
      "</div>" +
      '<div class="stage-unlock">' +
        '<span class="u-label">前置解锁条件</span>' +
        '<input class="unlock-input" type="number" inputmode="numeric" min="0" step="1" ' +
          'value="' + (s.unlock || 0) + '" data-i="' + i + '" aria-label="前置解锁条件">' +
      "</div>" +
      '<div class="stage-rows">' + rows + "</div>" +
      (canAddStar
        ? '<div class="stage-foot"><button class="add-star" data-act="addstar" type="button">＋ 增加下一星级</button></div>'
        : "") +
    "</section>";
  }

  function render() {
    state.stages.forEach(function (s) {
      s.stars.sort(function (a, b) { return a.star - b.star; });
    });
    $("stages").innerHTML = state.stages.map(stageHtml).join("");
    renderMs();
    persist();
  }

  function renderMs() {
    var list = state.milestones || [];
    $("msList").innerHTML = list.map(function (m, k) {
      return '<div class="srow ms-row" data-k="' + k + '">' +
        '<span class="srow-star">条件</span>' +
        '<input class="ms-at" type="number" min="0" step="1" value="' + (m.at || 0) +
          '" data-k="' + k + '" aria-label="条件数">' +
        '<div class="rw-slot">' + rewardSlotHtml(m) + "</div>" +
        '<button class="del" data-act="delms" type="button" aria-label="删除该里程碑">×</button>' +
      "</div>";
    }).join("") || '<div class="rw-empty">还没有里程碑，点下面添加</div>';
  }

  /* ---------- 车辆选择 ---------- */
  function carsSource() {
    if (CARS.length) return CARS.map(function (c) { return { name: c.name, alias: c.alias || "" }; });
    var ev = window.A9_EVENT;
    if (ev && ev.cars) return ev.cars.map(function (c) { return { name: c.name, alias: c.short || "" }; });
    return [];
  }

  function renderCarList(q) {
    var all = carsSource();
    var list = all;
    var key = String(q || "").trim().toLowerCase();
    if (key) {
      list = list.filter(function (c) {
        return c.name.toLowerCase().indexOf(key) >= 0 || String(c.alias).toLowerCase().indexOf(key) >= 0;
      });
    }
    $("carCount").textContent = key
      ? "找到 " + list.length + " 台（共 " + all.length + " 台）"
      : "共 " + all.length + " 台";
    $("carList").innerHTML = list.length
      ? list.map(function (c) {
          return '<button class="car-item" data-act="pickcar" data-name="' + esc(c.name) + '" type="button">' +
            "<span>" + esc(c.name) + "</span>" +
            (c.alias ? '<span class="alias">' + esc(c.alias) + "</span>" : "") +
          "</button>";
        }).join("")
      : '<div class="car-item">没有匹配的车</div>';
  }

  function openCarSheet(kind, i) {
    carPick = { kind: kind, i: i };
    $("carSearch").value = "";
    renderCarList("");
    if (kind === "reward") $("rwSheet").hidden = true;
    $("carSheet").hidden = false;
  }

  function closeCarSheet() {
    $("carSheet").hidden = true;
    if (carPick.kind === "reward") {
      $("rwSheet").hidden = false;
      var p = $("rwSheet").querySelector(".panel");
      if (p) p.scrollTop = 0;
    }
  }

  /* ---------- 奖励弹窗 ---------- */
  function paintTypes() {
    $("rwTypes").innerHTML = TYPES.map(function (t) {
      return '<button class="seg' + (t === rwType ? " on" : "") + '" data-act="type" data-t="' + t + '" type="button">' + t + "</button>";
    }).join("");
    $("rwCarRow").hidden = (rwType !== "图纸");
    $("rwCarBtn").innerHTML = '<span class="txt">' + esc(rwCar || "选择车辆") + '</span><span class="caret">▼</span>';
    $("rwCarBtn").classList.toggle("ph", !rwCar);
  }

  function paintRwList() {
    var list = rewardsOf(rwBox);
    $("rwList").innerHTML = list.length
      ? list.map(function (r, k) {
          return '<div class="rw-item">' +
            '<span class="rw-ic rw-' + (KEY[r.type] || "other") + '">' + (ICON[r.type] || ICON["其他"]) + "</span>" +
            '<span class="rw-desc">' + esc(r.type) +
              (r.carName ? '<i> · ' + esc(shortCar(r.carName)) + "</i>" : "") + "</span>" +
            '<b class="rw-amt">' + esc(amountText(r)) + "</b>" +
            '<button class="rw-rm" data-act="rmrw" data-k="' + k + '" type="button">✕</button>' +
          "</div>";
        }).join("")
      : '<div class="rw-empty">还没有奖励，从下面添加</div>';
  }

  function openReward(box, car) {
    rwBox = box;
    rwType = "图纸";
    rwCar = car || "";
    $("rwQty").value = "";
    paintTypes();
    paintRwList();
    $("rwSheet").hidden = false;
    var p = $("rwSheet").querySelector(".panel");
    if (p) p.scrollTop = 0;
  }

  function closeSheet(id) { $(id).hidden = true; }

  function addReward() {
    var amount = parseInt($("rwQty").value, 10);
    if (!amount || amount <= 0) { toast("数量要大于 0"); return false; }
    if (rwType === "图纸" && !rwCar) { toast("请选择图纸对应的车辆"); return false; }
    var rw = { type: rwType, amount: amount };
    if (rwType === "图纸") rw.carName = rwCar;
    rewardsOf(rwBox).push(rw);
    $("rwQty").value = "";
    paintRwList();
    render();
    $("rwQty").focus();
    return true;
  }

  /* ---------- 条件数弹窗 ---------- */
  var numTarget = { kind: "cond", i: -1, j: -1 };

  function openNumSheet(kind, i, j) {
    numTarget = { kind: kind, i: i, j: j };
    var cur = (kind === "unlock")
      ? (state.stages[i].unlock || 0)
      : state.stages[i].stars[j].cond;
    var max = Math.max(100, cur);

    $("numTitle").textContent = (kind === "unlock") ? "前置解锁条件" : "选择条件数";

    var h = "";
    for (var n = 0; n <= max; n++) {
      h += '<button class="num-item' + (n === cur ? " on" : "") +
        '" data-act="picknum" data-n="' + n + '" type="button">' +
        "<span>" + n + "</span>" + (n === cur ? '<span class="tick">✓</span>' : "") +
      "</button>";
    }
    $("numList").innerHTML = h;
    $("numModal").hidden = false;
    var sel = $("numList").querySelector(".num-item.on");
    if (sel) {
      var box = $("numList");
      box.scrollTop = sel.offsetTop - box.clientHeight / 2 + sel.offsetHeight / 2;
    }
  }

  function toast(msg) {
    var el = $("toast");
    el.textContent = msg;
    el.hidden = false;
    clearTimeout(el._t);
    el._t = setTimeout(function () { el.hidden = true; }, 1800);
  }

  /* ---------- 导出 event.js ---------- */
  function buildFileText() {
    return "window.A9_MANAGE_DATA = " + JSON.stringify(collect(), null, 2) + ";\n";
  }

  function exportFile() {
    var text = buildFileText();
    window.A9_LAST_EXPORT = text;              // 方便自动化校验
    var n = collect();
    $("expText").value = text;
    $("expTip").textContent = "event.js · " + Math.round(text.length / 1024) + " KB · " +
      n.stages.length + " 个阶段 / " + n.milestones.length + " 个里程碑 · " +
      "覆盖仓库根目录的 event.js，Vercel 约 30 秒自动上线。本地想先看效果：index.html?preview=1";
    $("expSheet").hidden = false;
  }

  function downloadExport() {
    var text = $("expText").value || buildFileText();
    var blob = new Blob([text], { type: "text/javascript;charset=utf-8" });
    var a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "event.js";
    document.body.appendChild(a);
    a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 800);
    toast("已下载 event.js");
  }

  function copyExport() {
    var el = $("expText");
    el.removeAttribute("readonly");
    el.select();
    el.setSelectionRange(0, el.value.length);
    var ok = false;
    try { ok = document.execCommand("copy"); } catch (e) { ok = false; }
    el.setAttribute("readonly", "readonly");
    if (!ok && navigator.clipboard) {
      navigator.clipboard.writeText(el.value).then(function () {
        toast("已复制全文");
      }).catch(function () { toast("复制失败，请手动全选"); });
      return;
    }
    toast(ok ? "已复制全文" : "复制失败，请手动全选");
  }

  /* ---------- 事件 ---------- */
  function bind() {
    $("stages").addEventListener("click", function (e) {
      var el = e.target.closest("[data-act]");
      if (!el) return;
      var act = el.getAttribute("data-act");
      var stageEl = el.closest(".stage");
      var i = stageEl ? Number(stageEl.getAttribute("data-i")) : -1;
      var rowEl = el.closest(".srow");
      var j = rowEl ? Number(rowEl.getAttribute("data-j")) : -1;

      if (act === "toggle") {
        collapsed[i] = !collapsed[i];
        render();
      } else if (act === "car") {
        openCarSheet("stage", i);
      } else if (act === "cond") {
        openNumSheet("cond", i, j);
      } else if (act === "trial") {
        var stg = state.stages[i];
        stg.isTrial = !stg.isTrial;
        if (!stg.trialStar) stg.trialStar = 1;
        render();
      } else if (act === "reward") {
        openReward(state.stages[i].stars[j], state.stages[i].car);
      } else if (act === "delstar") {
        var st = state.stages[i];
        if (st.stars.length <= 1) { toast("至少保留一个星级"); return; }
        st.stars.splice(j, 1);
        render();
      } else if (act === "addstar") {
        var s = state.stages[i];
        var next = nextStarOf(s.stars);
        if (!next) return;
        s.stars.push(mkStar(next));
        render();
      }
    });

    $("stages").addEventListener("input", function (e) {
      var inp = e.target.closest(".unlock-input");
      if (inp) {
        var i0 = Number(inp.getAttribute("data-i"));
        if (!state.stages[i0]) return;
        var v0 = parseInt(inp.value, 10);
        state.stages[i0].unlock = (isNaN(v0) || v0 < 0) ? 0 : v0;
        persist();
        return;
      }
      var ci = e.target.closest(".cond-input");
      if (ci) {
        var i1 = Number(ci.getAttribute("data-i"));
        var j1 = Number(ci.getAttribute("data-j"));
        var row = state.stages[i1] && state.stages[i1].stars[j1];
        if (!row) return;
        var v1 = parseInt(ci.value, 10);
        row.cond = (isNaN(v1) || v1 < 0) ? 0 : v1;
        persist();
      }
    });

    $("stages").addEventListener("change", function (e) {
      var inp = e.target.closest(".unlock-input");
      if (inp) {
        inp.value = state.stages[Number(inp.getAttribute("data-i"))].unlock || 0;
        return;
      }
      var ci = e.target.closest(".cond-input");
      if (ci) {
        var row = state.stages[Number(ci.getAttribute("data-i"))].stars[Number(ci.getAttribute("data-j"))];
        ci.value = row ? (row.cond || 0) : 0;
      }
    });

    $("stages").addEventListener("change", function (e) {
      var sel = e.target.closest(".trial-star");
      if (!sel) return;
      var i = Number(sel.getAttribute("data-i"));
      if (state.stages[i]) {
        state.stages[i].trialStar = Number(sel.value) || 1;
        persist();
      }
    });

    $("addStage").addEventListener("click", function () {
      state.stages.push(mkStage(state.stages.length + 1));
      render();
      window.scrollTo({ top: document.body.scrollHeight, behavior: "smooth" });
    });

    // 里程碑
    $("addMs").addEventListener("click", function () {
      if (!state.milestones) state.milestones = [];
      state.milestones.push(mkMs());
      render();
      var rows = $("msList").querySelectorAll(".ms-at");
      if (rows.length) rows[rows.length - 1].focus();
    });

    $("msList").addEventListener("click", function (e) {
      var del = e.target.closest('[data-act="delms"]');
      if (del) {
        var k = Number(del.closest(".ms-row").getAttribute("data-k"));
        state.milestones.splice(k, 1);
        render();
        return;
      }
      var rw = e.target.closest('[data-act="reward"]');
      if (rw) {
        var kk = Number(rw.closest(".ms-row").getAttribute("data-k"));
        openReward(state.milestones[kk], "");
      }
    });

    $("msList").addEventListener("input", function (e) {
      var at = e.target.closest(".ms-at");
      if (!at) return;
      var k = Number(at.getAttribute("data-k"));
      if (!state.milestones[k]) return;
      var v = parseInt(at.value, 10);
      state.milestones[k].at = (isNaN(v) || v < 0) ? 0 : v;
      persist();
    });

    $("msList").addEventListener("change", function (e) {
      var at = e.target.closest(".ms-at");
      if (!at) return;
      var k = Number(at.getAttribute("data-k"));
      if (state.milestones[k]) at.value = state.milestones[k].at || 0;
    });

    // 车辆弹层
    $("carSheet").addEventListener("click", function (e) {
      var pick = e.target.closest('[data-act="pickcar"]');
      if (pick) {
        var name = pick.getAttribute("data-name");
        $("carSheet").hidden = true;
        if (carPick.kind === "stage") {
          state.stages[carPick.i].car = name;
          render();
        } else {
          rwCar = name;
          $("rwSheet").hidden = false;
          paintTypes();
        }
        return;
      }
      if (e.target.closest('[data-close="car"]')) closeCarSheet();
    });
    $("carSearch").addEventListener("input", function (e) { renderCarList(e.target.value); });

    // 奖励弹层
    $("rwSheet").addEventListener("click", function (e) {
      var seg = e.target.closest('[data-act="type"]');
      if (seg) {
        rwType = seg.getAttribute("data-t");
        paintTypes();
        return;
      }
      if (e.target.closest("#rwCarBtn")) {
        openCarSheet("reward", -1);
        return;
      }
      if (e.target.closest("#rwAdd")) {
        addReward();
        return;
      }
      var rm = e.target.closest('[data-act="rmrw"]');
      if (rm) {
        var k = Number(rm.getAttribute("data-k"));
        rewardsOf(rwBox).splice(k, 1);
        paintRwList();
        render();
        return;
      }
      if (e.target.closest('[data-close="rw"]')) {
        closeSheet("rwSheet");
        render();
      }
    });

    // 条件数弹窗
    $("numModal").addEventListener("click", function (e) {
      var pick = e.target.closest('[data-act="picknum"]');
      if (pick) {
        var n = Number(pick.getAttribute("data-n"));
        if (numTarget.kind === "unlock") {
          state.stages[numTarget.i].unlock = n;
        } else {
          state.stages[numTarget.i].stars[numTarget.j].cond = n;
        }
        $("numModal").hidden = true;
        render();
        return;
      }
      if (e.target.closest('[data-close="num"]')) $("numModal").hidden = true;
    });

    $("save").addEventListener("click", function () {
      var data = collect();
      try { localStorage.setItem(SAVED, JSON.stringify(data)); } catch (err) {}
      var msCount = data.milestones.length;
      console.log("特赛数据（" + data.stages.length + " 个阶段 / " + msCount + " 个里程碑）:",
        JSON.stringify(data, null, 2));
      toast("已保存 · " + data.stages.length + " 阶段" + (msCount ? " · " + msCount + " 里程碑" : ""));
    });

    $("export").addEventListener("click", exportFile);
    $("expDl").addEventListener("click", downloadExport);
    $("expCopy").addEventListener("click", copyExport);
    $("expSheet").addEventListener("click", function (e) {
      if (e.target.closest("[data-close]")) $("expSheet").hidden = true;
    });

    $("reuse").addEventListener("click", function () {
      var raw = null;
      try { raw = localStorage.getItem(SAVED); } catch (e) {}
      if (!raw) { toast("还没有保存过数据"); return; }
      try {
        var st = normalizeState(JSON.parse(raw));
        if (!st.stages.length) { toast("上期数据是空的"); return; }
        state = st;
        collapsed = {};
        render();
        toast("已载入上期数据");
      } catch (e) { toast("上期数据损坏"); }
    });
  }

  /* ---------- 启动 ---------- */
  state = load();
  bind();
  render();

  // 调试：?demo=1 / &sheet=rw / rwcar / rwpick / car / num / unlock
  if (/[?&]demo=1/.test(location.search)) {
    state = {
      stages: [{
        stage: 1,
        unlock: 25,
        isTrial: true,
        trialStar: 3,
        car: "Mercedes-Benz Vision One-Eleven",
        stars: [
          { star: 1, cond: 2, rewards: [
            { type: "图纸", carName: "Mercedes-Benz Vision One-Eleven", amount: 5 },
            { type: "金币", amount: 50000 }
          ] },
          { star: 2, cond: 3, rewards: [{ type: "蓝币", amount: 800 }] },
          { star: 3, cond: 4, rewards: [] }
        ]
      }],
      milestones: [
        { at: 150, rewards: [{ type: "金币", amount: 500000 }] },
        { at: 300, rewards: [{ type: "钥匙", amount: 1 }] }
      ]
    };
    render();
    var pre = document.createElement("pre");
    pre.style.cssText = "margin:14px 0 0;padding:12px;background:#17243a;color:#7ef0a8;" +
      "font:11px/1.6 Consolas,monospace;border-radius:12px;white-space:pre-wrap;word-break:break-all";
    pre.textContent = JSON.stringify(collect(), null, 2);
    document.querySelector(".add-stage-wrap").appendChild(pre);
  }

  // 调试：?demo=1&stages=4 复制成 4 个阶段看双列效果
  var stageCount = location.search.match(/[?&]stages=(\d)/);
  if (stageCount) {
    var n = Math.max(1, Math.min(20, Number(stageCount[1])));
    var base = JSON.parse(JSON.stringify(state.stages[0]));
    state.stages = [];
    for (var k = 1; k <= n; k++) {
      var cp = JSON.parse(JSON.stringify(base));
      cp.stage = k;
      state.stages.push(cp);
    }
    render();
    var old = document.querySelector(".add-stage-wrap pre");
    if (old) old.textContent = JSON.stringify(collect(), null, 2);
  }

  if (/[?&]sheet=rwpick/.test(location.search)) {
    openReward(state.stages[0].stars[0], state.stages[0].car);
    openCarSheet("reward", -1);
    setTimeout(function () {
      var item = document.querySelector("#carList .car-item");
      if (item) item.click();
    }, 120);
  } else if (/[?&]sheet=rwcar/.test(location.search)) {
    openReward(state.stages[0].stars[0], state.stages[0].car);
    openCarSheet("reward", -1);
  } else if (/[?&]sheet=rw/.test(location.search)) {
    openReward(state.stages[0].stars[0], state.stages[0].car);
  } else if (/[?&]sheet=ms/.test(location.search)) {
    if (!state.milestones.length) state.milestones.push(mkMs());
    render();
    openReward(state.milestones[0], "");
  } else if (/[?&]sheet=car/.test(location.search)) openCarSheet("stage", 0);
  else if (/[?&]sheet=num/.test(location.search)) openNumSheet("cond", 0, 0);
})();
