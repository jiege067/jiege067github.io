(function () {
  "use strict";

  var ORIG = window.A9_CARS || { cars: [] };
  var BASE = JSON.parse(JSON.stringify(ORIG));
  var DRAFT = "a9.cars.draft.v1";
  var CLS = ["D", "C", "B", "A", "S", "R"];

  var list = loadList();
  var state = { q: "", cls: "全部", star: "全部", sort: "score" };
  var editing = null;   // { idx, car }

  function $(id) { return document.getElementById(id); }
  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function num(v, d) {
    if (v == null || v === "") return "-";
    var n = Number(v);
    if (isNaN(n)) return "-";
    return d === 0 ? String(Math.round(n)) : String(Math.round(n * 10) / 10);
  }
  function money(v) {
    if (v == null) return "-";
    return Number(v).toLocaleString("en-US");
  }
  function starStr(n) {
    var h = "";
    for (var i = 0; i < (n || 0); i++) h += "★";
    return h || "-";
  }

  function loadList() {
    try {
      var raw = localStorage.getItem(DRAFT);
      if (raw) {
        var arr = JSON.parse(raw);
        if (Array.isArray(arr) && arr.length) return arr;
      }
    } catch (e) {}
    return JSON.parse(JSON.stringify(BASE.cars || []));
  }

  function isDirty() {
    try { return !!localStorage.getItem(DRAFT); } catch (e) { return false; }
  }

  function saveDraft() {
    try { localStorage.setItem(DRAFT, JSON.stringify(list)); } catch (e) {}
    paintBar();
  }

  function paintBar() {
    var dirty = isDirty();
    $("edState").textContent = dirty ? "有未发布的改动" : "数据已同步";
    $("edState").classList.toggle("dirty", dirty);
    $("btnDiscard").disabled = !dirty;
  }

  /* ---------------- 列表 ---------------- */
  function filtered() {
    var q = state.q.trim().toLowerCase();
    var out = list.filter(function (c) {
      if (state.cls !== "全部" && c.cls !== state.cls) return false;
      if (state.star !== "全部" && Number(c.stars) !== Number(state.star)) return false;
      if (q) {
        var hay = (c.name + " " + (c.alias || "")).toLowerCase();
        if (hay.indexOf(q) < 0) return false;
      }
      return true;
    });
    var key = state.sort;
    out.sort(function (a, b) {
      if (key === "name") return String(a.name).localeCompare(String(b.name));
      if (key === "cls") {
        var d = CLS.indexOf(b.cls) - CLS.indexOf(a.cls);
        return d || (b.score || 0) - (a.score || 0);
      }
      return (b.score || 0) - (a.score || 0) || String(a.name).localeCompare(String(b.name));
    });
    return out;
  }

  function perfCell(label, v) {
    return '<span class="pc"><i>' + label + "</i><b>" + num(v, 1) + "</b></span>";
  }

  function bpText(c) {
    if (!c.bp || !c.bp.length) return "图纸未知";
    var stars = c.stars || c.bp.length;
    var parts = [];
    for (var s = c.key ? 2 : 1; s <= stars; s++) {
      var v = c.bp[c.key ? s - 2 : s - 1];
      parts.push(s + "★" + (v == null ? "-" : v));
    }
    return parts.join(" · ");
  }

  function cardHtml(c) {
    var p = c.perf || {};
    return '<article class="ecard" data-id="' + esc(c.id) + '">' +
      '<div class="ec-top">' +
        '<span class="cls cls-' + esc(c.cls) + '">' + esc(c.cls) + "</span>" +
        '<div class="ec-name">' + esc(c.name) +
          (c.key ? ' <span class="keytag">🔑</span>' : "") +
          (c.alias ? ' <span class="ec-alias">' + esc(c.alias) + "</span>" : "") +
        "</div>" +
        '<div class="ec-score"><b>' + (c.score == null ? "-" : c.score) + "</b><span>总分</span></div>" +
        '<button class="car-edit" type="button" data-edit="' + esc(c.id) + '" aria-label="编辑">' +
          '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"><path d="M11.2 2.4 13.6 4.8 5.6 12.8l-3.2.8.8-3.2z"/></svg>' +
        "</button>" +
      "</div>" +
      '<div class="ec-stars">' + starStr(c.stars) + "</div>" +
      '<div class="ec-perf">' +
        perfCell("极速", p.top) + perfCell("加速", p.accel) +
        perfCell("操控", p.handling) + perfCell("氮气", p.nitroPower) +
      "</div>" +
      '<div class="ec-bp"><span class="lb">图纸</span><span class="bpv">' + esc(bpText(c)) + "</span>" +
        '<b class="tot">' + (c.bpTotal == null ? "-" : c.bpTotal) + "</b></div>" +
      '<div class="ec-foot">' +
        '<span>进口零件 ' + [c.parts && c.parts.blue, c.parts && c.parts.purple, c.parts && c.parts.yellow]
          .map(function (x) { return x == null ? "-" : x; }).join(" · ") + "</span>" +
        "<span>改装费用 " + money(c.cost) + "</span>" +
      "</div>" +
    "</article>";
  }

  function renderChips() {
    var classes = ["全部"].concat(CLS.slice().reverse());
    $("clsChips").innerHTML = classes.map(function (k) {
      return '<button class="chip' + (state.cls === k ? " on" : "") + '" data-cls="' + k + '">' + k + "</button>";
    }).join("");
    $("starChips").innerHTML = ["全部", 3, 4, 5, 6].map(function (k) {
      return '<button class="chip' + (state.star === k ? " on" : "") + '" data-star="' + k + '">' +
        (k === "全部" ? "全部星级" : k + "★") + "</button>";
    }).join("");
  }

  function render() {
    renderChips();
    var rows = filtered();
    $("count").textContent = "共 " + list.length + " 台 · 显示 " + rows.length + " 台";
    $("list").innerHTML = rows.length
      ? rows.map(cardHtml).join("")
      : '<div class="empty">没有符合条件的车</div>';
  }

  /* ---------------- 编辑 ---------------- */
  function blankCar() {
    return {
      id: "new-" + Date.now(), name: "", alias: "", cls: "S",
      stars: 6, score: 0, key: false,
      perf: { top: 0, nitro: 0, air: 0, blue: null, accel: 0, handling: 0, nitroPower: 0, spray: 0 },
      cost: 0, parts: { blue: 0, purple: 0, yellow: 0 },
      bp: [], bpTotal: 0
    };
  }

  function fitBp(c) {
    var n = Math.max(0, c.key ? (c.stars - 1) : c.stars);
    var bp = (c.bp || []).slice(0, n).map(function (v) { return v == null ? 0 : v; });
    while (bp.length < n) bp.push(0);
    c.bp = bp;
    c.bpTotal = bp.reduce(function (a, b) { return a + (Number(b) || 0); }, 0);
  }

  function bpFieldsHtml(c) {
    var h = '<div class="grid4">';
    var from = c.key ? 2 : 1;
    for (var s = from; s <= c.stars; s++) {
      var i = c.key ? s - 2 : s - 1;
      h += '<label class="fld"><span>' + s + "★</span>" +
        '<input type="number" min="0" step="1" data-k="bp.' + i + '" value="' +
        (c.bp[i] == null ? "" : c.bp[i]) + '"></label>';
    }
    h += "</div>";
    h += '<div class="bp-total"><span>图纸总计</span><b id="bpTotal">' + (c.bpTotal || 0) + "</b></div>";
    return h;
  }

  function sheetBodyHtml(c) {
    return '<div class="sh-sec"><h4>基础</h4>' +
      '<div class="grid2">' +
        '<label class="fld" style="grid-column:1/-1"><span>车名</span>' +
          '<input type="text" data-k="name" value="' + esc(c.name) + '"></label>' +
        '<label class="fld"><span>别名</span><input type="text" data-k="alias" value="' + esc(c.alias) + '"></label>' +
        '<label class="fld"><span>级别</span><select data-k="cls">' +
          CLS.map(function (k) { return '<option' + (c.cls === k ? " selected" : "") + ">" + k + "</option>"; }).join("") +
        "</select></label>" +
        '<label class="fld"><span>星级上限</span><select data-k="stars">' +
          [1, 2, 3, 4, 5, 6].map(function (k) { return '<option value="' + k + '"' + (Number(c.stars) === k ? " selected" : "") + ">" + k + "★</option>"; }).join("") +
        "</select></label>" +
        '<label class="fld"><span>总分</span><input type="number" step="1" data-k="score" value="' + (c.score == null ? "" : c.score) + '"></label>' +
      "</div>" +
      '<div class="grid2" style="margin-top:10px">' +
        '<div class="key-row' + (c.key ? " on" : "") + '" id="keyRow"><span class="box">' + (c.key ? "✓" : "") + "</span>钥匙车</div>" +
      "</div>" +
    "</div>" +

    '<div class="sh-sec"><h4>性能</h4>' +
      '<div class="grid2">' +
        '<label class="fld"><span>极速</span><input type="number" step="0.1" data-k="perf.top" value="' + (c.perf.top == null ? "" : c.perf.top) + '"></label>' +
        '<label class="fld"><span>加速</span><input type="number" step="0.01" data-k="perf.accel" value="' + (c.perf.accel == null ? "" : c.perf.accel) + '"></label>' +
        '<label class="fld"><span>操控</span><input type="number" step="0.01" data-k="perf.handling" value="' + (c.perf.handling == null ? "" : c.perf.handling) + '"></label>' +
        '<label class="fld"><span>氮气</span><input type="number" step="0.01" data-k="perf.nitroPower" value="' + (c.perf.nitroPower == null ? "" : c.perf.nitroPower) + '"></label>' +
      "</div>" +
      '<div class="grid3" style="margin-top:10px">' +
        '<label class="fld"><span>空速</span><input type="number" step="1" data-k="perf.air" value="' + (c.perf.air == null ? "" : c.perf.air) + '"></label>' +
        '<label class="fld"><span>氮速</span><input type="number" step="0.1" data-k="perf.nitro" value="' + (c.perf.nitro == null ? "" : c.perf.nitro) + '"></label>' +
        '<label class="fld"><span>单喷(s)</span><input type="number" step="0.1" data-k="perf.spray" value="' + (c.perf.spray == null ? "" : c.perf.spray) + '"></label>' +
      "</div>" +
    "</div>" +

    '<div class="sh-sec"><h4>图纸（升到该星所需）</h4>' + bpFieldsHtml(c) + "</div>" +

    '<div class="sh-sec"><h4>进口零件</h4>' +
      '<div class="grid3">' +
        '<label class="fld"><span>蓝</span><input type="number" step="1" data-k="parts.blue" value="' + (c.parts.blue == null ? "" : c.parts.blue) + '"></label>' +
        '<label class="fld"><span>紫</span><input type="number" step="1" data-k="parts.purple" value="' + (c.parts.purple == null ? "" : c.parts.purple) + '"></label>' +
        '<label class="fld"><span>黄</span><input type="number" step="1" data-k="parts.yellow" value="' + (c.parts.yellow == null ? "" : c.parts.yellow) + '"></label>' +
      "</div>" +
    "</div>" +

    '<div class="sh-sec"><h4>费用</h4>' +
      '<label class="fld"><span>改装费用</span><input type="number" step="1000" data-k="cost" value="' + (c.cost == null ? "" : c.cost) + '"></label>' +
    "</div>";
  }

  function openEditor(car, idx) {
    editing = { idx: idx, car: JSON.parse(JSON.stringify(car)) };
    fitBp(editing.car);
    $("shTitle").textContent = idx < 0 ? "添加新车" : "编辑车辆";
    $("btnDel").style.display = idx < 0 ? "none" : "";
    $("shBody").innerHTML = sheetBodyHtml(editing.car);
    $("shBody").scrollTop = 0;
    $("sheet").hidden = false;
  }

  function setPath(obj, path, val) {
    var parts = path.split(".");
    var o = obj;
    for (var i = 0; i < parts.length - 1; i++) {
      if (!o[parts[i]]) o[parts[i]] = {};
      o = o[parts[i]];
    }
    o[parts[parts.length - 1]] = val;
  }

  function bindSheet() {
    $("shBody").addEventListener("input", function (e) {
      var el = e.target;
      var k = el.getAttribute("data-k");
      if (!k || !editing) return;

      if (el.type === "number") {
        var v = el.value === "" ? null : Number(el.value);
        setPath(editing.car, k, v);
        if (k.indexOf("bp.") === 0) {
          editing.car.bpTotal = editing.car.bp.reduce(function (a, b) { return a + (Number(b) || 0); }, 0);
          var t = $("bpTotal");
          if (t) t.textContent = editing.car.bpTotal;
        }
      } else {
        setPath(editing.car, k, el.value);
      }
    });

    $("shBody").addEventListener("change", function (e) {
      var el = e.target;
      var k = el.getAttribute("data-k");
      if (!k || !editing) return;

      if (k === "stars") {
        editing.car.stars = Number(el.value);
        fitBp(editing.car);
        $("shBody").innerHTML = sheetBodyHtml(editing.car);
      } else if (k === "cls") {
        editing.car.cls = el.value;
      }
    });

    $("shBody").addEventListener("click", function (e) {
      if (!e.target.closest("#keyRow") || !editing) return;
      editing.car.key = !editing.car.key;
      fitBp(editing.car);
      $("shBody").innerHTML = sheetBodyHtml(editing.car);
    });

    $("btnSave").addEventListener("click", function () {
      if (!editing) return;
      var c = editing.car;
      if (!String(c.name || "").trim()) { toast("车名不能为空"); return; }
      if (editing.idx < 0) list.push(c);
      else list[editing.idx] = c;
      editing = null;
      $("sheet").hidden = true;
      saveDraft();
      render();
      toast("已保存（还未发布）");
    });

    $("btnDel").addEventListener("click", function () {
      if (!editing || editing.idx < 0) return;
      if (!confirm("删除「" + editing.car.name + "」？")) return;
      list.splice(editing.idx, 1);
      editing = null;
      $("sheet").hidden = true;
      saveDraft();
      render();
      toast("已删除");
    });

    $("sheet").addEventListener("click", function (e) {
      if (e.target.closest("[data-close]")) $("sheet").hidden = true;
    });
  }

  /* ---------------- 导出 ---------------- */
  function buildFile() {
    var out = JSON.parse(JSON.stringify(BASE));
    out.cars = list;
    return "window.A9_CARS = " + JSON.stringify(out, null, 2) + ";\n";
  }

  function exportFile() {
    var text = buildFile();
    window.A9_LAST_EXPORT = text;              // 方便自动化校验
    $("expText").value = text;
    $("expTip").textContent = "cars.js · " + Math.round(text.length / 1024) +
      " KB · 覆盖仓库里的 cars.js，Vercel 约 30 秒自动上线";
    $("expSheet").hidden = false;
  }

  function downloadExport() {
    var text = $("expText").value || buildFile();
    var blob = new Blob([text], { type: "text/javascript;charset=utf-8" });
    var a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "cars.js";
    document.body.appendChild(a);
    a.click();
    setTimeout(function () {
      URL.revokeObjectURL(a.href);
      a.remove();
    }, 800);
    toast("已下载 cars.js");
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

  function toast(msg) {
    var el = $("toast");
    el.textContent = msg;
    el.hidden = false;
    clearTimeout(el._t);
    el._t = setTimeout(function () { el.hidden = true; }, 2000);
  }

  /* ---------------- 事件 ---------------- */
  function bind() {
    $("q").addEventListener("input", function (e) { state.q = e.target.value; render(); });
    $("sort").addEventListener("change", function (e) { state.sort = e.target.value; render(); });

    $("clsChips").addEventListener("click", function (e) {
      var b = e.target.closest("[data-cls]");
      if (!b) return;
      state.cls = b.getAttribute("data-cls");
      render();
    });
    $("starChips").addEventListener("click", function (e) {
      var b = e.target.closest("[data-star]");
      if (!b) return;
      var v = b.getAttribute("data-star");
      state.star = v === "全部" ? "全部" : Number(v);
      render();
    });

    $("list").addEventListener("click", function (e) {
      var b = e.target.closest("[data-edit]");
      if (!b) return;
      var id = b.getAttribute("data-edit");
      var idx = -1;
      for (var i = 0; i < list.length; i++) { if (list[i].id === id) { idx = i; break; } }
      if (idx >= 0) openEditor(list[idx], idx);
    });

    $("addCar").addEventListener("click", function () { openEditor(blankCar(), -1); });

    $("btnDiscard").addEventListener("click", function () {
      if (!confirm("丢弃本地草稿，回到线上数据？")) return;
      try { localStorage.removeItem(DRAFT); } catch (e) {}
      list = JSON.parse(JSON.stringify(BASE.cars || []));
      paintBar();
      render();
      toast("已恢复线上数据");
    });

    $("btnPublish").addEventListener("click", exportFile);
    $("expDl").addEventListener("click", downloadExport);
    $("expCopy").addEventListener("click", copyExport);
    $("expSheet").addEventListener("click", function (e) {
      if (e.target.closest("[data-close]")) $("expSheet").hidden = true;
    });
  }

  function init() {
    bind();
    bindSheet();
    paintBar();
    render();
  }

  init();
})();
