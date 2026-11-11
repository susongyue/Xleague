(function(){
  'use strict';
  var toc = document.getElementById('toc');
  var sidebar = document.getElementById('sidebar');
  var backdrop = document.getElementById('backdrop');
  var menuToggle = document.getElementById('menuToggle');
  var closeNav = document.getElementById('closeNav');
  var filter = document.getElementById('tocFilter');
  var clearFilter = document.getElementById('clearFilter');
  var filterHint = document.getElementById('filterHint');
  // 多页版正文里没有进度条时这两个元素可能不存在，全部调用点都要判空
  var progressBar = document.getElementById('progressBar');
  var toTop = document.getElementById('toTop');
  var links = Array.prototype.slice.call(toc.querySelectorAll('.toc-link'));
  // 目录只到「条」一级，而正文还带着 171 个「项」锚点：建立 锚点 → 最近目录链接 的映射，
  // 让滚动高亮 / 上次阅读位置都能落到一个有目录链接的锚点上
  var tocTargets = {};
  links.forEach(function(a){ tocTargets[a.getAttribute('data-target')] = true; });
  var nearestTocId = (function(){
    var map = {};
    var pagesForMap = Array.prototype.slice.call(document.querySelectorAll('.doc > .page'));
    pagesForMap.forEach(function(pg){
      var last = null;
      Array.prototype.slice.call(pg.querySelectorAll('[data-anchor]')).forEach(function(el){
        if (tocTargets[el.id]) last = el.id;
        map[el.id] = last || el.id;
      });
    });
    return map;
  })();
  function tocIdFor(id){ return nearestTocId[id] || id; }
  var anchors = Array.prototype.slice.call(document.querySelectorAll('[data-anchor]'));
  var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  var mobileQuery = window.matchMedia('(max-width: 1023px)');
  var chevron = '<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m9 18 6-6-6-6"/></svg>';

  // ---------- 分页状态 ----------
  var pages = Array.prototype.slice.call(document.querySelectorAll('.doc > .page'));
  // 确保 data-page 顺序正确（front 为 0，chapter 1..9）
  pages.forEach(function(pg, i){ pg.setAttribute('data-page', String(i)); });
  var totalPages = pages.length;
  var currentPage = 0;
  var PAGE_LABELS = ['序 · 文档说明'].concat(pages.slice(1).map(function(pg){
    var t = pg.querySelector('.chapter-title');
    return t ? t.textContent.trim() : ('第' + (pg.getAttribute('data-page') - 0) + '页');
  }));
  var prevTop = document.getElementById('prevTop'), nextTop = document.getElementById('nextTop'), jumpTop = document.getElementById('jumpTop');
  var prevFoot = document.getElementById('prevFoot'), nextFoot = document.getElementById('nextFoot');
  var labelFoot = document.getElementById('pagerFootLabel'), countFoot = document.getElementById('pagerFootCount');

  // 构建跳转下拉
  PAGE_LABELS.forEach(function(lb, i){
    var opt = document.createElement('option');
    opt.value = String(i);
    opt.textContent = (i === 0 ? '序' : '第' + i + '章') + ' · ' + lb;
    if (jumpTop) jumpTop.appendChild(opt);
  });

  function pageTitle(i){
    return (i === 0 ? '序 · 文档说明' : '第' + i + '章 · ' + PAGE_LABELS[i]);
  }
  // 把锚点 id 映射成可读标题，用于「上次读到 …」提示与跳转 aria 描述
  function anchorLabel(id, pageIdx){
    if (!id) return '';
    var el = document.getElementById(id);
    if (!el) return '';
    var pi = (typeof pageIdx === 'number') ? pageIdx : currentPage;
    var base = pageTitle(pi);
    if (/^ch-/.test(id)) return base;
    var head = el.closest('.article-head');
    if (head){
      var badgeEl = head.querySelector('.article-badge');
      var num = badgeEl ? badgeEl.textContent.trim() : '';
      var t = el.textContent.trim();
      if (!/^第\d+条/.test(t)) t = (num ? num + ' ' : '') + t;
      return base + ' · ' + t;
    }
    var it = el.closest('.item-head');
    if (it) return base + ' · ' + it.textContent.trim();
    var txt = (el.textContent || '').replace(/\s+/g, ' ').trim();
    return base + (txt ? ' · ' + txt.slice(0, 24) : '');
  }

  function renderPager(){
    labelFoot.textContent = pageTitle(currentPage);
    countFoot.textContent = (currentPage + 1) + ' / ' + totalPages;
    if (jumpTop) jumpTop.value = String(currentPage);
    if (prevTop) prevTop.disabled = currentPage === 0;
    if (nextTop) nextTop.disabled = currentPage === totalPages - 1;
    prevFoot.disabled = currentPage === 0;
    nextFoot.disabled = currentPage === totalPages - 1;
    if (progressBar) progressBar.style.width = (totalPages > 1 ? (currentPage / (totalPages - 1)) * 100 : 0) + '%';
  }

  // ---------- 页内小节导航（chips）已移除 ----------
  function syncSectionNav(){}
  function refreshSectionNav(){}

  function goToPage(n, opts){
    opts = opts || {};
    if (n < 0) n = 0;
    if (n >= totalPages) n = totalPages - 1;
    if (n === currentPage && !opts.force) { renderPager(); if (opts.focus) focusPage(pages[n]); return; }
    currentPage = n;
    pages.forEach(function(pg, i){ pg.classList.toggle('is-active', i === n); });
    if (typeof posDirty !== 'undefined') posDirty = true;
    renderPager();
    refreshSectionNav();
    syncSectionNav();
    if (opts.scrollTop !== false){
      var y = opts.scrollY != null ? opts.scrollY : 0;
      // 翻页是「换一页」而不是滚动动画：直接跳到顶部，避免动画期间看到上一页的滚动位置
      scrollContentTo(y, false);
    }
    if (opts.focus) focusPage(pages[n]);
  }

  // 翻页后把焦点移到新页首，读屏与键盘用户才能感知「换页」
  function focusPage(pg){
    if (!pg) return;
    var target = pg.querySelector('.chapter-title, .front h2') || pg;
    if (!target.hasAttribute('tabindex')) target.setAttribute('tabindex', '-1');
    try { target.focus({preventScroll: true}); } catch(e){}
  }

  function pageOfAnchor(el){
    var pg = el.closest('.page');
    if (!pg) return 0;
    return parseInt(pg.getAttribute('data-page'), 10) || 0;
  }

  document.getElementById('linkCount').textContent = links.length;
  toc.querySelectorAll('.toc-toggle').forEach(function(btn){ btn.innerHTML = chevron; });

  // 缓存目录标签原文，供筛选命中高亮，避免重复重建时丢失文本
  var labelEls = Array.prototype.slice.call(toc.querySelectorAll('.toc-label'));
  labelEls.forEach(function(lb){ if (!lb.hasAttribute('data-label')) lb.setAttribute('data-label', lb.textContent); });

  function escapeReg(s){ return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }
  function highlightLabels(q){
    labelEls.forEach(function(lb){
      var text = lb.getAttribute('data-label') || '';
      if (!q){ lb.textContent = text; return; }
      var idx = text.toLowerCase().indexOf(q);
      if (idx === -1){ lb.textContent = text; return; }
      lb.textContent = '';
      var pre = document.createTextNode(text.slice(0, idx));
      var mk = document.createElement('mark');
      mk.textContent = text.slice(idx, idx + q.length);
      var post = document.createTextNode(text.slice(idx + q.length));
      lb.appendChild(pre); lb.appendChild(mk); lb.appendChild(post);
    });
  }

  function headerHeight(){
    var root = getComputedStyle(document.documentElement);
    // 规则页双栏模式下顶栏是站点的 --site-h，旧的 --header-h 会让高亮位置偏 4px
    if (document.body.classList.contains('rules-page')){
      var siteH = parseFloat(root.getPropertyValue('--site-h'));
      if (siteH) return siteH;
    }
    return parseFloat(root.getPropertyValue('--header-h')) || 76;
  }

  // 规则页在桌面端是「目录 + 正文」双栏各自滚动：正文真正的滚动容器是 .rules-layout > .main。
  // 高亮、进度条、返回顶部、翻页复位全部改成读这个容器；没有该容器时（移动端 / 未启用双栏）回退 window。
  function contentScroller(){
    // 只判断元素是否存在：翻页瞬间布局还没重算，用「能不能滚」当条件会误判成 null
    return document.querySelector('.rules-layout > .main');
  }
  function scrollTopVal(){
    var sc = contentScroller();
    return sc ? sc.scrollTop : window.scrollY;
  }
  function atBottom(){
    var sc = contentScroller();
    if (sc) return sc.scrollTop + sc.clientHeight >= sc.scrollHeight - 4;
    return window.scrollY + window.innerHeight >= document.documentElement.scrollHeight - 4;
  }
  function scrollMax(){
    var sc = contentScroller();
    if (sc) return sc.scrollHeight - sc.clientHeight;
    return document.documentElement.scrollHeight - window.innerHeight;
  }
  function scrollContentTo(y, smooth){
    var opt = {top: y, behavior: (smooth && !reduceMotion.matches) ? 'smooth' : 'auto'};
    var sc = contentScroller();
    if (sc) sc.scrollTo(opt); else window.scrollTo(opt);
  }

  // 目录就地展开动效：grid-template-rows 0fr ⇄ 1fr + 子项错峰滑入
  // [hidden] 与 grid 布局互斥（隐藏元素不参与行高计算，过渡会直接跳到终值），
  // 因此隐藏态改用 .is-closed（grid 行高 0 + visibility:hidden），元素始终参与布局。
  var collapseTimers = new WeakMap();
  function setExpanded(id, open, animate){
    var box = document.getElementById(id);
    if (!box) return;
    var btn = toc.querySelector('.toc-toggle[aria-controls="' + id + '"]');
    if (btn) btn.setAttribute('aria-expanded', open ? 'true' : 'false');
    var t = collapseTimers.get(box);
    if (t) { clearTimeout(t); collapseTimers.delete(box); }
    var instant = !animate || reduceMotion.matches;
    var isOpen = box.classList.contains('is-open');
    if (btn){
      var lb = btn.getAttribute('data-label') || btn.getAttribute('aria-label') || '';
      if (/^展开\s/.test(lb)) lb = lb.replace(/^展开\s/, '');
      btn.setAttribute('data-label', lb);
      btn.setAttribute('aria-label', (open ? '收起 ' : '展开 ') + lb);
    }

    if (open){
      box.hidden = false;
      if (isOpen && !box.classList.contains('is-closed') && !box.style.height){
        return;
      }
      if (instant){
        box.style.height = '';
        box.classList.remove('is-closed');
        box.classList.add('is-open');
        return;
      }
      // 关键：必须先切到 .is-open（height:auto）再测量，否则量到的是收起态的内联/规则高度 0
      var prevH = box.getBoundingClientRect().height;
      box.classList.remove('is-closed');
      box.classList.add('is-open');
      box.style.height = 'auto';
      var target = box.scrollHeight;
      box.style.height = prevH + 'px';
      void box.offsetHeight;
      box.style.height = target + 'px';
      collapseTimers.set(box, setTimeout(function(){
        box.style.height = '';
        collapseTimers.delete(box);
      }, 260));
    } else {
      if (!isOpen && box.classList.contains('is-closed')) return;
      if (instant){
        box.style.height = '';
        box.classList.remove('is-open');
        box.classList.add('is-closed');
        return;
      }
      var cur = box.getBoundingClientRect().height;
      box.style.height = cur + 'px';
      void box.offsetHeight;
      box.classList.remove('is-open');
      box.classList.add('is-closed');
      box.style.height = '0px';
      collapseTimers.set(box, setTimeout(function(){
        box.style.height = '';
        collapseTimers.delete(box);
      }, 220));
    }
  }

  function resetExpansion(){
    var first = toc.querySelector('.toc-children');
    toc.querySelectorAll('.toc-children').forEach(function(box){
      // 保留当前已展开的章，避免清空筛选时把用户正读的章节一起收起
      if (box === first || box.classList.contains('is-open')) return;
      setExpanded(box.id, false);
    });
    if (first) setExpanded(first.id, true);
  }

  function filterGroup(group, q){
    var row = group.querySelector(':scope > .toc-row');
    var ownLink = row ? row.querySelector('.toc-link') : null;
    var selfMatch = !q || (!!ownLink && ownLink.textContent.toLowerCase().indexOf(q) !== -1);
    var box = group.querySelector(':scope > .toc-children');
    var childMatch = false;
    if (box){
      Array.prototype.forEach.call(box.children, function(child){
        var visible = false;
        if (child.classList.contains('toc-group')) visible = filterGroup(child, q);
        else if (child.classList.contains('toc-link')){
          visible = !q || child.textContent.toLowerCase().indexOf(q) !== -1;
          child.hidden = !visible;
        }
        if (visible) childMatch = true;
      });
      var showBox = !q || selfMatch || childMatch;
      box.hidden = !showBox;
      if (!q) box.hidden = false;
      if (q && showBox) setExpanded(box.id, true);
    }
    // 只在「本章没有任何命中」时才隐藏本行，否则会连带隐藏命中的子级
    var visible = !q || selfMatch || childMatch;
    if (row) row.hidden = !visible;
    // 分组容器永远不隐藏（隐藏父级 = 连带隐藏所有命中子级），改由行 / 子箱控制可见性
    group.hidden = false;
    return visible;
  }

  function applyFilter(){
    var q = filter.value.trim().toLowerCase();
    clearFilter.classList.toggle('visible', !!q);
    var any = false;
    Array.prototype.forEach.call(toc.children, function(node){
      var visible = false;
      if (node.classList.contains('toc-group')) visible = filterGroup(node, q);
      else if (node.classList.contains('toc-link')){
        visible = !q || node.textContent.toLowerCase().indexOf(q) !== -1;
        node.hidden = !visible;
      } else if (node.classList.contains('toc-empty')){
        node.hidden = true;
        return;
      }
      if (visible) any = true;
    });
    var empty = toc.querySelector('.toc-empty');
    if (empty) empty.hidden = any;
    var visLinks = links.filter(function(a){ return !a.hidden && !a.closest('[hidden]'); });
    filterHint.innerHTML = q
      ? '匹配 <b>' + visLinks.length + '</b> 个条目'
      : '共 <b>' + links.length + '</b> 个可跳转小节 · 点击目录平滑定位';
    highlightLabels(q);
    if (!q){
      resetExpansion();
      activeId = null;
      updateSpy();
    }
  }

  function isMobile(){ return mobileQuery.matches; }

  function openDrawer(){
    sidebar.classList.add('open');
    backdrop.classList.add('show');
    menuToggle.setAttribute('aria-expanded','true');
    backdrop.hidden = false;
    syncInert();
  }
  function closeDrawer(){
    sidebar.classList.remove('open');
    backdrop.classList.remove('show');
    menuToggle.setAttribute('aria-expanded','false');
    backdrop.hidden = true;
    syncInert();
  }
  function syncInert(){
    if (isMobile() && !sidebar.classList.contains('open')) sidebar.setAttribute('inert','');
    else sidebar.removeAttribute('inert');
  }

  var activeId = null;
  var lastHashId = null;
  var lastRoot = null;
  function setActive(id, scrollNav){
    if (id === activeId) return;
    activeId = id;
    syncHash();
    syncSectionNav();
    links.forEach(function(a){
      var on = a.getAttribute('data-target') === id;
      a.classList.toggle('is-active', on);
      a.classList.remove('is-branch');
      if (on) a.setAttribute('aria-current','location'); else a.removeAttribute('aria-current');
    });
    var active = toc.querySelector('.toc-link[data-target="' + id + '"]');
    if (!active) return;
    var chain = [];
    var box = active.closest('.toc-children');
    while (box){
      chain.push(box.id);
      var parentRow = box.parentElement.querySelector(':scope > .toc-row > .toc-link');
      if (parentRow) parentRow.classList.add('is-branch');
      box = box.parentElement.closest('.toc-children');
    }
    if (!filter.value.trim() && chain.length){
      var root = chain[chain.length - 1];
      if (root !== lastRoot){
        toc.querySelectorAll(':scope > .toc-group > .toc-children').forEach(function(b){
          if (b.id !== root) setExpanded(b.id, false);
        });
        lastRoot = root;
      }
      chain.forEach(function(cid){ setExpanded(cid, true); });
    }
    if (scrollNav !== false){
      var r = active.getBoundingClientRect(), nr = toc.getBoundingClientRect();
      if (r.top < nr.top + 8 || r.bottom > nr.bottom - 8){
        toc.scrollTop += (r.top - nr.top) - nr.height / 2;
      }
    }
  }

  var spyLockUntil = 0;
  function lockSpy(ms){ spyLockUntil = Date.now() + (ms || 900); }
  function updateSpy(){
    if (Date.now() < spyLockUntil) return;
    // 只统计当前显示页内的锚点
    var activePage = pages[currentPage];
    var pageAnchors = activePage ? Array.prototype.slice.call(activePage.querySelectorAll('[data-anchor]')) : [];
    var pagerEl = document.querySelector('.pager');
    var pagerH = pagerEl ? pagerEl.getBoundingClientRect().height : 0;
    var offset = headerHeight() + pagerH + 16;
    var current = pageAnchors[0];
    for (var i = 0; i < pageAnchors.length; i++){
      if (pageAnchors[i].getBoundingClientRect().top <= offset) current = pageAnchors[i];
      else break;
    }
    if (atBottom()){
      current = pageAnchors[pageAnchors.length - 1];
    }
    if (current) setActive(tocIdFor(current.id));
    scheduleSavePosition();
    // 进度条：章间 + 章内滚动综合
    var max = scrollMax();
    var scrollFrac = max > 0 ? scrollTopVal() / max : 0;
    var pageFrac = totalPages > 1 ? currentPage / (totalPages - 1) : 0;
    // 进度 = 页间进度为主，页内滚动微调（每页贡献 1/totalPages 的滚动区间）
    var combined;
    if (max <= 0){ combined = pageFrac; }
    else if (totalPages > 1){
      var perPage = 1 / (totalPages - 1);
      combined = Math.min(1, (currentPage * perPage) + (scrollFrac * perPage));
    } else { combined = scrollFrac; }
    if (progressBar) progressBar.style.width = (combined * 100) + '%';
    if (toTop) toTop.classList.toggle('visible', scrollTopVal() > 420);
  }

  var ticking = false, tickTimer = null;
  function onScroll(){
    if (ticking) return;
    ticking = true;
    var run = function(){
      if (!ticking) return;      // 已经被另一条通路执行过
      ticking = false;
      updateSpy();
    };
    // rAF 在后台标签页 / 无渲染帧的环境里不会触发，加一条定时兜底，保证高亮总会更新
    if (window.requestAnimationFrame) requestAnimationFrame(run);
    clearTimeout(tickTimer);
    tickTimer = setTimeout(run, 120);
  }
  window.addEventListener('scroll', function(){
    posDirty = true;
    onScroll();
  }, {passive:true});
  var contentScrollEl = document.querySelector('.rules-layout > .main');
  if (contentScrollEl){
    contentScrollEl.addEventListener('scroll', function(){
      posDirty = true;
      onScroll();
    }, {passive:true});
  }
  window.addEventListener('resize', function(){ syncInert(); onScroll(); });

  // ---------- URL 同步：随翻阅/滚动更新 hash（不进历史栈） ----------
  function syncHash(){
    if (!activeId || activeId === lastHashId) return;
    lastHashId = activeId;
    if (history.replaceState) history.replaceState(null, '', '#' + activeId);
  }

  // ---------- 阅读位置记忆 ----------
  var POS_KEY = 'xq-pos';
  var saveTimer = null;
  var posDirty = false;
  function markPosDirty(){ posDirty = true; }
  function scheduleSavePosition(){
    if (saveTimer) return;
    saveTimer = setTimeout(function(){
      saveTimer = null;
      if (!posDirty || !activeId) return;
      posDirty = false;
      try {
        localStorage.setItem(POS_KEY, JSON.stringify({ page: currentPage, anchor: activeId, t: Date.now() }));
      } catch(e){}
    }, 600);
  }
  function readSavedPosition(){
    try {
      var raw = localStorage.getItem(POS_KEY);
      if (!raw) return null;
      var o = JSON.parse(raw);
      if (!o || typeof o.page !== 'number') return null;
      if (o.page < 0 || o.page >= totalPages) return null;
      if (!o.anchor || !document.getElementById(o.anchor)) return null;
      return o;
    } catch(e){ return null; }
  }
  toc.addEventListener('click', function(e){
    var toggle = e.target.closest('.toc-toggle');
    if (toggle && !toggle.classList.contains('empty')){
      var box = document.getElementById(toggle.getAttribute('aria-controls'));
      // 以 is-closed 类判定当前是否收起（不再依赖 hidden 属性），并开启动画
      if (box) setExpanded(box.id, box.classList.contains('is-closed'), true);
      return;
    }
    var link = e.target.closest('.toc-link');
    if (!link) return;
    e.preventDefault();
    var id = link.getAttribute('data-target');
    var el = document.getElementById(id);
    if (!el) return;
    var targetPage = pageOfAnchor(el);
    pendingNav = { id: id };
    lockSpy(reduceMotion.matches ? 60 : 900);
    if (targetPage !== currentPage){
      goToPage(targetPage, {scrollTop: false, force: true});
      requestAnimationFrame(function(){
        if (el.hidden) el.hidden = false;
        el.scrollIntoView({behavior: reduceMotion.matches ? 'auto' : 'smooth', block:'start'});
        requestAnimationFrame(function(){ setActive(id); });
      });
    } else {
      if (el.hidden) el.hidden = false;
      el.scrollIntoView({behavior: reduceMotion.matches ? 'auto' : 'smooth', block:'start'});
    }
    if (history.replaceState) history.replaceState(null, '', '#' + id);
    setActive(id);
    posDirty = true;
    scheduleSavePosition();
    if (isMobile()) closeDrawer();
  });

  menuToggle.addEventListener('click', function(){
    if (sidebar.classList.contains('open')) closeDrawer(); else openDrawer();
  });
  closeNav.addEventListener('click', closeDrawer);
  backdrop.addEventListener('click', closeDrawer);
  document.addEventListener('keydown', function(e){
    if (e.key === 'Escape'){
      if (sidebar.classList.contains('open')){ closeDrawer(); menuToggle.focus(); }
      else if (document.activeElement === filter && filter.value){ filter.value=''; applyFilter(); }
    }
  });
  filter.addEventListener('input', applyFilter);
  clearFilter.addEventListener('click', function(){ filter.value=''; applyFilter(); filter.focus(); });
  if (toTop) toTop.addEventListener('click', function(){
    scrollContentTo(0, true);
  });

  // 深色模式已移除：始终使用浅色主题，不再读取系统配色或本地记录
  document.documentElement.setAttribute('data-theme', 'light');
  try { localStorage.removeItem('xq-theme'); } catch(e){}

  resetExpansion();
  syncInert();

  // 分页控件事件
  prevFoot.addEventListener('click', function(){ goToPage(currentPage - 1, {focus: true}); });
  nextFoot.addEventListener('click', function(){ goToPage(currentPage + 1, {focus: true}); });
  if (jumpTop) jumpTop.addEventListener('change', function(){ goToPage(parseInt(jumpTop.value, 10) || 0, {focus: true}); });
  // 键盘左右方向键翻页（焦点不在输入框 / 可编辑区时）
  document.addEventListener('keydown', function(e){
    if (e.altKey || e.ctrlKey || e.metaKey) return;
    var ae = document.activeElement || {};
    var tag = ae.tagName || '';
    if (/INPUT|SELECT|TEXTAREA/.test(tag) || ae.isContentEditable) return;
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
    // 焦点在按钮/链接上时，方向键留给控件本身（例如分页下拉框、目录）
    if (/BUTTON|A/.test(tag)) return;
    goToPage(currentPage + (e.key === 'ArrowLeft' ? -1 : 1), {focus: true});
  });

  // 初始页：优先 hash，其次上次阅读位置
  var startPage = 0;
  var initialEl = null;
  if (location.hash){
    initialEl = document.getElementById(decodeURIComponent(location.hash.slice(1)));
    if (initialEl) startPage = pageOfAnchor(initialEl);
  }
  var savedPos = location.hash ? null : readSavedPosition();
  goToPage(startPage, {scrollTop: false, force: true});
  renderPager();
  if (initialEl){
    requestAnimationFrame(function(){
      initialEl.scrollIntoView({behavior:'auto', block:'start'});
      setActive(tocIdFor(initialEl.id));
      onScroll();
    });
  }
  updateSpy();

  // 「继续上次阅读」提示条
  var toast = document.getElementById('resumeToast');
  var toastLabel = document.getElementById('resumeLabel');
  var toastGo = document.getElementById('resumeGo');
  var toastClose = document.getElementById('resumeClose');
  var toastTimer = null;
  function showToast(){
    if (!toast) return;
    toast.hidden = false;
    requestAnimationFrame(function(){ toast.classList.add('show'); });
  }
  function hideToast(){
    if (!toast) return;
    toast.classList.remove('show');
    toast.hidden = true;
  }
  if (savedPos && toast && toastLabel && tocIdFor(savedPos.anchor) !== activeId){
    toastLabel.textContent = anchorLabel(savedPos.anchor, savedPos.page) || ((savedPos.page === 0 ? '序' : '第' + savedPos.page + '章'));
    showToast();
    if (toastGo) toastGo.addEventListener('click', function(){
      hideToast();
      lockSpy(reduceMotion.matches ? 60 : 900);
      goToPage(savedPos.page, {scrollTop: false, force: true});
      requestAnimationFrame(function(){
        var t = document.getElementById(savedPos.anchor);
        if (t){
          t.scrollIntoView({behavior: reduceMotion.matches ? 'auto' : 'smooth', block:'start'});
          setActive(tocIdFor(t.id));
          syncSectionNav();
        }
      });
    });
    if (toastClose) toastClose.addEventListener('click', hideToast);
    // 只把焦点自动送进提示条一次，不强制关闭：让键盘 / 读屏用户有机会点「继续阅读」
    toast.addEventListener('keydown', function(){ clearTimeout(toastTimer); }, true);
    toastTimer = setTimeout(function(){
      if (toast.contains(document.activeElement)) return;
      hideToast();
    }, 12000);
  }

  // 目录/chips 跳转的收尾校正：平滑滚动结束后若目标仍偏离视口顶部，补一次定位
  var pendingNav = null;
  function settleNavCheck(){
    var p = pendingNav;
    pendingNav = null;
    if (!p) return;
    var el = document.getElementById(p.id);
    if (!el) return;
    var pagerEl = document.querySelector('.pager');
    var maxTop = headerHeight() + (pagerEl ? pagerEl.getBoundingClientRect().height : 0) + 24;
    var top = el.getBoundingClientRect().top;
    if (top > maxTop + 40 || top < maxTop - 40){
      el.scrollIntoView({behavior:'auto', block:'start'});
    }
    setActive(p.id);
    syncSectionNav();
  }
  document.addEventListener('scroll', function(){
    if (!pendingNav) return;
    if (Date.now() < spyLockUntil) return;
    settleNavCheck();
  }, { passive: true, capture: true });
  setInterval(function(){
    if (pendingNav && Date.now() >= spyLockUntil) settleNavCheck();
  }, 1200);

  // ============ 可编辑内容 ============
  var EDIT_KEY = 'xq-edit';
  var EDITABLE_SEL = '.front h2[data-anchor], .front p, .chapter-title, .article-head h3, .item-stack h4, .para, .note, .bullet, .subitem, .example, .pre-line, td, th, .table-caption, .yaku-name, .yaku-desc, .legend';
  var editToggle = document.getElementById('editToggle');
  var editbar = document.getElementById('editbar');
  var editSave = document.getElementById('editSave');
  var editExport = document.getElementById('editExport');
  var editDone = document.getElementById('editDone');
  var editItems = document.getElementById('editItems');
  var editItemsLabel = document.getElementById('editItemsLabel');
  var editing = false;

  // 「本节分项」小标题的显示偏好：默认隐藏，可记住用户选择
  var ITEMS_KEY = 'xq-items';
  function itemsOn(){
    if (!document.documentElement.hasAttribute('data-editing')) return false;
    try { return localStorage.getItem(ITEMS_KEY) !== '0'; } catch(e){ return true; }
  }
  function renderItems(){
    var on = itemsOn();
    document.documentElement.classList.toggle('xq-items-off', !on);
    if (editItems){
      editItems.setAttribute('aria-pressed', String(on));
      editItems.classList.toggle('is-on', on);
    }
    if (editItemsLabel) editItemsLabel.textContent = on ? '隐藏分项列表' : '显示分项列表';
  }

  // 读入之前保存的编辑内容；每个可编辑节点必须有「稳定 id」
  // 稳定 key 依赖：所属 section（.article/.front/.chapter）内最近的「条/章」锚点 + 类名 + 该类序号，
  // 保证刷新后 key 不变、编辑内容能恢复。
  function editScopeOf(el){
    var sec = el.closest('.article') || el.closest('.front') || el.closest('.chapter');
    if (!sec) return 'root';
    // 优先用「条/章级标题」作作用域锚点（.article-head h3 / .chapter-head h2），
    // 稳定且与正文段落的兄弟结构解耦；标题本身可编辑时，直接以其 id 为作用域。
    var titleA = sec.querySelector('.article-head h3[data-anchor]')
              || sec.querySelector('.chapter-head h2[data-anchor]');
    if (titleA) return titleA.id;
    // 兜底：无条级标题时退回「容器内之前的最后一个锚点 / 页码」
    var anchors = Array.prototype.slice.call(sec.querySelectorAll('[data-anchor]'));
    var best = null;
    for (var i = 0; i < anchors.length; i++){
      if (anchors[i].compareDocumentPosition(el) & Node.DOCUMENT_POSITION_PRECEDING){ break; }
      best = anchors[i];
    }
    return best ? best.id : (typeof sec.getAttribute === 'function' && sec.getAttribute('data-page') !== null ? 'p' + sec.getAttribute('data-page') : 'root');
  }
  function ensureEditIds(){
    var sel = Array.prototype.slice.call(document.querySelectorAll(EDITABLE_SEL));
    var counters = {};
    sel.forEach(function(el){
      if (el.closest('.pager') || el.closest('.editbar')) return;
      if (!el.id){
        var scope = editScopeOf(el);
        var cls = el.className && typeof el.className === 'string' ? el.className.trim().split(/\s+/)[0] : el.tagName.toLowerCase();
        var key = scope + '-' + cls;
        var idx = counters[key] || 0;
        counters[key] = idx + 1;
        el.id = 'ed-' + scope + '-' + cls + '-' + idx;
      }
      el.setAttribute('data-edit', '');
    });
  }

  function applySavedEdits(){
    var store = {};
    try { store = JSON.parse(localStorage.getItem(EDIT_KEY) || '{}'); } catch(e){ store = {}; }
    var sel = Array.prototype.slice.call(document.querySelectorAll('[data-edit]'));
    sel.forEach(function(el){
      if (store[el.id]) el.innerHTML = store[el.id];
    });
  }

  function collectEdits(){
    var store = {};
    var sel = Array.prototype.slice.call(document.querySelectorAll('[data-edit]'));
    sel.forEach(function(el){ store[el.id] = el.innerHTML; });
    return store;
  }

  function persistEdits(){
    try { localStorage.setItem(EDIT_KEY, JSON.stringify(collectEdits())); } catch(e){}
  }

  function setEditing(on){
    editing = on;
    if (on) document.documentElement.setAttribute('data-editing', '');
    else document.documentElement.removeAttribute('data-editing');
    document.querySelectorAll('[data-edit]').forEach(function(el){
      el.setAttribute('contenteditable', on ? 'true' : 'false');
    });
    if (editToggle){
      editToggle.classList.toggle('is-on', on);
      editToggle.setAttribute('aria-pressed', String(on));
      var lb = document.getElementById('editToggleLabel');
      if (lb) lb.textContent = on ? '编辑中' : '编辑';
    }
    if (editbar) editbar.hidden = !on;
    renderItems();
  }

  renderItems();

  // 编辑内容时自动保存（防抖）
  var editSaveTimer = null;
  function schedulePersist(){
    if (editSaveTimer) clearTimeout(editSaveTimer);
    editSaveTimer = setTimeout(function(){
      editSaveTimer = null;
      persistEdits();
      if (editSaveLabel) editSaveLabel.textContent = '已保存';
      setTimeout(function(){ if (editSaveLabel) editSaveLabel.textContent = '保存'; }, 1200);
    }, 600);
  }

  // 导出完整 HTML 文件
  function exportHtml(){
    persistEdits();
    // 去除编辑态标记，导出一份「干净」的静态页
    var clone = document.documentElement.cloneNode(true);
    var c = clone.querySelectorAll('[contenteditable]');
    c.forEach(function(el){ el.removeAttribute('contenteditable'); });
    var ceb = clone.querySelectorAll('[data-edit]');
    ceb.forEach(function(el){ el.removeAttribute('data-edit'); });
    var bar = clone.querySelector('.editbar');
    if (bar) bar.parentNode.removeChild(bar);
    var tg = clone.querySelector('.edit-toggle');
    if (tg) tg.parentNode.removeChild(tg);
    clone.removeAttribute('data-editing');
    clone.classList.remove('xq-items-off');
    var html = '<!DOCTYPE html>\n' + clone.outerHTML;
    var blob = new Blob([html], {type: 'text/html;charset=utf-8'});
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = 'index.html';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(function(){ URL.revokeObjectURL(url); }, 2000);
  }

  ensureEditIds();
  applySavedEdits();

  if (!document.querySelectorAll('[data-edit]').length){
    // 极少数环境 selectors 未匹配到任何节点时，至少保证正文段落可编辑
  }

  if (editToggle){
    editToggle.addEventListener('click', function(){
      setEditing(!editing);
      // 进入编辑时收起页面顶部进度条干扰、禁止方向键翻页
      if (editing && document.addEventListener){
        document.addEventListener('keydown', editKeyGuard, true);
      } else {
        document.removeEventListener('keydown', editKeyGuard, true);
      }
    });
  }
  function editKeyGuard(e){
    // 编辑态下，方向键用于光标移动而非翻页
    if (e.key === 'ArrowLeft' || e.key === 'ArrowRight'){
      e.stopImmediatePropagation();
    }
  }
  var editSaveLabel = document.getElementById('editSaveLabel');
  if (editSave){
    editSave.addEventListener('click', function(){
      persistEdits();
      if (editSaveLabel) editSaveLabel.textContent = '已保存';
      setTimeout(function(){ if (editSaveLabel) editSaveLabel.textContent = '保存'; }, 1200);
    });
  }
  if (editDone){
    editDone.addEventListener('click', function(){
      persistEdits();
      setEditing(false);
      document.removeEventListener('keydown', editKeyGuard, true);
    });
  }
  if (editExport){
    editExport.addEventListener('click', exportHtml);
  }
  if (editItems){
    editItems.addEventListener('click', function(){
      var next = !itemsOn();
      try { localStorage.setItem(ITEMS_KEY, next ? '1' : '0'); } catch(e){}
      renderItems();
    });
  }

  // 编辑内容变化自动保存
  if (document.body){
    document.addEventListener('input', function(e){
      if (!editing) return;
      if (e.target && e.target.hasAttribute && e.target.hasAttribute('data-edit')){
        schedulePersist();
      }
    }, true);
  }
})();
