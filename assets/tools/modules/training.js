/*!
 * 熊熊雀庄 · 牌效训练（training）
 * window.MJ.modules.training = { init(panel) }
 *
 * 题库：assets/tools/data/training.json（300 题，easy/medium/hard 各 100）
 * 判分：用 MJ.engine.ukeire.evaluateDiscards 复算每种切牌的向听与进张，
 *       只要所选切牌的「向听数 + 进张数」达到本题最优值即判对，
 *       并列最优解全部接受（修复小程序只认 rows[0] 的问题）。
 * 进度：localStorage key = mj.tools.training.v1，按难度隔离。
 */
;(function (global) {
  'use strict';

  var STORAGE_KEY = 'mj.tools.training.v1';
  var LEVELS = [
    { key: 'easy', label: '简单' },
    { key: 'medium', label: '中等' },
    { key: 'hard', label: '困难' }
  ];
  var WIND = { east: '东', south: '南', west: '西', north: '北' };

  var state = {
    panel: null,
    data: null,
    byId: {},
    totals: {},
    level: 'easy',
    qid: null,
    selectedIdx: null,
    answered: false,
    rows: null,
    result: null,
    resetArmed: false,
    resetTimer: null,
    storageOk: true,
    notice: ''
  };

  var store = { v: 1, level: 'easy', levels: {} };

  /* ------------------------------------------------------------
   * 小工具
   * ---------------------------------------------------------- */

  function esc(str) {
    return String(str == null ? '' : str).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function clampNum(v) {
    var n = Number(v);
    return isFinite(n) && n > 0 ? Math.floor(n) : 0;
  }

  function emptyLevel() {
    return { done: [], attempts: 0, correct: 0, streak: 0, best: 0 };
  }

  function ensureLevels() {
    LEVELS.forEach(function (lv) {
      if (!store.levels[lv.key] || typeof store.levels[lv.key] !== 'object') {
        store.levels[lv.key] = emptyLevel();
      }
    });
  }

  function levelLabel(key) {
    for (var i = 0; i < LEVELS.length; i++) {
      if (LEVELS[i].key === key) return LEVELS[i].label;
    }
    return key;
  }

  function qId(q) {
    return q.id || q._id;
  }

  function keyToIdx(key) {
    try {
      var tiles = global.MJ.engine.tileCore.parseTiles(String(key));
      if (!tiles.length) return -1;
      return global.MJ.engine.tileCore.tileToIndex(tiles[0]);
    } catch (e) {
      return -1;
    }
  }

  /* "4m 7m 9m" / "5z" / ["8m","2z"] -> ['4m','7m','9m'] */
  function tileKeys(value) {
    if (value == null) return [];
    var list = Array.isArray(value) ? value : String(value).trim().split(/\s+/);
    var out = [];
    for (var i = 0; i < list.length; i++) {
      if (!list[i]) continue;
      out = out.concat(global.MJ.tiles.normalize(list[i]));
    }
    return out;
  }

  function nameOf(key) {
    return global.MJ.tiles.nameOf(key) || key;
  }

  function shantenLabel(s) {
    if (s < 0) return '和牌';
    if (s === 0) return '听牌';
    return s + ' 向听';
  }

  /* 同一索引可能同时有普通 5 与赤 5：展示时优先普通 5（对牌效无差别） */
  function indexKeyMap(keys) {
    var map = {};
    for (var i = 0; i < keys.length; i++) {
      var idx = keyToIdx(keys[i]);
      if (idx < 0) continue;
      var prev = map[idx];
      if (!prev) {
        map[idx] = keys[i];
      } else if (prev.charAt(0) === '0' && keys[i].charAt(0) !== '0') {
        map[idx] = keys[i];
      }
    }
    return map;
  }

  function mdText(text) {
    return esc(text).replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  }

  /* ------------------------------------------------------------
   * 本地进度
   * ---------------------------------------------------------- */

  function readStore() {
    var raw = null;
    try {
      raw = global.localStorage.getItem(STORAGE_KEY);
    } catch (e) {
      state.storageOk = false;
      return;
    }
    if (!raw) return;

    var data;
    try {
      data = JSON.parse(raw);
    } catch (e) {
      return;
    }
    if (!data || typeof data !== 'object') return;

    if (data.levels && typeof data.levels === 'object') {
      LEVELS.forEach(function (lv) {
        var src = data.levels[lv.key];
        if (!src || typeof src !== 'object') return;
        var dst = emptyLevel();
        if (Array.isArray(src.done)) {
          for (var i = 0; i < src.done.length; i++) {
            var id = src.done[i];
            if (typeof id === 'string' && state.byId[id] && dst.done.indexOf(id) < 0) {
              dst.done.push(id);
            }
          }
        }
        dst.attempts = clampNum(src.attempts);
        dst.correct = Math.min(clampNum(src.correct), dst.attempts);
        dst.streak = clampNum(src.streak);
        dst.best = Math.max(clampNum(src.best), dst.streak);
        store.levels[lv.key] = dst;
      });
    }

    for (var k = 0; k < LEVELS.length; k++) {
      if (LEVELS[k].key === data.level) {
        store.level = data.level;
        break;
      }
    }
  }

  function saveStore() {
    if (!state.storageOk) return;
    try {
      global.localStorage.setItem(STORAGE_KEY, JSON.stringify({
        v: 1,
        level: store.level,
        levels: store.levels
      }));
    } catch (e) {
      state.storageOk = false;
    }
  }

  /* ------------------------------------------------------------
   * 出题 / 判分
   * ---------------------------------------------------------- */

  function handKeys(q) {
    return tileKeys(q.body).concat(tileKeys(q.draw));
  }

  function calcRows(q) {
    var E = global.MJ.engine;
    var keys = handKeys(q);
    var tiles14 = E.tileCore.parseTiles(keys.join(''));
    var indicators = tileKeys(q.doraIndicators);
    var indSet = E.ukeire.indicatorDoraSet(E.tileCore.parseTiles(indicators.join('')));
    return E.ukeire.evaluateDiscards(tiles14, indSet, {
      roundWind: q.roundWind,
      seatWind: q.seatWind
    });
  }

  function rowOf(idx) {
    if (!state.rows) return null;
    for (var i = 0; i < state.rows.length; i++) {
      if (state.rows[i].discardIndex === idx) return state.rows[i];
    }
    return null;
  }

  function isAccepted(row) {
    return !!row && !!state.result &&
      row.shantenAfter === state.result.bestShanten &&
      row.ukeireTotal === state.result.bestUkeire;
  }

  /* ------------------------------------------------------------
   * 渲染：顶部难度 / 统计
   * ---------------------------------------------------------- */

  function statHtml(label, value, hint) {
    return '<div class="training-stat">' +
      '<span class="training-stat-label">' + esc(label) + '</span>' +
      '<b class="training-stat-value">' + esc(value) + '</b>' +
      (hint ? '<span class="training-stat-hint">' + esc(hint) + '</span>' : '') +
      '</div>';
  }

  function renderTop() {
    var panel = state.panel;
    if (!panel) return;
    var top = panel.querySelector('[data-training-top]');
    if (!top) return;

    ensureLevels();
    var lvl = store.levels[state.level];
    var total = state.totals[state.level] || 0;
    var pct = total ? Math.round(lvl.done.length / total * 100) : 0;
    var accuracy = lvl.attempts ? Math.round(lvl.correct / lvl.attempts * 100) : 0;

    var segs = LEVELS.map(function (lv) {
      var on = lv.key === state.level;
      return '<button type="button" class="tools-seg-btn' + (on ? ' is-active' : '') +
        '" data-training-level="' + lv.key + '" aria-pressed="' + (on ? 'true' : 'false') + '">' +
        esc(lv.label) + '</button>';
    }).join('');

    var notice = '';
    if (!state.storageOk) {
      notice = '<div class="training-notice is-warn" role="status">浏览器禁用了本地存储，' +
        '本次进度只保留在当前页面，刷新后会丢失。</div>';
    } else if (state.notice) {
      notice = '<div class="training-notice" role="status">' + esc(state.notice) + '</div>';
    }
    state.notice = '';

    top.innerHTML =
      '<div class="tools-row tools-row--between training-toolbar">' +
        '<div class="tools-seg" role="group" aria-label="选择难度">' + segs + '</div>' +
        '<button type="button" class="tools-btn tools-btn-ghost tools-btn-sm' +
          (state.resetArmed ? ' training-reset-armed' : '') +
          '" data-training-reset>' + (state.resetArmed ? '再点一次确认重置' : '重置本难度进度') +
        '</button>' +
      '</div>' +
      notice +
      '<div class="training-stats">' +
        statHtml('已做', lvl.done.length + ' / ' + total) +
        statHtml('正确率', accuracy + '%') +
        statHtml('连对', lvl.streak + ' 题', '最佳 ' + lvl.best + ' 题') +
      '</div>' +
      '<div class="training-progress" role="progressbar" aria-label="本难度进度" ' +
        'aria-valuemin="0" aria-valuemax="' + total + '" aria-valuenow="' + lvl.done.length + '">' +
        '<span style="width:' + pct + '%"></span></div>' +
      '<p class="training-sub">「' + esc(levelLabel(state.level)) + '」从没做过的题里随机抽题，' +
        '难易独立记进度；做完一轮后可随时重置。</p>';
  }

  /* ------------------------------------------------------------
   * 渲染：题目
   * ---------------------------------------------------------- */

  function metaHtml(q) {
    var out = '';
    out += '<span class="tools-badge is-blue">' + esc(levelLabel(q.level)) + '</span>';
    out += '<span class="tools-badge">场风 ' + esc(WIND[q.roundWind] || q.roundWind || '—') + '</span>';
    out += '<span class="tools-badge">自风 ' + esc(WIND[q.seatWind] || q.seatWind || '—') + '</span>';
    if (q.riichi) out += '<span class="tools-badge is-amber">立直</span>';
    if (q.ippatsu) out += '<span class="tools-badge is-outline">一发</span>';
    return out;
  }

  function doraHtml(q) {
    var indicators = tileKeys(q.doraIndicators);
    var doraKeys = [];
    for (var i = 0; i < indicators.length; i++) {
      var obj = global.MJ.engine.tileCore.parseTiles(indicators[i]);
      if (!obj.length) continue;
      var idx = global.MJ.engine.ukeire.doraIndexFromIndicator(obj[0]);
      var t = global.MJ.engine.tileCore.indexToTile(idx);
      doraKeys.push(t.rank + t.suit);
    }
    var html = '<span class="training-dora"><span class="training-dora-label">宝牌指示</span>' +
      global.MJ.tiles.render(indicators, { size: 'xs' }) + '</span>';
    if (doraKeys.length) {
      html += '<span class="training-dora"><span class="training-dora-label">宝牌</span>' +
        global.MJ.tiles.render(doraKeys, { size: 'xs' }) + '</span>';
    }
    return html;
  }

  function handHtml(q) {
    var keys = handKeys(q);
    var map = indexKeyMap(keys);
    var drawKey = keys.length ? keys[keys.length - 1] : '';

    var options = Object.keys(map).map(Number).sort(function (a, b) { return a - b; }).map(function (idx) {
      var k = map[idx];
      var on = idx === state.selectedIdx;
      return '<button type="button" class="training-opt' + (on ? ' is-active' : '') +
        '" data-training-idx="' + idx + '" aria-pressed="' + (on ? 'true' : 'false') + '"' +
        ' aria-label="切' + esc(nameOf(k)) + '">' +
        global.MJ.tiles.render([k], { size: 'xs' }) +
        '<span class="training-opt-name">' + esc(nameOf(k)) + '</span></button>';
    }).join('');

    return '<div class="training-hand-wrap">' +
        global.MJ.tiles.render(keys, { size: 'md', className: 'training-hand' }) +
        '<p class="training-hand-cap">14 张手牌 · 摸牌 <span class="training-draw">' +
          global.MJ.tiles.render([drawKey], { size: 'xs' }) + '</span> ' +
          esc(nameOf(drawKey)) + ' · 点击要切出的牌</p>' +
      '</div>' +
      '<div class="training-options-wrap">' +
        '<div class="tools-row training-options" role="group" aria-label="候选切牌">' +
          '<span class="training-options-label">候选</span>' + options +
        '</div>' +
        '<p class="training-sel">' + (state.selectedIdx == null
          ? '尚未选择切牌'
          : '已选：切 <strong>' + esc(nameOf(map[state.selectedIdx] || '')) + '</strong>') +
        '</p>' +
      '</div>' +
      '<div class="tools-row training-actions">' +
        '<button type="button" class="tools-btn tools-btn-primary" data-training-submit' +
          (state.selectedIdx == null ? ' disabled' : '') + '>提交答案</button>' +
        '<span class="training-hint">先点手牌或候选，再提交；仅一次判分。</span>' +
      '</div>';
  }

  function questionHtml(q) {
    return '<div class="tools-card training-q">' +
      '<div class="training-q-head">' +
        '<div class="tools-row training-meta">' + metaHtml(q) + '</div>' +
        '<div class="tools-row training-dora-row">' + doraHtml(q) + '</div>' +
      '</div>' +
      handHtml(q) +
    '</div>';
  }

  function completionHtml() {
    var lvl = store.levels[state.level];
    var total = state.totals[state.level] || 0;
    var accuracy = lvl.attempts ? Math.round(lvl.correct / lvl.attempts * 100) : 0;
    return '<div class="tools-card training-done" role="status">' +
      '<span class="training-done-mark" aria-hidden="true">✓</span>' +
      '<h3>「' + esc(levelLabel(state.level)) + '」本轮完成</h3>' +
      '<p>已做 <strong>' + lvl.done.length + ' / ' + total + '</strong> 题，正确率 <strong>' +
        accuracy + '%</strong>，最佳连对 <strong>' + lvl.best + '</strong> 题。</p>' +
      '<div class="tools-row training-done-actions">' +
        '<button type="button" class="tools-btn tools-btn-primary" data-training-restart>重新开始本轮</button>' +
        '<span class="tools-muted">也可以在上方切换难度，各难度进度独立保存。</span>' +
      '</div></div>';
  }

  function resultHtml(q) {
    var r = state.result;
    if (!r) return '';
    var row = r.row;
    var map = indexKeyMap(handKeys(q));
    var pickedName = row ? nameOf(map[row.discardIndex] || '') : '';
    var acceptedKeys = r.accepted.map(function (x) {
      return map[x.discardIndex] || (x.discardTile.rank + x.discardTile.suit);
    });
    var officialIdx = keyToIdx(q.recommend);

    var title = r.correct ? '回答正确' : '回答错误';
    var desc;
    if (r.correct) {
      desc = '切 <strong>' + esc(pickedName) + '</strong> 后为 ' +
        shantenLabel(row.shantenAfter) + '、进张 <strong>' + row.ukeireTotal + '</strong> 张，' +
        '达到本题最优。';
      if (row.discardIndex !== officialIdx && r.accepted.length > 1) {
        desc += '本题共有 ' + r.accepted.length + ' 个同分最优解，你的选择与题库推荐并列。';
      }
    } else if (row) {
      desc = '切 <strong>' + esc(pickedName) + '</strong> 后为 ' +
        shantenLabel(row.shantenAfter) + '、进张 ' + row.ukeireTotal + ' 张；' +
        '本题最优是 ' + shantenLabel(r.bestShanten) + '、进张 <strong>' +
        r.bestUkeire + '</strong> 张。';
    } else {
      desc = '未能识别所选切牌，请重新选择。';
    }

    var rows = state.rows.map(function (x) {
      var k = map[x.discardIndex] || (x.discardTile.rank + x.discardTile.suit);
      var accepted = isAccepted(x);
      var picked = x.discardIndex === state.selectedIdx;
      var cls = [];
      if (accepted) cls.push('is-best');
      if (picked) cls.push('is-picked');
      var marks = '';
      if (accepted) marks += '<span class="tools-badge is-green">最优</span>';
      if (picked) marks += '<span class="tools-badge is-blue">你的选择</span>';
      if (x.discardIndex === officialIdx) marks += '<span class="tools-badge">题库推荐</span>';
      return '<tr' + (cls.length ? ' class="' + cls.join(' ') + '"' : '') + '>' +
        '<td><span class="training-cand-tile">' + global.MJ.tiles.render([k], { size: 'xs' }) +
          '</span><span class="training-cand-name">' + esc(nameOf(k)) + '</span></td>' +
        '<td class="is-num">' + x.shantenAfter + '</td>' +
        '<td class="is-num">' + x.ukeireTotal + '</td>' +
        '<td>' + marks + '</td>' +
        '</tr>';
    }).join('');

    return '<div class="training-result">' +
      '<div class="training-verdict ' + (r.correct ? 'is-correct' : 'is-wrong') + '" role="status">' +
        '<span class="training-verdict-mark" aria-hidden="true">' + (r.correct ? '✓' : '✗') + '</span>' +
        '<div class="training-verdict-body"><strong>' + title + '</strong><p>' + desc + '</p></div>' +
      '</div>' +

      '<div class="training-answer">' +
        '<div class="tools-section-title">最优解</div>' +
        '<div class="tools-row training-answer-row">' +
          '<span class="training-answer-metric">' + shantenLabel(r.bestShanten) +
            ' · 进张 ' + r.bestUkeire + ' 张</span>' +
          '<span class="training-answer-tiles">' + global.MJ.tiles.render(acceptedKeys, { size: 'sm' }) +
          '</span>' +
        '</div>' +
        '<p class="training-answer-note">本题共 ' + r.accepted.length + ' 个同分最优解，' +
          '向听数与进张数同时达到最优即判对。</p>' +
      '</div>' +

      '<div class="tools-section-title training-cands-title">各候选指标</div>' +
      '<div class="tools-table-wrap training-cands">' +
        '<table class="tools-table"><thead><tr>' +
          '<th>切牌</th><th class="is-num">向听</th><th class="is-num">进张</th><th>结果</th>' +
        '</tr></thead><tbody>' + rows + '</tbody></table>' +
      '</div>' +

      (q.note ? '<details class="training-note"' + (String(q.note).length <= 120 ? ' open' : '') + '>' +
        '<summary>题目解析</summary>' +
        '<div class="training-note-body">' + mdText(q.note) + '</div></details>' : '') +

      '<div class="tools-row training-next-row">' +
        '<button type="button" class="tools-btn tools-btn-primary" data-training-next>下一题</button>' +
        '<span class="training-hint">下一题会从当前难度未做过的题里随机抽取。</span>' +
      '</div>' +
    '</div>';
  }

  function bindHand(q) {
    if (!state.panel) return;
    var hand = state.panel.querySelector('.training-hand');
    if (!hand) return;
    var tiles = hand.querySelectorAll('.mj-tile');
    var acceptedSet = {};
    if (state.answered && state.result) {
      state.result.accepted.forEach(function (x) { acceptedSet[x.discardIndex] = true; });
    }

    for (var i = 0; i < tiles.length; i++) {
      var node = tiles[i];
      var key = node.getAttribute('data-tile');
      var idx = keyToIdx(key);
      node.setAttribute('data-idx', idx);
      node.setAttribute('role', 'button');
      node.setAttribute('tabindex', state.answered ? '-1' : '0');
      node.setAttribute('aria-label', '切' + nameOf(key));
      node.setAttribute('aria-pressed', idx === state.selectedIdx ? 'true' : 'false');
      if (i === tiles.length - 1) node.classList.add('is-draw');
      if (idx === state.selectedIdx) node.classList.add('is-selected');
      if (state.answered) {
        if (acceptedSet[idx]) node.classList.add('is-win');
        if (idx === state.selectedIdx && state.result && !state.result.correct) {
          node.classList.add('training-wrong');
        }
      }
    }
    if (state.answered) hand.classList.add('is-locked');
  }

  /* ------------------------------------------------------------
   * 流程
   * ---------------------------------------------------------- */

  function pickNext() {
    var lvl = store.levels[state.level];
    var pool = state.data.filter(function (q) {
      return q.level === state.level && lvl.done.indexOf(qId(q)) < 0;
    });
    if (!pool.length) {
      state.qid = null;
      state.rows = null;
      state.result = null;
      state.answered = false;
      return;
    }
    var q = pool[Math.floor(Math.random() * pool.length)];
    state.qid = qId(q);
    state.selectedIdx = null;
    state.answered = false;
    state.rows = null;
    state.result = null;
  }

  function renderHost() {
    if (!state.panel) return;
    var host = state.panel.querySelector('[data-training-host]');
    if (!host) return;

    if (!state.data) return;
    if (!state.qid) {
      host.innerHTML = completionHtml();
      return;
    }
    var q = state.byId[state.qid];
    if (!q) {
      host.innerHTML = completionHtml();
      return;
    }
    host.innerHTML = questionHtml(q) + (state.answered ? resultHtml(q) : '');
    bindHand(q);
  }

  function renderAll() {
    renderTop();
    renderHost();
  }

  function switchLevel(level) {
    if (level === state.level) return;
    var valid = LEVELS.some(function (lv) { return lv.key === level; });
    if (!valid) return;
    state.level = level;
    store.level = level;
    ensureLevels();
    saveStore();
    state.notice = '';
    state.resetArmed = false;
    clearTimeout(state.resetTimer);
    pickNext();
    renderAll();
  }

  function selectIdx(idx) {
    if (state.answered || idx == null || idx < 0) return;
    state.selectedIdx = idx;
    renderHost();
  }

  function submit() {
    if (state.answered || state.selectedIdx == null || !state.qid) return;
    var q = state.byId[state.qid];
    if (!q) return;

    var rows;
    try {
      rows = calcRows(q);
    } catch (e) {
      state.notice = '本题计算失败：' + (e && e.message ? e.message : e);
      renderTop();
      return;
    }
    if (!rows || !rows.length) {
      state.notice = '本题没有可用的切牌候选，已跳到下一题。';
      store.levels[state.level].done.push(state.qid);
      saveStore();
      pickNext();
      renderAll();
      return;
    }

    var bestShanten = Math.min.apply(null, rows.map(function (r) { return r.shantenAfter; }));
    var bestPool = rows.filter(function (r) { return r.shantenAfter === bestShanten; });
    var bestUkeire = Math.max.apply(null, bestPool.map(function (r) { return r.ukeireTotal; }));
    var accepted = rows.filter(function (r) {
      return r.shantenAfter === bestShanten && r.ukeireTotal === bestUkeire;
    });
    var row = null;
    for (var i = 0; i < rows.length; i++) {
      if (rows[i].discardIndex === state.selectedIdx) { row = rows[i]; break; }
    }
    var correct = !!row && row.shantenAfter === bestShanten && row.ukeireTotal === bestUkeire;

    state.rows = rows;
    state.result = {
      correct: correct,
      bestShanten: bestShanten,
      bestUkeire: bestUkeire,
      accepted: accepted,
      row: row
    };
    state.answered = true;

    var lvl = store.levels[state.level];
    if (lvl.done.indexOf(state.qid) < 0) lvl.done.push(state.qid);
    lvl.attempts += 1;
    if (correct) {
      lvl.correct += 1;
      lvl.streak += 1;
      if (lvl.streak > lvl.best) lvl.best = lvl.streak;
    } else {
      lvl.streak = 0;
    }
    saveStore();
    renderAll();

    try {
      var next = state.panel.querySelector('[data-training-next]');
      if (next && next.focus) next.focus({ preventScroll: true });
    } catch (e) { /* ignore */ }
  }

  function resetLevel(immediate) {
    var lvl = store.levels[state.level];
    if (!immediate) {
      if (!state.resetArmed) {
        state.resetArmed = true;
        renderTop();
        clearTimeout(state.resetTimer);
        state.resetTimer = setTimeout(function () {
          state.resetArmed = false;
          renderTop();
        }, 4000);
        return;
      }
    }
    clearTimeout(state.resetTimer);
    state.resetArmed = false;
    if (!state.storageOk) {
      /* 仍有内存态可清，继续 */
    }
    store.levels[state.level] = emptyLevel();
    if (lvl) { /* 旧对象已被替换 */ }
    saveStore();
    state.notice = '已重置「' + levelLabel(state.level) + '」的进度与统计。';
    pickNext();
    renderAll();
  }

  /* ------------------------------------------------------------
   * 数据加载
   * ---------------------------------------------------------- */

  function loadingHtml() {
    return '<div class="tools-card"><div class="tools-stack">' +
      '<div class="tools-skeleton" style="width:38%;height:18px"></div>' +
      '<div class="tools-skeleton" style="width:82%"></div>' +
      '<div class="tools-skeleton" style="width:64%"></div>' +
      '<div class="tools-skeleton" style="width:74%;height:48px"></div>' +
      '</div></div>';
  }

  function errorHtml(err) {
    return '<div class="tools-empty is-error" role="alert">' +
      '<span class="tools-empty-icon" aria-hidden="true">' +
        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" ' +
        'stroke-linecap="round" stroke-linejoin="round"><path d="M12 9v4"/><path d="M12 17h.01"/>' +
        '<path d="M10.3 3.9 2.4 18a2 2 0 0 0 1.7 3h15.8a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/>' +
        '</svg></span>' +
      '<h3>题库加载失败</h3>' +
      '<p>' + esc(err && err.message ? err.message : '未知错误') + '</p>' +
      '<div class="tools-empty-actions">' +
        '<button type="button" class="tools-btn tools-btn-primary" data-training-retry>重新加载</button>' +
      '</div></div>';
  }

  function loadData() {
    var host = state.panel.querySelector('[data-training-host]');
    if (host) host.innerHTML = loadingHtml();
    state.data = null;
    state.byId = {};
    state.totals = {};

    global.MJ.data.loadTraining().then(function (list) {
      state.data = list;
      var totals = { easy: 0, medium: 0, hard: 0 };
      for (var i = 0; i < list.length; i++) {
        var q = list[i];
        var id = qId(q);
        if (!id) continue;
        state.byId[id] = q;
        if (totals[q.level] != null) totals[q.level] += 1;
      }
      state.totals = totals;
      ensureLevels();
      readStore();
      ensureLevels();
      var ok = LEVELS.some(function (lv) { return lv.key === store.level; });
      state.level = ok ? store.level : 'easy';
      store.level = state.level;
      pickNext();
      renderAll();
    }).catch(function (err) {
      state.data = null;
      var hostEl = state.panel.querySelector('[data-training-host]');
      if (hostEl) hostEl.innerHTML = errorHtml(err);
      if (global.console && console.error) {
        console.error('[MJ.training] 题库加载失败：', err);
      }
    });
  }

  function retryLoad() {
    global.MJ.data.clear('training');
    loadData();
  }

  /* ------------------------------------------------------------
   * 事件
   * ---------------------------------------------------------- */

  function onClick(e) {
    var t = e.target;
    if (!t || !t.closest) return;

    var levelBtn = t.closest('[data-training-level]');
    if (levelBtn) {
      switchLevel(levelBtn.getAttribute('data-training-level'));
      return;
    }
    if (t.closest('[data-training-reset]')) {
      resetLevel(false);
      return;
    }
    if (t.closest('[data-training-restart]')) {
      resetLevel(true);
      return;
    }
    if (t.closest('[data-training-retry]')) {
      retryLoad();
      return;
    }
    if (t.closest('[data-training-submit]')) {
      submit();
      return;
    }
    if (t.closest('[data-training-next]')) {
      pickNext();
      state.notice = '';
      renderAll();
      return;
    }

    var opt = t.closest('[data-training-idx]');
    if (opt && !state.answered) {
      selectIdx(Number(opt.getAttribute('data-training-idx')));
      return;
    }

    var tile = t.closest('.mj-tile');
    if (tile && !state.answered && tile.closest('.training-hand')) {
      selectIdx(Number(tile.getAttribute('data-idx')));
    }
  }

  function onKeydown(e) {
    if (e.key !== 'Enter' && e.key !== ' ' && e.key !== 'Spacebar') return;
    var t = e.target;
    if (!t || !t.closest) return;
    var tile = t.closest('.mj-tile');
    if (tile && !state.answered && tile.closest('.training-hand')) {
      e.preventDefault();
      selectIdx(Number(tile.getAttribute('data-idx')));
    }
  }

  /* ------------------------------------------------------------
   * 模块入口
   * ---------------------------------------------------------- */

  global.MJ = global.MJ || {};
  global.MJ.modules = global.MJ.modules || {};
  global.MJ.modules.training = {
    init: function (panel) {
      if (!panel) return;
      state.panel = panel;
      state.data = null;
      state.qid = null;
      state.selectedIdx = null;
      state.answered = false;
      state.rows = null;
      state.result = null;
      ensureLevels();

      panel.innerHTML =
        '<div class="training">' +
          '<div class="tools-card training-top" data-training-top></div>' +
          '<div class="training-host" data-training-host></div>' +
        '</div>';

      renderTop();
      panel.addEventListener('click', onClick);
      panel.addEventListener('keydown', onKeydown);
      loadData();
    }
  };
})(typeof window !== 'undefined' ? window : this);
