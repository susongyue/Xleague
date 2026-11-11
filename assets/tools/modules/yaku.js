/*!
 * 熊熊雀庄 · 工具分页「役种一览」模块
 * window.MJ.modules.yaku = { init(panel), focus(name) }
 *
 * 数据：MJ.data.loadYaku() -> assets/tools/data/yaku.json（123 条）
 * 牌面：MJ.tiles.render()（和牌张高亮、宝牌指示牌）
 * 样式：公共组件见 ../tools.css，本模块私有样式见 ./yaku.css
 *
 * 深链：tools/#yaku?q=立直 会自动切到役种标签并定位高亮；
 *       其他模块可调用 MJ.modules.yaku.focus('立直')。
 */
;(function (global) {
  'use strict';

  var MODULE = 'yaku';
  var PAGE_SIZE = 24;

  var TABS = [
    { key: 'all', label: '全部' },
    { key: '1h', label: '1番' },
    { key: '2h', label: '2番' },
    { key: '3h', label: '3番' },
    { key: '6h', label: '6番' },
    { key: 'yakuman', label: '役满' },
    { key: 'double-yakuman', label: '双倍役满' },
    { key: 'ryukyoku', label: '流局' },
    { key: 'koyaku', label: '古役' }
  ];

  var state = {
    data: null,
    filtered: [],
    tab: 'all',
    q: '',
    shown: PAGE_SIZE,
    root: null,
    listEl: null,
    countEl: null,
    hintEl: null,
    totalEl: null,
    searchEl: null,
    clearEl: null,
    moreWrap: null,
    moreBtn: null,
    allBtn: null,
    endEl: null,
    sentinel: null,
    observer: null,
    searchTimer: null,
    focusTimer: null
  };

  var pendingFocus = null;
  var globalsBound = false;
  var lastHashQuery = '';

  /* ---------------- 工具函数 ---------------- */

  function esc(str) {
    return String(str == null ? '' : str).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function num(value, fallback) {
    var n = Number(value);
    return isFinite(n) ? n : (fallback || 0);
  }

  function reducedMotion() {
    try {
      return !!(global.matchMedia && global.matchMedia('(prefers-reduced-motion: reduce)').matches);
    } catch (e) {
      return false;
    }
  }

  /* 番数文案：0 不计番 / 13 役满 / 26 双倍役满 / 39 三倍役满 / 其余 N番；
     isMangan（古役里的满贯牌型）优先显示「满贯」。 */
  function hanValueText(value) {
    var n = num(value, 0);
    if (n === 0) return '不计番';
    if (n >= 13 && n % 13 === 0) {
      var times = n / 13;
      if (times === 1) return '役满';
      if (times === 2) return '双倍役满';
      if (times === 3) return '三倍役满';
      return times + '倍役满';
    }
    return n + '番';
  }

  function hanText(item) {
    if (item && item.isMangan) return '满贯';
    return hanValueText(item && item.han);
  }

  /* 食下文案：null = 门清限定；同番 = 副露不减；低番 = 食下 N 番；
     0/不计番的条目（流局、宝牌等）不显示食下标签。 */
  function openText(item) {
    if (!item || item.isMangan) return null;
    var han = num(item.han, 0);
    var open = item.openHan;
    if (open == null) return '门清限定';
    if (han === 0 || num(open, 0) === 0) return null;
    if (num(open, 0) === han) return '副露不减';
    return '食下 ' + hanValueText(open);
  }

  function hanTone(item) {
    if (item && item.isMangan) return 'is-amber';
    var han = num(item && item.han, 0);
    if (han >= 13) return 'is-red';
    if (han === 0) return 'is-amber';
    return 'is-blue';
  }

  function openTone(item) {
    var open = item && item.openHan;
    if (open == null) return '';
    return num(open, 0) === num(item.han, 0) ? 'is-green' : 'is-green';
  }

  function normalizeQuery(text) {
    return String(text == null ? '' : text).replace(/\s+/g, ' ').trim().toLowerCase();
  }

  function tabLabel(key) {
    for (var i = 0; i < TABS.length; i++) {
      if (TABS[i].key === key) return TABS[i].label;
    }
    return '';
  }

  /* ---------------- 深链查询参数 ---------------- */

  function readHashQuery() {
    var hash = String(global.location && global.location.hash ? global.location.hash : '');
    var at = hash.indexOf('?');
    if (at < 0) return '';
    var qs = hash.slice(at + 1);
    if (!qs) return '';
    var parts = qs.split('&');
    for (var i = 0; i < parts.length; i++) {
      var pair = parts[i].split('=');
      var key = pair[0];
      if (key !== 'q' && key !== 'name' && key !== 'yaku') continue;
      var raw = pair.slice(1).join('=') || '';
      raw = raw.replace(/\+/g, ' ');
      try {
        raw = decodeURIComponent(raw);
      } catch (e) { /* 保留原文 */ }
      raw = raw.trim();
      if (raw) return raw;
    }
    return '';
  }

  /* ---------------- 牌面 ---------------- */

  function tilesApi() {
    return global.MJ && global.MJ.tiles ? global.MJ.tiles : null;
  }

  function winIndexOf(tiles, hand, win) {
    if (!tiles || typeof tiles.normalize !== 'function') return -1;
    var keys = tiles.normalize(hand);
    var wins = tiles.normalize(win);
    if (!keys.length || !wins.length) return -1;
    var wanted = wins[0];
    for (var i = keys.length - 1; i >= 0; i--) {
      if (keys[i] === wanted) return i;
    }
    return -1;
  }

  function handHtml(item) {
    var tiles = tilesApi();
    if (!tiles || typeof tiles.render !== 'function') return '';
    if (!item || !item.hand) return '';

    var winIdx = item.win ? winIndexOf(tiles, item.hand, item.win) : -1;
    var keys = typeof tiles.normalize === 'function' ? tiles.normalize(item.hand) : [];
    var renderTiles = item.hand;

    // 少数牌例（如「抢杠」）的 hand 只写 13 张，和牌张单列在 win 里：
    // 补上和牌张并高亮最后一张，避免示例手牌缺一张、看不到和牌张。
    if (winIdx < 0 && item.win && keys.length && keys.length < 14) {
      var winKeys = typeof tiles.normalize === 'function' ? tiles.normalize(item.win) : [];
      if (winKeys.length) {
        keys = keys.concat([winKeys[0]]);
        winIdx = keys.length - 1;
        renderTiles = keys;
      }
    }

    // 不传 gap/size 的像素值，让 yaku.css 按断点控制牌宽与间距
    var opts = { size: 'md', className: 'yaku-tiles' };
    if (winIdx >= 0) opts.win = [winIdx];

    var winName = winIdx >= 0 && keys[winIdx] && typeof tiles.nameOf === 'function'
      ? tiles.nameOf(keys[winIdx]) : '';

    var html = '<div class="yaku-hand">';
    html += '<div class="yaku-hand-head">';
    html += '<span class="yaku-hand-label">示例和牌</span>';
    if (winName) html += '<span class="yaku-win-note">和牌张 <b>' + esc(winName) + '</b></span>';
    html += '</div>';
    html += tiles.render(renderTiles, opts);
    if (item.doraIndicator) {
      html += '<div class="yaku-dora">';
      html += '<span class="yaku-dora-label">宝牌指示牌</span>';
      html += tiles.render(item.doraIndicator, { size: 'sm' });
      html += '</div>';
    }
    html += '</div>';
    return html;
  }

  /* ---------------- 卡片 / 空状态 ---------------- */

  function cardHtml(item, index) {
    var open = openText(item);
    var html = '<article class="tools-card yaku-card" id="yaku-item-' + index + '"' +
      ' data-name="' + esc(item.name) + '" data-tab="' + esc(item.hanTab || '') + '">';
    html += '<div class="yaku-card-head">';
    html += '<h3 class="yaku-name">' + esc(item.name) + '</h3>';
    html += '<div class="yaku-tags">';
    html += '<span class="tools-badge ' + hanTone(item) + ' yaku-han">' + esc(hanText(item)) + '</span>';
    if (open) html += '<span class="tools-badge yaku-open ' + openTone(item) + '">' + esc(open) + '</span>';
    html += '</div></div>';
    html += '<p class="yaku-desc">' + esc(item.desc || '') + '</p>';
    html += handHtml(item);
    html += '</article>';
    return html;
  }

  function cardsHtml(from, to) {
    var html = '';
    for (var i = from; i < to; i++) html += cardHtml(state.filtered[i], i);
    return html;
  }

  var SEARCH_ICON =
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" ' +
    'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
    '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.6-3.6"/></svg>';

  var EMPTY_ICON =
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" ' +
    'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
    '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.6-3.6"/><path d="M8.5 11h5"/></svg>';

  function emptyHtml() {
    var html = '<div class="tools-empty yaku-empty">';
    html += '<span class="tools-empty-icon" aria-hidden="true">' + EMPTY_ICON + '</span>';
    html += '<h3>没有找到相关役种</h3>';
    html += '<p>换个关键词试试，或切换到「全部」查看完整图鉴。</p>';
    html += '<div class="tools-empty-actions">';
    html += '<button class="tools-btn tools-btn-ghost tools-btn-sm" type="button" data-yaku-reset>清除筛选</button>';
    html += '</div></div>';
    return html;
  }

  function skeletonHtml() {
    var html = '';
    for (var i = 0; i < 6; i++) {
      html += '<div class="tools-card yaku-card yaku-skeleton-card" aria-hidden="true">';
      html += '<div class="tools-skeleton yaku-sk-name"></div>';
      html += '<div class="tools-skeleton yaku-sk-line"></div>';
      html += '<div class="tools-skeleton yaku-sk-line is-short"></div>';
      html += '<div class="tools-skeleton yaku-sk-hand"></div>';
      html += '</div>';
    }
    return html;
  }

  /* ---------------- 外壳 ---------------- */

  function shellHtml() {
    var html = '<div class="yaku-toolbar">';
    html += '<div class="yaku-search-row">';
    html += '<label class="yaku-search">';
    html += '<span class="yaku-search-icon" aria-hidden="true">' + SEARCH_ICON + '</span>';
    html += '<input class="yaku-search-input" id="yakuSearch" type="search" ' +
      'placeholder="搜索役种：立直、七对子、染手…" aria-label="搜索役种" ' +
      'autocomplete="off" spellcheck="false">';
    html += '<button class="yaku-search-clear" id="yakuClear" type="button" aria-label="清除搜索" hidden>' +
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" ' +
      'stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12"/><path d="M18 6 6 18"/></svg>' +
      '</button></label>';
    html += '<span class="yaku-total" id="yakuTotal">正在载入…</span>';
    html += '</div>';

    html += '<div class="tools-seg yaku-seg" role="group" aria-label="按番数筛选">';
    for (var i = 0; i < TABS.length; i++) {
      var t = TABS[i];
      html += '<button class="tools-seg-btn yaku-seg-btn' + (t.key === 'all' ? ' is-active' : '') + '"' +
        ' type="button" data-yaku-tab="' + t.key + '" aria-pressed="' + (t.key === 'all' ? 'true' : 'false') + '">' +
        esc(t.label) + '<span class="yaku-seg-num" data-count="' + t.key + '"></span></button>';
    }
    html += '</div></div>';

    html += '<div class="yaku-summary">';
    html += '<span class="yaku-count" id="yakuCount" aria-live="polite">正在加载役种数据…</span>';
    html += '<span class="yaku-hint" id="yakuHint"></span>';
    html += '</div>';

    html += '<div class="yaku-list" id="yakuList">' + skeletonHtml() + '</div>';

    html += '<div class="yaku-more" id="yakuMore" hidden>';
    html += '<button class="tools-btn tools-btn-ghost" type="button" id="yakuMoreBtn">加载更多</button>';
    html += '<button class="tools-btn tools-btn-ghost tools-btn-sm" type="button" id="yakuAllBtn">显示全部</button>';
    html += '</div>';
    html += '<div class="yaku-end" id="yakuEnd" hidden></div>';
    html += '<div class="yaku-sentinel" id="yakuSentinel" aria-hidden="true"></div>';
    return html;
  }

  function cacheRefs(root) {
    state.root = root;
    state.listEl = root.querySelector('#yakuList');
    state.countEl = root.querySelector('#yakuCount');
    state.hintEl = root.querySelector('#yakuHint');
    state.totalEl = root.querySelector('#yakuTotal');
    state.searchEl = root.querySelector('#yakuSearch');
    state.clearEl = root.querySelector('#yakuClear');
    state.moreWrap = root.querySelector('#yakuMore');
    state.moreBtn = root.querySelector('#yakuMoreBtn');
    state.allBtn = root.querySelector('#yakuAllBtn');
    state.endEl = root.querySelector('#yakuEnd');
    state.sentinel = root.querySelector('#yakuSentinel');
  }

  /* ---------------- 过滤 / 渲染 ---------------- */

  function itemMatches(item, q) {
    if (!q) return true;
    if (normalizeQuery(item.name).indexOf(q) >= 0) return true;
    if (normalizeQuery(item.desc).indexOf(q) >= 0) return true;
    var keywords = item.keywords || [];
    for (var i = 0; i < keywords.length; i++) {
      if (normalizeQuery(keywords[i]).indexOf(q) >= 0) return true;
    }
    return false;
  }

  function computeFiltered() {
    var data = state.data || [];
    var q = normalizeQuery(state.q);
    var tab = state.tab;
    var out = [];
    for (var i = 0; i < data.length; i++) {
      var item = data[i];
      if (tab !== 'all' && item.hanTab !== tab) continue;
      if (!itemMatches(item, q)) continue;
      out.push(item);
    }
    return out;
  }

  function updateTabCounts() {
    if (!state.root || !state.data) return;
    var counts = { all: state.data.length };
    for (var i = 0; i < TABS.length; i++) counts[TABS[i].key] = 0;
    for (var j = 0; j < state.data.length; j++) {
      var tab = state.data[j].hanTab;
      if (tab && counts[tab] != null) counts[tab]++;
    }
    var nums = state.root.querySelectorAll('[data-count]');
    for (var k = 0; k < nums.length; k++) {
      var key = nums[k].getAttribute('data-count');
      nums[k].textContent = counts[key] ? String(counts[key]) : '';
    }
  }

  function updateTabs() {
    if (!state.root) return;
    var btns = state.root.querySelectorAll('[data-yaku-tab]');
    for (var i = 0; i < btns.length; i++) {
      var on = btns[i].getAttribute('data-yaku-tab') === state.tab;
      btns[i].classList.toggle('is-active', on);
      btns[i].setAttribute('aria-pressed', on ? 'true' : 'false');
    }
  }

  function updateSummary() {
    if (!state.countEl) return;
    var total = state.filtered.length;
    var q = String(state.q || '').trim();
    var tab = state.tab === 'all' ? '' : tabLabel(state.tab);
    var text;
    if (q && tab) text = '「' + tab + '」中匹配「' + q + '」：' + total + ' 种';
    else if (q) text = '搜索「' + q + '」：' + total + ' 种';
    else if (tab) text = tab + '役种：' + total + ' 种';
    else text = '共 ' + total + ' 种役种';
    state.countEl.textContent = text;

    if (state.hintEl) {
      if (total === 0) state.hintEl.textContent = '';
      else if (state.shown < total) state.hintEl.textContent = '已显示 ' + state.shown + ' 种';
      else state.hintEl.textContent = '';
    }
    if (state.totalEl) {
      state.totalEl.textContent = state.data ? '收录 ' + state.data.length + ' 种' : '正在载入…';
    }
  }

  function updateMore() {
    var total = state.filtered.length;
    var remaining = total - state.shown;
    var hasData = !!(state.data && state.data.length);

    if (state.moreWrap) {
      var show = hasData && total > 0 && remaining > 0;
      if (show) state.moreWrap.removeAttribute('hidden');
      else state.moreWrap.setAttribute('hidden', '');
    }
    if (state.moreBtn) {
      state.moreBtn.textContent = remaining > 0
        ? '加载更多（还有 ' + remaining + ' 种）'
        : '加载更多';
    }
    if (state.allBtn) {
      if (remaining > PAGE_SIZE) state.allBtn.removeAttribute('hidden');
      else state.allBtn.setAttribute('hidden', '');
    }
    if (state.endEl) {
      var showEnd = hasData && total > PAGE_SIZE && remaining === 0;
      if (showEnd) {
        state.endEl.textContent = '已显示全部 ' + total + ' 种役种';
        state.endEl.removeAttribute('hidden');
      } else {
        state.endEl.setAttribute('hidden', '');
      }
    }
    if (state.clearEl) {
      if (String(state.q || '').trim()) state.clearEl.removeAttribute('hidden');
      else state.clearEl.setAttribute('hidden', '');
    }
  }

  function clearFocus() {
    if (state.focusTimer) {
      clearTimeout(state.focusTimer);
      state.focusTimer = null;
    }
    if (!state.listEl) return;
    var focused = state.listEl.querySelectorAll('.yaku-card.is-focus');
    for (var i = 0; i < focused.length; i++) focused[i].classList.remove('is-focus');
  }

  function render() {
    if (!state.listEl) return;
    clearFocus();
    state.filtered = computeFiltered();
    if (!state.filtered.length) {
      state.listEl.innerHTML = emptyHtml();
    } else {
      var end = Math.min(state.shown, state.filtered.length);
      state.listEl.innerHTML = cardsHtml(0, end);
    }
    updateTabs();
    updateSummary();
    updateMore();
  }

  function appendMore(count) {
    if (!state.listEl) return;
    var total = state.filtered.length;
    if (state.shown >= total) return;
    var start = state.shown;
    var end = Math.min(total, start + (count || PAGE_SIZE));
    state.listEl.insertAdjacentHTML('beforeend', cardsHtml(start, end));
    state.shown = end;
    updateSummary();
    updateMore();
  }

  function showAll() {
    if (!state.listEl) return;
    var total = state.filtered.length;
    if (state.shown >= total) return;
    state.listEl.insertAdjacentHTML('beforeend', cardsHtml(state.shown, total));
    state.shown = total;
    updateSummary();
    updateMore();
  }

  /* ---------------- 定位 / 高亮 ---------------- */

  function findFocusIndex(list, query) {
    var q = normalizeQuery(query);
    var i;
    for (i = 0; i < list.length; i++) {
      if (normalizeQuery(list[i].name) === q) return i;
    }
    for (i = 0; i < list.length; i++) {
      var keywords = list[i].keywords || [];
      for (var k = 0; k < keywords.length; k++) {
        if (normalizeQuery(keywords[k]) === q) return i;
      }
    }
    for (i = 0; i < list.length; i++) {
      if (normalizeQuery(list[i].name).indexOf(q) >= 0) return i;
    }
    return -1;
  }

  function highlightCard(index) {
    if (!state.listEl) return;
    var card = state.root.querySelector('#yaku-item-' + index);
    if (!card) return;
    card.classList.add('is-focus');
    var scroll = function () {
      try {
        card.scrollIntoView({ behavior: reducedMotion() ? 'auto' : 'smooth', block: 'center' });
      } catch (e) {
        card.scrollIntoView();
      }
    };
    if (global.requestAnimationFrame) global.requestAnimationFrame(scroll);
    else setTimeout(scroll, 30);

    if (state.focusTimer) clearTimeout(state.focusTimer);
    state.focusTimer = setTimeout(function () {
      card.classList.remove('is-focus');
      state.focusTimer = null;
    }, 6000);
  }

  function applyFocus(query) {
    var text = String(query == null ? '' : query).trim();
    if (!text || !state.data) return false;

    state.q = text;
    state.tab = 'all';
    state.shown = PAGE_SIZE;
    if (state.searchEl) state.searchEl.value = text;
    if (state.searchEl) state.searchEl.classList.add('has-value');

    state.filtered = computeFiltered();
    var idx = findFocusIndex(state.filtered, text);
    if (idx >= 0) {
      var pages = Math.ceil((idx + 1) / PAGE_SIZE);
      state.shown = Math.max(PAGE_SIZE, pages * PAGE_SIZE);
    }
    render();

    if (idx >= 0) {
      highlightCard(idx);
      return true;
    }
    return false;
  }

  function clearSearch(keepTab) {
    state.q = '';
    if (state.searchEl) {
      state.searchEl.value = '';
      state.searchEl.classList.remove('has-value');
    }
    if (!keepTab) state.tab = 'all';
    state.shown = PAGE_SIZE;
    render();
  }

  /* ---------------- 加载 / 错误 ---------------- */

  function showError(message) {
    if (!state.listEl) return;
    state.listEl.innerHTML = '<div class="tools-empty is-error yaku-empty">' +
      '<h3>役种数据加载失败</h3>' +
      '<p>' + esc(message || '未知错误') + '</p>' +
      '<div class="tools-empty-actions">' +
      '<button class="tools-btn tools-btn-ghost tools-btn-sm" type="button" data-yaku-retry>重新加载</button>' +
      '</div></div>';
    if (state.countEl) state.countEl.textContent = '数据加载失败';
    if (state.totalEl) state.totalEl.textContent = '载入失败';
    if (state.moreWrap) state.moreWrap.setAttribute('hidden', '');
    if (state.endEl) state.endEl.setAttribute('hidden', '');
  }

  function load() {
    if (!state.listEl) return;
    state.listEl.innerHTML = skeletonHtml();
    if (state.countEl) state.countEl.textContent = '正在加载役种数据…';
    if (state.moreWrap) state.moreWrap.setAttribute('hidden', '');
    if (state.endEl) state.endEl.setAttribute('hidden', '');

    var loader = global.MJ && global.MJ.data && global.MJ.data.loadYaku;
    if (typeof loader !== 'function') {
      showError('数据加载器未就绪，请确认 assets/tools/data.js 已正确加载。');
      return;
    }

    var promise;
    try {
      promise = loader.call(global.MJ.data);
    } catch (err) {
      showError(err && err.message ? err.message : String(err));
      return;
    }

    promise.then(function (data) {
      if (!state.root || !document.documentElement.contains(state.root)) return;
      state.data = Array.isArray(data) ? data : [];
      state.filtered = state.data.slice();
      state.shown = PAGE_SIZE;
      updateTabCounts();
      if (!state.data.length) {
        showError('数据文件为空，请检查 assets/tools/data/yaku.json。');
        return;
      }
      if (state.searchEl) {
        state.searchEl.disabled = false;
        state.searchEl.placeholder = '搜索役种：立直、七对子、染手…';
      }

      if (pendingFocus) {
        var focusName = pendingFocus;
        pendingFocus = null;
        applyFocus(focusName);
        return;
      }

      var hashQuery = readHashQuery();
      if (hashQuery) {
        lastHashQuery = hashQuery;
        applyFocus(hashQuery);
        return;
      }
      render();
    }).catch(function (err) {
      showError(err && err.message ? err.message : String(err));
    });
  }

  /* ---------------- 事件 ---------------- */

  function onSearchInput() {
    if (!state.data) return;
    if (state.searchTimer) clearTimeout(state.searchTimer);
    var value = state.searchEl ? state.searchEl.value : '';
    if (state.searchEl) {
      if (value) state.searchEl.classList.add('has-value');
      else state.searchEl.classList.remove('has-value');
    }
    state.searchTimer = setTimeout(function () {
      state.q = value;
      state.shown = PAGE_SIZE;
      render();
    }, 140);
  }

  function bindRoot() {
    var root = state.root;
    if (!root) return;

    root.addEventListener('click', function (ev) {
      var target = ev.target;
      if (!target || !target.closest) return;

      var tabBtn = target.closest('[data-yaku-tab]');
      if (tabBtn && root.contains(tabBtn)) {
        var key = tabBtn.getAttribute('data-yaku-tab');
        if (key && key !== state.tab) {
          state.tab = key;
          state.shown = PAGE_SIZE;
          render();
          if (state.listEl && state.listEl.getBoundingClientRect().top < 0) {
            try {
              state.listEl.scrollIntoView({ behavior: reducedMotion() ? 'auto' : 'smooth', block: 'start' });
            } catch (e) { /* ignore */ }
          }
        }
        return;
      }

      if (target.closest('#yakuMoreBtn')) {
        appendMore(PAGE_SIZE);
        return;
      }

      if (target.closest('#yakuAllBtn')) {
        showAll();
        return;
      }

      if (target.closest('[data-yaku-reset]')) {
        clearSearch(false);
        return;
      }

      if (target.closest('[data-yaku-retry]')) {
        if (global.MJ && global.MJ.data && typeof global.MJ.data.clear === 'function') {
          global.MJ.data.clear('yaku');
        }
        load();
        return;
      }

      if (target.closest('#yakuClear')) {
        clearSearch(true);
        if (state.searchEl) state.searchEl.focus();
      }
    });

    if (state.searchEl) {
      state.searchEl.addEventListener('input', onSearchInput);
      state.searchEl.addEventListener('keydown', function (ev) {
        if (ev.key === 'Escape') {
          ev.preventDefault();
          clearSearch(true);
        }
      });
    }

    if (state.searchEl) state.searchEl.disabled = true;

    bindObserver();
  }

  function bindObserver() {
    if (state.observer) {
      try { state.observer.disconnect(); } catch (e) { /* ignore */ }
      state.observer = null;
    }
    if (!state.sentinel || typeof global.IntersectionObserver !== 'function') return;
    state.observer = new global.IntersectionObserver(function (entries) {
      for (var i = 0; i < entries.length; i++) {
        if (entries[i].isIntersecting) {
          if (state.data && state.filtered.length > state.shown) appendMore(PAGE_SIZE);
        }
      }
    }, { rootMargin: '320px 0px' });
    state.observer.observe(state.sentinel);
  }

  function bindGlobals() {
    if (globalsBound) return;
    globalsBound = true;

    global.addEventListener('hashchange', function () {
      if (!state.root || !state.data) return;
      var current = global.MJ && global.MJ.tools && global.MJ.tools.current
        ? global.MJ.tools.current() : null;
      if (current !== MODULE) return;
      var q = readHashQuery();
      if (!q || q === lastHashQuery) return;
      lastHashQuery = q;
      applyFocus(q);
    });

    document.addEventListener('mj:tools-activate', function (ev) {
      if (!ev || !ev.detail || ev.detail.name !== MODULE) return;
      if (!state.data) return;
      var q = readHashQuery();
      if (q && q !== lastHashQuery) {
        lastHashQuery = q;
        applyFocus(q);
      }
    });
  }

  /* ---------------- 对外 API ---------------- */

  function init(panel) {
    if (!panel) return;
    pendingFocus = pendingFocus || null;
    state.data = null;
    state.filtered = [];
    state.tab = 'all';
    state.q = '';
    state.shown = PAGE_SIZE;
    if (state.searchTimer) {
      clearTimeout(state.searchTimer);
      state.searchTimer = null;
    }

    panel.innerHTML = shellHtml();
    cacheRefs(panel);
    bindGlobals();
    bindRoot();
    load();
  }

  function focus(name) {
    var text = String(name == null ? '' : name).trim();
    if (!text) return false;

    var tools = global.MJ && global.MJ.tools;
    var current = tools && typeof tools.current === 'function' ? tools.current() : null;
    var canActivate = tools && typeof tools.activate === 'function';

    if (canActivate && current !== MODULE) {
      pendingFocus = text;
      tools.activate(MODULE);
      if (state.data) {
        pendingFocus = null;
        return applyFocus(text);
      }
      return true;
    }

    if (!state.data) {
      pendingFocus = text;
      return true;
    }
    return applyFocus(text);
  }

  global.MJ = global.MJ || {};
  global.MJ.modules = global.MJ.modules || {};
  global.MJ.modules[MODULE] = {
    init: init,
    focus: focus,
    hanText: hanText,
    openText: openText
  };
})(typeof window !== 'undefined' ? window : this);
