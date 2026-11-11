/*!
 * 熊熊雀庄 · 工具分页外壳
 * hash 路由（#hoikata 默认）+ tab / panel 切换 + 模块首次激活时 init
 *
 * 模块约定：window.MJ.modules[name] = { init: function (panel) { ... } }
 * 模块缺失时 panel 内显示「模块加载中 / 不可用」空状态；模块脚本加载后
 * 可 dispatch 一个 document 上的 'mj:module-ready'（detail.name = 模块名）让外壳重试。
 *
 * 对外入口：window.MJ.tools
 */
;(function (global) {
  'use strict';

  var MODULES = [
    {
      name: 'hoikata',
      label: '何切',
      title: '何切练习',
      desc: '给一手牌，比较各种切法的进张与打点，练出稳定的第一打。'
    },
    {
      name: 'fuhan',
      label: '算番',
      title: '算番练习',
      desc: '摆出和牌牌型与场况，核对役种、番数、符数与最终点数。'
    },
    {
      name: 'training',
      label: '牌效训练',
      title: '牌效训练',
      desc: '从 300 道题库里随机抽题，练切牌后向听数与进张数的判断。'
    },
    {
      name: 'scoretable',
      label: '番符表',
      title: '番符表',
      desc: '番数 × 符数速查，庄家与闲家的和牌点数一屏看完。'
    },
    {
      name: 'yaku',
      label: '役种一览',
      title: '役种一览',
      desc: '按番数分类的役种图鉴，含食下番数、示例牌型与说明。'
    }
  ];

  var byName = {};
  var initialized = {};
  var current = null;
  var retryTimer = null;

  for (var i = 0; i < MODULES.length; i++) byName[MODULES[i].name] = MODULES[i];

  function $(id) {
    return document.getElementById(id);
  }

  function panelOf(name) {
    return $('panel-' + name);
  }

  function tabOf(name) {
    return $('tab-' + name);
  }

  function tabbar() {
    return document.querySelector('.tools-tabs');
  }

  function readHash() {
    var hash = String(location.hash || '').replace(/^#\/?/, '').split('?')[0];
    return byName[hash] ? hash : null;
  }

  function esc(str) {
    return String(str == null ? '' : str).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  var ICON =
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" ' +
    'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
    '<rect x="3" y="4" width="12" height="16" rx="2"/>' +
    '<path d="M9 4v16"/><path d="M15 8h4a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-4"/>' +
    '</svg>';

  function emptyHtml(mod, state, detail) {
    var isError = state === 'error';
    var title = isError ? mod.label + ' · 模块不可用' : mod.label + ' · 模块加载中';
    var text = isError
      ? '模块初始化失败：' + esc(detail || '未知错误')
      : '该模块的脚本还没有就绪。稍等片刻后重新点一次标签页，或点击下方按钮重试。';
    var badge = isError
      ? '<span class="tools-badge is-red">初始化失败</span>'
      : '<span class="tools-badge is-amber">等待模块脚本</span>';

    return '<div class="tools-empty' + (isError ? ' is-error' : '') + '" ' +
      'data-module-empty="' + state + '" data-module-title="' + esc(mod.title) + '">' +
      '<span class="tools-empty-icon" aria-hidden="true">' + ICON + '</span>' +
      '<h3>' + esc(title) + '</h3>' +
      '<p>' + text + '</p>' +
      '<div class="tools-empty-actions">' + badge +
      '<button class="tools-btn tools-btn-ghost tools-btn-sm" type="button" ' +
      'data-tools-retry="' + esc(mod.name) + '">重新加载</button>' +
      '</div></div>';
  }

  function showEmpty(panel, mod, state, detail) {
    panel.innerHTML = emptyHtml(mod, state, detail);
    panel.setAttribute('data-module-state', state);
  }

  function tryInit(name) {
    var mod = byName[name];
    var panel = panelOf(name);
    if (!mod || !panel) return false;

    var module = global.MJ && global.MJ.modules && global.MJ.modules[name];
    if (!module || typeof module.init !== 'function') {
      showEmpty(panel, mod, 'pending');
      return false;
    }

    panel.innerHTML = '';
    panel.removeAttribute('data-module-state');
    try {
      module.init(panel);
      initialized[name] = true;
      panel.setAttribute('data-module-state', 'ready');
      return true;
    } catch (err) {
      initialized[name] = false;
      showEmpty(panel, mod, 'error', err && err.message ? err.message : String(err));
      if (global.console && console.error) {
        console.error('[MJ.tools] 模块 ' + name + ' 初始化失败：', err);
      }
      return false;
    }
  }

  function revealTabbar() {
    var bar = tabbar();
    if (!bar) return;
    var header = document.querySelector('.site-top');
    var offset = header ? header.getBoundingClientRect().height : 0;
    var top = bar.getBoundingClientRect().top;
    if (top >= offset - 1) return;
    var target = window.pageYOffset + top - offset;
    try {
      window.scrollTo({ top: Math.max(0, target), behavior: 'smooth' });
    } catch (e) {
      window.scrollTo(0, Math.max(0, target));
    }
  }

  function activate(name, opts) {
    opts = opts || {};
    if (!byName[name]) name = MODULES[0].name;
    current = name;

    for (var i = 0; i < MODULES.length; i++) {
      var mod = MODULES[i];
      var on = mod.name === name;
      var tab = tabOf(mod.name);
      var panel = panelOf(mod.name);

      if (tab) {
        tab.classList.toggle('is-active', on);
        tab.setAttribute('aria-selected', on ? 'true' : 'false');
        tab.setAttribute('tabindex', on ? '0' : '-1');
      }
      if (panel) {
        if (on) panel.removeAttribute('hidden');
        else panel.setAttribute('hidden', '');
      }
    }

    if (!initialized[name]) tryInit(name);
    if (opts.scroll) revealTabbar();

    document.documentElement.setAttribute('data-tools-tab', name);

    try {
      document.dispatchEvent(new CustomEvent('mj:tools-activate', {
        detail: { name: name, panel: panelOf(name) }
      }));
    } catch (e) { /* 老浏览器忽略 */ }
  }

  function go(name) {
    if (!byName[name]) return;
    if (readHash() === name) {
      activate(name, { scroll: true });
    } else {
      location.hash = name;
    }
  }

  function bindTabs() {
    var bar = tabbar();
    if (!bar) return;

    bar.addEventListener('click', function (ev) {
      var link = ev.target && ev.target.closest ? ev.target.closest('[data-tab]') : null;
      if (!link || !bar.contains(link)) return;
      ev.preventDefault();
      go(link.getAttribute('data-tab'));
    });

    bar.addEventListener('keydown', function (ev) {
      var keys = ['ArrowLeft', 'ArrowRight', 'Home', 'End'];
      if (keys.indexOf(ev.key) < 0) return;
      var tabs = bar.querySelectorAll('[data-tab]');
      if (!tabs.length) return;
      var active = -1;
      for (var k = 0; k < tabs.length; k++) {
        if (tabs[k].classList.contains('is-active')) { active = k; break; }
      }
      var next = active;
      if (ev.key === 'ArrowLeft') next = (active - 1 + tabs.length) % tabs.length;
      if (ev.key === 'ArrowRight') next = (active + 1) % tabs.length;
      if (ev.key === 'Home') next = 0;
      if (ev.key === 'End') next = tabs.length - 1;
      ev.preventDefault();
      var target = tabs[next];
      target.focus();
      go(target.getAttribute('data-tab'));
    });

    // 空状态里的「重新加载」
    document.addEventListener('click', function (ev) {
      var btn = ev.target && ev.target.closest ? ev.target.closest('[data-tools-retry]') : null;
      if (!btn) return;
      var name = btn.getAttribute('data-tools-retry');
      if (byName[name]) {
        initialized[name] = false;
        tryInit(name);
      }
    });
  }

  function bindHash() {
    window.addEventListener('hashchange', function () {
      var name = readHash();
      if (name && name !== current) activate(name);
    });
  }

  function bindModuleReady() {
    document.addEventListener('mj:module-ready', function (ev) {
      var name = ev && ev.detail && ev.detail.name;
      if (!name) return;
      initialized[name] = false;
      if (name === current) tryInit(name);
    });
  }

  function exposeApi() {
    global.MJ = global.MJ || {};
    global.MJ.tools = {
      modules: MODULES,
      activate: function (name) { if (byName[name]) activate(name); },
      go: go,
      retry: function (name) {
        if (!byName[name]) return false;
        initialized[name] = false;
        return tryInit(name);
      },
      isReady: function (name) { return !!initialized[name]; },
      current: function () { return current; }
    };
  }

  function boot() {
    var initial = readHash();
    if (!initial) {
      initial = MODULES[0].name;
      try {
        history.replaceState(null, '', '#' + initial);
      } catch (e) {
        location.hash = initial;
      }
    }
    bindTabs();
    bindHash();
    bindModuleReady();
    exposeApi();
    activate(initial);

    // 模块脚本可能在 app.js 之后才执行完（defer 顺序之外的情况）：短延迟兜底重试一次
    if (!initialized[initial]) {
      retryTimer = setTimeout(function () {
        if (!initialized[current]) tryInit(current);
      }, 120);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }

  // 清理兜底定时器（避免测试环境泄漏计时器）
  window.addEventListener('pagehide', function () {
    if (retryTimer) clearTimeout(retryTimer);
  });
})(typeof window !== 'undefined' ? window : this);
