(function () {
  "use strict";

  /* ---------- 车辆价格字典（初始单价 / 每张涨幅 %） ---------- */
  var CAR_DB = [
    { name: "Jesko Absolut",              price: 3000, growth: 5 },
    { name: "Bugatti Bolide",             price: 2500, growth: 2 },
    { name: "Agera RS",                   price: 2400, growth: 3 },
    { name: "Ultima RS",                  price: 2250, growth: 3 },
    { name: "Ferrari SF90 Stradale",      price: 2100, growth: 4 },
    { name: "Vision 1789",                price: 1700, growth: 3 },
    { name: "McLaren 650S GT3",           price: 1750, growth: 3 },
    { name: "Aston Martin Valhalla",      price: 2100, growth: 2 },
    { name: "Pagani Zonda R",             price: 1500, growth: 3 },
    { name: "Ferrari 488 Challenge EVO",  price: 1200, growth: 3 },
    { name: "Lamborghini Sesto Elemento", price: 1750, growth: 3 },
    { name: "Renault TreZor",             price: 600,  growth: 3 },
    { name: "Arash AF8 Falcon Edition",   price: 900,  growth: 3 },
    { name: "Lotus Emira",                price: 400,  growth: 3 }
  ];

  var FALLBACK_BP = 300;            // 图鉴里找不到这辆车时的兜底
  var ARC_LEN = Math.PI * 100;      // 半径 100 的半圆弧长
  var ARC_REF_WEEKS = 52;           // 弧线满格参考：52 周
  var WEEK_GUARD = 2000000;         // 防死循环

  function $(id) { return document.getElementById(id); }
  function toInt(v, fallback) {
    var n = parseInt(v, 10);
    return isNaN(n) ? fallback : n;
  }
  function toNum(v, fallback) {
    var n = parseFloat(v);
    return isNaN(n) ? fallback : n;
  }
  function fmt(n) { return Number(n).toLocaleString("en-US"); }

  /* ---------- 和图鉴数据对上 ---------- */
  function normName(s) {
    return String(s == null ? "" : s).toLowerCase().replace(/[^a-z0-9]/g, "");
  }

  function findCar(name) {
    var list = (window.A9_CARS && window.A9_CARS.cars) || [];
    var k = normName(name);
    if (!k) return null;
    for (var i = 0; i < list.length; i++) {
      if (normName(list[i].name) === k) return list[i];
    }
    for (var j = 0; j < list.length; j++) {
      var n = normName(list[j].name);
      if (n && (n.indexOf(k) >= 0 || k.indexOf(n) >= 0)) return list[j];
    }
    return null;
  }

  function carEntry() {
    var name = $("car").value;
    for (var i = 0; i < CAR_DB.length; i++) {
      if (CAR_DB[i].name === name) return CAR_DB[i];
    }
    return null;
  }

  function carObj() {
    var entry = carEntry();
    return entry ? findCar(entry.name) : null;
  }

  /* 从 0★ 升到 star 需要的累计图纸数
   *   普通车：bp[0..S-1]（1★ 就要图纸）
   *   钥匙车：获取即 1★，bp[0..S-2]（2★ 起才算） */
  function cumulative(car, star) {
    if (!car || !car.bp || !car.bp.length) return null;
    if (star <= 0) return 0;
    var maxStar = car.stars || car.bp.length;
    var s = Math.min(star, maxStar);
    var slots = car.key ? s - 1 : s;
    slots = Math.max(0, Math.min(slots, car.bp.length));
    var sum = 0;
    for (var i = 0; i < slots; i++) sum += car.bp[i] || 0;
    return sum;
  }

  /* 实际总图纸 = 当前星级已消耗的累计图纸 + 额外存有图纸
   * 还差 = 目标星级累计需求 - 实际总图纸 */
  function needInfo() {
    var car = carObj();
    var extra = Math.max(0, toInt($("owned").value, 0));
    var cur = toInt($("curStar").value, 0);
    var want = toInt($("star").value, 6);
    var star = want, total = FALLBACK_BP, known = false;
    var used = 0;

    if (car) {
      var maxStar = car.stars || car.bp.length;
      star = Math.min(want, maxStar);

      var t = cumulative(car, star);
      if (t != null) { total = t; known = true; }

      var u = cumulative(car, Math.min(cur, maxStar));
      if (u != null) used = u;
    }

    var have = used + extra;
    return {
      car: car,
      known: known,
      star: star,
      total: total,
      used: used,
      extra: extra,
      have: have,
      remain: Math.max(0, total - have)
    };
  }

  /* ---------- 核心模拟 ----------
   * 每周：结算硬币 → 单价重置为初始价 → 本周内循环购买 → 钱不够就进下一周
   * 每买一张：price = Math.ceil(price * (1 + 涨幅))
   */
  function simulate(cfg) {
    var coins = 0;
    var bought = 0;
    var weeks = 0;
    var spent = 0;
    var firstWeek = null;

    var basePrice = cfg.price;
    var rate = cfg.growth / 100;
    var weekly = cfg.weekly;
    var need = cfg.need;

    while (bought < need) {
      weeks++;
      coins += weekly;            // 每周结算
      var price = basePrice;      // 关键：本周单价重置
      var boughtThisWeek = 0;

      while (coins >= price && bought < need) {
        coins -= price;
        bought++;
        boughtThisWeek++;
        spent += price;
        price = Math.ceil(price * (1 + rate));
      }

      if (weeks === 1) {
        firstWeek = { bought: boughtThisWeek, left: coins, spent: spent };
      }
      if (weeks >= WEEK_GUARD) break;
    }

    return { weeks: weeks, bought: bought, spent: spent, left: coins, firstWeek: firstWeek };
  }

  /* ---------- 渲染 ---------- */
  function setArc(weeks) {
    var pct = Math.min(1, Math.max(0, weeks / ARC_REF_WEEKS));
    $("arc").style.strokeDashoffset = (ARC_LEN * (1 - pct)).toFixed(2);
  }

  function setWeeks(txt, placeholder) {
    var el = $("weeks");
    el.textContent = txt;
    el.classList.toggle("ph", !!placeholder);
    if (placeholder) { el.style.fontSize = ""; return; }
    var n = String(txt).length;
    el.style.fontSize = n >= 12 ? "26px" : n >= 9 ? "32px" : n >= 7 ? "40px" : n >= 5 ? "52px" : "";
  }

  function renderNeed() {
    var info = needInfo();

    $("needBp").textContent = fmt(info.remain);
    $("haveBp").textContent = fmt(info.have);
    $("totalBp").textContent = fmt(info.total);
    $("starTxt").textContent = info.star + "★";
    $("carName").textContent = $("car").value;

    if (info.car) {
      $("carInfo").textContent = info.car.stars + "★ 满星 · 共 " + fmt(info.car.bpTotal) +
        " 张图纸" + (info.car.key ? " · 钥匙车" : "");
    } else {
      $("carInfo").textContent = "图鉴里没找到这辆车，图纸数按 " + FALLBACK_BP + " 张估算";
    }
    return info;
  }

  function showError(msg) {
    var el = $("err");
    if (!msg) { el.hidden = true; el.textContent = ""; return; }
    el.hidden = false;
    el.textContent = msg;
  }

  function showWarn(weeks) {
    var el = $("warn");
    if (weeks > 5200) {
      el.hidden = false;
      el.textContent = "按当前参数需要约 " + fmt(Math.round(weeks / 52)) +
        " 年，多半是「每周可获取擂台币」填得太少，或图纸数量超出预期。";
    } else {
      el.hidden = true;
      el.textContent = "";
    }
  }

  /* ---------- 计算入口 ---------- */
  function run() {
    var info = renderNeed();
    var price = Math.max(1, toInt($("price").value, 3000));
    var growth = Math.max(0, toNum($("growth").value, 0));
    var weekly = Math.max(0, toInt($("weekly").value, 0));

    if (info.remain <= 0) {
      showError("");
      setWeeks("0", false);
      $("cost").textContent = "0";
      setArc(0);
      showWarn(0);
      return;
    }

    if (weekly <= 0) {
      showError("每周可获取擂台币要大于 0");
      setWeeks("—", true);
      $("cost").textContent = "—";
      setArc(0);
      showWarn(0);
      return;
    }
    showError("");

    var res = simulate({ need: info.remain, price: price, growth: growth, weekly: weekly });

    setWeeks(fmt(res.weeks), false);
    $("cost").textContent = fmt(res.spent);
    setArc(res.weeks);
    showWarn(res.weeks);
  }

  /* ---------- 车辆联动 ---------- */
  function fillCars() {
    $("car").innerHTML = CAR_DB.map(function (c) {
      return '<option value="' + c.name + '">' + c.name + "</option>";
    }).join("");
  }

  /* 按车辆星级上限重建两个下拉：当前 0~N★，目标 1~N★ */
  function fillStarOptions(maxStar) {
    var curSel = $("curStar"), tgtSel = $("star");
    var curVal = parseInt(curSel.value, 10);
    var tgtVal = parseInt(tgtSel.value, 10);

    var a = "", b = "";
    for (var s = 0; s <= maxStar; s++) a += '<option value="' + s + '">' + s + "★</option>";
    for (var t = 1; t <= maxStar; t++) b += '<option value="' + t + '">' + t + "★</option>";
    curSel.innerHTML = a;
    tgtSel.innerHTML = b;

    if (isNaN(curVal) || curVal < 0 || curVal > maxStar) curVal = 0;
    curSel.value = String(curVal);

    if (isNaN(tgtVal) || tgtVal < 1 || tgtVal > maxStar) tgtVal = maxStar;
    if (tgtVal <= curVal) tgtVal = Math.min(maxStar, curVal + 1);
    tgtSel.value = String(tgtVal);
  }

  function syncStars(car) {
    var maxStar = (car && car.stars) ? car.stars : 6;
    fillStarOptions(maxStar);
  }

  function applyCar(name) {
    var entry = null, i;
    for (i = 0; i < CAR_DB.length; i++) {
      if (CAR_DB[i].name === name) { entry = CAR_DB[i]; break; }
    }
    if (!entry) return;

    $("price").value = entry.price;
    $("growth").value = entry.growth;
    syncStars(findCar(entry.name));
  }

  function bind() {
    $("car").addEventListener("change", function (e) {
      applyCar(e.target.value);
      renderNeed();
    });

    $("curStar").addEventListener("change", function () {
      var cur = Number($("curStar").value);
      if (Number($("star").value) < cur) $("star").value = String(cur);
      renderNeed();
    });

    $("star").addEventListener("change", function () {
      var target = Number($("star").value);
      if (Number($("curStar").value) > target) $("curStar").value = String(target);
      renderNeed();
    });

    $("owned").addEventListener("input", renderNeed);
    $("go").addEventListener("click", run);
    ["owned", "price", "growth", "weekly"].forEach(function (id) {
      $(id).addEventListener("keydown", function (e) {
        if (e.key === "Enter") run();
      });
    });
  }

  /* ---------- 自测（控制台可见） ---------- */
  function selfTest() {
    var a = simulate({ need: 300, price: 3000, growth: 5, weekly: 18950 }).firstWeek;
    var b = simulate({ need: 300, price: 2250, growth: 3, weekly: 18950 }).firstWeek;

    console.log("[自测] Jesko 3000/5% 每周 18950 → 首周买 " + a.bought + " 张，剩余 " + a.left);
    console.log("[自测] Ultima 2250/3% 每周 18950 → 首周买 " + b.bought + " 张，剩余 " + b.left + "，花费 " + b.spent);

    console.assert(a.bought === 5 && a.left === 2370, "Jesko 首周应为 5 张 / 剩 2370");
    console.assert(b.bought === 7 && b.spent === 17251, "Ultima 首周应为 7 张 / 花 17251");
    return { jesko: a, ultima: b };
  }

  /* ---------- 启动 ---------- */
  fillCars();
  $("car").value = CAR_DB[0].name;
  applyCar(CAR_DB[0].name);
  bind();
  renderNeed();
  setArc(0);
  setWeeks("—", true);
  selfTest();

  // 调试：arena.html?run=1&car=Ultima%20RS&cur=3&weekly=18950&owned=0
  if (/[?&]run=1/.test(location.search)) {
    var c = location.search.match(/[?&]car=([^&]+)/);
    if (c) {
      var name = decodeURIComponent(c[1]);
      for (var i = 0; i < CAR_DB.length; i++) {
        if (CAR_DB[i].name === name) { $("car").value = name; applyCar(name); break; }
      }
    }
    var cu = location.search.match(/[?&]cur=(\d)/);
    if (cu) $("curStar").value = cu[1];
    var m = location.search.match(/[?&]weekly=(\d+)/);
    if (m) $("weekly").value = m[1];
    var o = location.search.match(/[?&]owned=(\d+)/);
    if (o) $("owned").value = o[1];
    run();
  }
})();
