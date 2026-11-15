/* 嵌入外壳（app.html）时，隐藏各页自带的跨页导航，避免和底部 tab 重复 */
(function () {
  "use strict";
  if (window.top === window.self) return;
  document.documentElement.classList.add("in-shell");

  function hide() {
    var sel = ".topbar .back, .topbar .toplinks, .nav .back, .navlink";
    [].forEach.call(document.querySelectorAll(sel), function (el) {
      el.style.display = "none";
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", hide);
  } else {
    hide();
  }
})();
