(function () {
  "use strict";

  var TABS = ["cars", "event", "arena"];
  var frame = {};
  TABS.forEach(function (t) { frame[t] = document.getElementById("f-" + t); });

  var bar = document.getElementById("tabbar");
  var current = "cars";

  function load(tab) {
    var f = frame[tab];
    if (!f) return;
    if (!f.getAttribute("src")) {
      f.setAttribute("src", f.getAttribute("data-src") || "");
    }
  }

  function show(tab) {
    if (TABS.indexOf(tab) < 0) tab = "cars";
    load(tab);                       // 首次点开才加载，之后一直留着
    current = tab;
    TABS.forEach(function (t) {
      var on = (t === tab);
      frame[t].classList.toggle("on", on);
    });
    [].forEach.call(bar.querySelectorAll(".tab"), function (b) {
      b.classList.toggle("on", b.getAttribute("data-tab") === tab);
      b.setAttribute("aria-current", b.getAttribute("data-tab") === tab ? "page" : "false");
    });
  }

  bar.addEventListener("click", function (e) {
    var btn = e.target.closest(".tab");
    if (!btn) return;
    var tab = btn.getAttribute("data-tab");
    if (tab === current) return;
    show(tab);
  });

  // 首屏默认图鉴；支持 ?tab=event / #arena 直接定位
  var fromUrl = (location.search.match(/[?&]tab=(cars|event|arena)/) || [])[1] ||
                location.hash.replace("#", "");
  show(TABS.indexOf(fromUrl) >= 0 ? fromUrl : "cars");
  var warm = function () { load("event"); load("arena"); };
  if (window.requestIdleCallback) requestIdleCallback(warm, { timeout: 1500 });
  else setTimeout(warm, 900);

  // 页面内如果发来切换请求（比如以后加了页内跳转）
  window.addEventListener("message", function (e) {
    if (e.data && e.data.type === "tab" && TABS.indexOf(e.data.tab) >= 0) show(e.data.tab);
  });
})();
