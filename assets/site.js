/* 熊熊雀庄 · 全站脚本：移动端菜单 + 年份 + 页面切换过渡 */
(function () {
  'use strict';

  /* ---- 移动端菜单 ---- */
  var btn = document.getElementById('siteMenuBtn');
  var navEl = document.querySelector('.site-nav');
  if (btn && navEl) {
    var close = function () {
      navEl.classList.remove('is-open');
      btn.setAttribute('aria-expanded', 'false');
      btn.setAttribute('aria-label', '打开菜单');
    };
    btn.addEventListener('click', function () {
      var open = navEl.classList.toggle('is-open');
      btn.setAttribute('aria-expanded', String(open));
      btn.setAttribute('aria-label', open ? '关闭菜单' : '打开菜单');
    });
    navEl.querySelectorAll('a').forEach(function (a) { a.addEventListener('click', close); });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape') close(); });
    document.addEventListener('click', function (e) {
      if (!navEl.contains(e.target) && e.target !== btn && !btn.contains(e.target)) close();
    });
  }

  var y = document.getElementById('year');
  if (y) y.textContent = String(new Date().getFullYear());

  /* ---- 页面切换过渡 ----
     CSS 负责「进入」：main 上的 pt-in 动画；
     这里负责「离开」：给根元素加 .pt-out 让内容淡出 120ms，再跳转。
     只接管同源、非新窗口、非下载的普通点击；同页锚点（#art-1-2）不拦截。 */
  var root = document.documentElement;
  var reduce = window.matchMedia('(prefers-reduced-motion: reduce)');
  var OUT_MS = 120;
  var leaving = false;

  function isSameDoc(url) {
    return url.pathname === location.pathname && url.search === location.search;
  }

  document.addEventListener('click', function (e) {
    if (leaving || e.defaultPrevented) return;
    if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    if (reduce.matches) return;

    var a = e.target.closest ? e.target.closest('a[href]') : null;
    if (!a || a.target || a.hasAttribute('download')) return;

    var url;
    try { url = new URL(a.getAttribute('href'), location.href); } catch (err) { return; }
    if (url.origin !== location.origin) return;
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return;
    if (isSameDoc(url)) return;            /* 同页锚点/筛选：交给原生行为 */
    if (url.href === location.href) return;

    leaving = true;
    e.preventDefault();
    root.classList.add('pt-out');
    setTimeout(function () { location.href = url.href; }, OUT_MS);
  });

  /* 从 bfcache 返回时清掉残留状态，否则页面会保持半透明 */
  window.addEventListener('pageshow', function (ev) {
    if (ev.persisted) { leaving = false; root.classList.remove('pt-out'); }
  });
})();
