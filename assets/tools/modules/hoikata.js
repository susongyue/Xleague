/*!
 * 熊熊雀庄 · 何切练习模块
 * window.MJ.modules.hoikata = { init(panel) }
 *
 * 数据来源（只读调用 assets/tools/engine.js）：
 *   MJ.engine.generator.generateHoikata()        随机 14 张手牌 + 每种切牌的向听/进张
 *   MJ.engine.pointEst.evaluateHand(..., { evDepth: 1, goodShapeDepth: 1 })
 *                                                每种切牌的进张明细 / 好型率 / 期望打点
 *   MJ.engine.pointEst.buildOpt(sit)             场风、自风、宝牌、立直条件
 *
 * 行为对齐小程序 pages/hoikata：14 张（13 手牌 + 摸牌）、指标表 / 进张总览两视图、
 * 向听升序 → 进张降序 → 好型率降序排序、引擎推荐行标记、下一题。
 */
;(function (global) {
  'use strict';

  var WIND_NAME = { east: '东', south: '南', west: '西', north: '北' };
  var Z_NAME = ['东', '南', '西', '北', '白', '发', '中'];
  var SUIT_NAME = { m: '万', p: '筒', s: '索' };
  var SUIT_BASE = { m: 0, p: 9, s: 18, z: 27 };
  var RED_FIVE = { m: '0m', p: '0p', s: '0s' };

  /* ---------------- 小工具 ---------------- */

  function escapeHtml(str) {
    return String(str == null ? '' : str).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function keyOf(tile) {
    if (!tile) return '';
    return tile.red ? '0' + tile.suit : tile.rank + tile.suit;
  }

  function idxOfKey(key) {
    var suit = key.charAt(key.length - 1);
    var num = key.charAt(0) === '0' ? 5 : parseInt(key, 10);
    return (SUIT_BASE[suit] || 0) + num - 1;
  }

  function tileLabel(key) {
    if (!key) return '';
    if (global.MJ && global.MJ.tiles && global.MJ.tiles.nameOf) {
      var label = global.MJ.tiles.nameOf(key);
      if (label) return label;
    }
    var suit = key.charAt(key.length - 1);
    var num = key.charAt(0) === '0' ? 5 : parseInt(key, 10);
    if (suit === 'z') return Z_NAME[num - 1] || key;
    return (key.charAt(0) === '0' ? '赤' : '') + num + (SUIT_NAME[suit] || '');
  }

  function fmtInt(n) {
    var num = Number(n) || 0;
    return String(num).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  }

  function shantenText(n) {
    if (n < 0) return '和了';
    if (n === 0) return '听牌';
    return n + ' 向听';
  }

  // 深度 1 估不出的值不显示成 0，避免看起来像“真的没有”
  function fmtRate(r) {
    return r.hasXp && Number(r.ratePct) > 0 ? r.ratePct + '%' : '—';
  }

  function fmtEv(r) {
    return r.hasXp && Number(r.evPoints) > 0 ? fmtInt(r.evPoints) : '—';
  }

  function now() {
    return (global.performance && typeof global.performance.now === 'function')
      ? global.performance.now()
      : Date.now();
  }

  /* ---------------- 与小程序一致的牌山计算 ---------------- */

  // 满墙 - 手牌 - 指示牌（表宝 + 里宝），赤牌与普通 5 分开计数
  function buildRemMap(tiles, indicators) {
    var remMap = {};
    ['m', 'p', 's'].forEach(function (s) {
      for (var r = 1; r <= 9; r++) remMap[r + s] = 4;
      remMap['0' + s] = 1;
      remMap['5' + s] = 3;
    });
    for (var z = 1; z <= 7; z++) remMap[z + 'z'] = 4;
    function dec(t) {
      var key = keyOf(t);
      remMap[key] = (remMap[key] || 0) - 1;
    }
    (tiles || []).forEach(dec);
    (indicators || []).forEach(dec);
    return remMap;
  }

  // 进张明细（按 34 索引合并赤 5 / 普通 5）-> [{ idx, key, count, good, dora, yakuhai }]
  function waitsFromXp(xp, engineWaits) {
    if (!xp || !xp.improvements) return [];
    var byIdx = {};
    var quality = xp.improvementsQuality || {};
    Object.keys(xp.improvements).forEach(function (key) {
      var idx = idxOfKey(key);
      var item = byIdx[idx];
      if (!item) {
        item = byIdx[idx] = { idx: idx, count: 0, red: false, good: 0 };
      }
      item.count += xp.improvements[key];
      if (key.charAt(0) === '0') item.red = true;
      if (Object.prototype.hasOwnProperty.call(quality, key)) {
        item.good = quality[key] ? 1 : -1;
      }
    });

    var flags = {};
    (engineWaits || []).forEach(function (w) {
      var f = flags[w.idx] || (flags[w.idx] = { dora: false, yakuhai: false });
      if (w.dora) f.dora = true;
      if (w.yakuhai) f.yakuhai = true;
    });

    return Object.keys(byIdx).map(function (k) {
      var item = byIdx[k];
      var base = global.MJ.engine.tileCore.indexToTile(item.idx);
      var key = item.red && base.rank === 5 && base.suit !== 'z'
        ? RED_FIVE[base.suit]
        : base.rank + base.suit;
      var f = flags[item.idx] || {};
      return {
        idx: item.idx,
        key: key,
        count: item.count,
        good: item.good,
        dora: !!f.dora,
        yakuhai: !!f.yakuhai
      };
    }).sort(function (a, b) {
      return a.idx - b.idx;
    });
  }

  // evaluateHand 结果以切牌字符串为键，统一换算到 34 索引（普通牌优先于赤牌）
  function evalMapByIndex(evalMap) {
    var byIndex = {};
    Object.keys(evalMap || {}).forEach(function (key) {
      var idx = idxOfKey(key);
      var current = byIndex[idx];
      if (!current || (current.key.charAt(0) === '0' && key.charAt(0) !== '0')) {
        byIndex[idx] = { key: key, xp: evalMap[key] };
      }
    });
    return byIndex;
  }

  // 该 34 索引在手牌中显示为赤 5 还是普通 5（只有赤 5 时显示赤牌）
  function displayKeyFor(index, tiles) {
    var red = false;
    var plain = false;
    var base = global.MJ.engine.tileCore.indexToTile(index);
    (tiles || []).forEach(function (t) {
      if (global.MJ.engine.tileCore.tileToIndex(t) !== index) return;
      if (t.red) red = true;
      else plain = true;
    });
    if (red && !plain && base.suit !== 'z' && base.rank === 5) return RED_FIVE[base.suit];
    return base.rank + base.suit;
  }

  /* ---------------- 题目计算 ---------------- */

  function computeProblem(p) {
    var hand14 = p.tiles.map(keyOf);
    var indicators = (p.sit.doraIndicators || []).concat(p.sit.uraIndicators || []);
    var remMap = buildRemMap(p.tiles, indicators);
    var opt = global.MJ.engine.pointEst.buildOpt({
      roundWind: p.sit.roundWind,
      seatWind: p.sit.seatWind,
      riichi: p.riichi,
      doraIndicators: p.sit.doraIndicators,
      uraIndicators: p.sit.uraIndicators
    });
    var evalMap = global.MJ.engine.pointEst.evaluateHand(hand14, remMap, {
      opt: opt,
      evDepth: 1,
      goodShapeDepth: 1
    });
    var byIndex = evalMapByIndex(evalMap);

    var rows = (p.results || []).map(function (r) {
      var entry = byIndex[r.discardIndex];
      var xp = entry ? entry.xp : null;
      var waits = waitsFromXp(xp, r.ukeireTiles);
      var rate = xp ? xp.goodShapeRate : (r.goodShape ? 1 : 0);
      var totalCount = xp ? xp.totalCount : r.ukeireTotal;
      var evIndex = xp ? xp.evIndex : 0;
      var qualitySum = waits.reduce(function (sum, w) { return sum + (w.good || 0); }, 0);
      return {
        discardIndex: r.discardIndex,
        discardKey: displayKeyFor(r.discardIndex, p.tiles),
        shantenAfter: r.shantenAfter,
        ukeireTotal: r.ukeireTotal,
        effective: r.effective,
        doraCount: r.doraCount,
        yakuhaiCount: r.yakuhaiCount,
        tenpai: r.tenpai,
        goodShape: r.goodShape,
        isBest: !!r.isBest,
        totalCount: totalCount,
        rate: rate,
        ratePct: (Number(rate) * 100).toFixed(1),
        evIndex: evIndex,
        evPoints: Math.round(evIndex / 10),
        waits: waits,
        hasXp: !!xp,
        qualitySum: qualitySum
      };
    });

    // 默认排序：向听升序 → 进张降序 → 好型率降序
    //   （后三级沿用引擎的宝牌/役牌、有效进张、牌序平手规则，保证结果稳定）
    rows.sort(function (a, b) {
      return a.shantenAfter - b.shantenAfter ||
        b.totalCount - a.totalCount ||
        b.rate - a.rate ||
        (b.doraCount + b.yakuhaiCount) - (a.doraCount + a.yakuhaiCount) ||
        b.effective - a.effective ||
        a.discardIndex - b.discardIndex;
    });

    var hasBest = rows.some(function (r) { return r.isBest; });
    if (!hasBest && rows.length) rows[0].isBest = true;

    return { rows: rows, base: p.baseShanten };
  }

  /* ---------------- 渲染：条件与手牌 ---------------- */

  function renderChips(p) {
    var chips = [];
    function chip(label, value, className) {
      chips.push(
        '<span class="hoikata-chip' + (className ? ' ' + className : '') + '">' +
        '<span class="hoikata-chip-k">' + escapeHtml(label) + '</span>' +
        '<b>' + escapeHtml(value) + '</b></span>'
      );
    }
    chip('场风', (WIND_NAME[p.sit.roundWind] || '东') + '场');
    chip('自风', WIND_NAME[p.sit.seatWind] || '东');
    chip('基准', p.baseShanten + ' 向听');
    chip('表宝牌', (p.sit.doraIndicators || []).length + ' 枚');
    if (p.riichi) chip('立直', '已立直', 'is-riichi');
    if (p.ippatsu) chip('一发', '有效', 'is-ippatsu');
    return chips.join('');
  }

  function renderHand(p) {
    var mainTiles = p.tiles.slice(0, p.tiles.length - 1);
    var sorted = global.MJ.engine.tileCore.sortTiles(mainTiles);
    return global.MJ.tiles.render(sorted, {
      size: 'lg',
      gap: 4,
      className: 'hoikata-hand-tiles'
    });
  }

  function renderDraw(p) {
    return global.MJ.tiles.render([p.drawTile], {
      size: 'lg',
      gap: 4,
      win: true,
      className: 'hoikata-draw-tiles'
    });
  }

  function doraKeys(p) {
    return (p.sit.doraIndicators || []).map(function (ind) {
      var idx = global.MJ.engine.ukeire.doraIndexFromIndicator(ind);
      var tile = global.MJ.engine.tileCore.indexToTile(idx);
      return tile.rank + tile.suit;
    });
  }

  function renderDora(p) {
    var indicators = p.sit.doraIndicators || [];
    var html = global.MJ.tiles.render(indicators, {
      size: 'sm',
      gap: 4,
      className: 'hoikata-dora-tiles'
    });
    var keys = doraKeys(p);
    if (keys.length) {
      html += '<span class="hoikata-dora-text">宝牌：' +
        escapeHtml(keys.map(tileLabel).join('、')) + '</span>';
    }
    return html;
  }

  /* ---------------- 渲染：指标表 ---------------- */

  function renderMetrics(state) {
    var rows = state.rows;
    var base = state.base;
    var bests = rows.filter(function (r) { return r.isBest; });
    var best = bests[0];
    var bestCount = bests.length;

    var meta = [];
    if (best) {
      meta.push('切 ' + tileLabel(best.discardKey));
      meta.push(shantenText(best.shantenAfter));
      meta.push('进张 ' + fmtInt(best.totalCount) + ' 张');
      if (best.hasXp && best.evPoints > 0) meta.push('期望打点 ' + fmtInt(best.evPoints));
    }

    // 整题都估不出时，不摆两列“—”，把版面留给向听与进张
    var showXp = rows.some(function (r) {
      return r.hasXp && (Number(r.ratePct) > 0 || Number(r.evPoints) > 0);
    });

    var html = '';
    if (best) {
      html += '<div class="hoikata-bestline">' +
        '<span class="hoikata-bestline-kicker">推荐</span>' +
        '<span class="hoikata-bestline-tiles">' +
        bests.map(function (r) {
          return global.MJ.tiles.render([r.discardKey], { size: 'xs', gap: 0 });
        }).join('') +
        '</span>' +
        '<span class="hoikata-bestline-text">' + escapeHtml(meta.join(' · ')) + '</span>' +
        (bestCount > 1 ? '<span class="hoikata-bestline-tag">' + bestCount + ' 种并列</span>' : '') +
        '</div>';
    }

    html += '<div class="tools-table-wrap hoikata-table-wrap">' +
      '<table class="tools-table hoikata-table' + (showXp ? '' : ' is-compact') + '">' +
      '<thead><tr>' +
      '<th scope="col">切牌</th>' +
      '<th scope="col" class="is-num">向听</th>' +
      '<th scope="col" class="is-num">进张</th>' +
      (showXp ? '<th scope="col" class="is-num">好型率</th>' : '') +
      '<th scope="col" class="is-num hoikata-col-value">宝牌·役牌</th>' +
      (showXp ? '<th scope="col" class="is-num">期望打点</th>' : '') +
      '</tr></thead><tbody>';

    rows.forEach(function (r) {
      var trend = r.shantenAfter < base ? ' is-advance' : (r.shantenAfter > base ? ' is-retreat' : '');
      var bestCls = r.isBest ? ' is-best' : '';
      html += '<tr class="hoikata-row' + bestCls + trend + '" tabindex="0" data-discard="' +
        escapeHtml(r.discardKey) + '" title="查看切 ' + escapeHtml(tileLabel(r.discardKey)) + ' 的进张明细">' +
        '<td class="hoikata-col-discard"><span class="hoikata-discard">' +
        global.MJ.tiles.render([r.discardKey], { size: 'xs', gap: 0 }) +
        '<span class="hoikata-discard-name">' + escapeHtml(tileLabel(r.discardKey)) + '</span>' +
        (r.isBest ? '<span class="tools-badge is-green hoikata-best-badge">推荐</span>' : '') +
        '</span></td>' +
        '<td class="is-num' + (r.shantenAfter === 0 ? ' is-strong' : '') + '" data-label="向听">' +
        escapeHtml(shantenText(r.shantenAfter)) + '</td>' +
        '<td class="is-num" data-label="进张数">' + fmtInt(r.totalCount) + '</td>' +
        (showXp ? '<td class="is-num" data-label="好型率">' + fmtRate(r) + '</td>' : '') +
        '<td class="is-num hoikata-col-value" data-label="宝牌·役牌"><span class="hoikata-meta">宝 ' + r.doraCount +
        ' · 役 ' + r.yakuhaiCount + '</span></td>' +
        (showXp ? '<td class="is-num is-strong" data-label="期望打点">' + fmtEv(r) + '</td>' : '') +
        '</tr>';
    });

    html += '</tbody></table></div>' +
      '<div class="hoikata-detail" data-role="detail" hidden></div>' +
      '<p class="tools-note hoikata-legend">排序：向听升序 → 进张降序 → 好型率降序。' +
      '<span class="tools-badge is-green">推荐</span> 为引擎综合评价最优（并列者同样标记）。' +
      '点击任一行可查看该切牌的进张明细；' +
      (showXp ? '<b>—</b> 表示前瞻深度 1 未能估算。' :
        '当前牌型较散，深度 1 未估出好型率与打点，先看向听与进张。') +
      '</p>';
    return html;
  }

  /* ---------------- 渲染：行明细 ---------------- */

  function renderDetail(row) {
    var meta = [shantenText(row.shantenAfter), '进张 ' + fmtInt(row.totalCount) + ' 张'];
    if (row.hasXp && row.evPoints > 0) meta.push('期望打点 ' + fmtInt(row.evPoints));
    return '<div class="hoikata-detail-head">' +
      '<span class="hoikata-detail-title">切 ' + escapeHtml(tileLabel(row.discardKey)) + '</span>' +
      '<span class="hoikata-detail-meta">' + escapeHtml(meta.join(' · ')) + '</span>' +
      '</div>' +
      '<div class="hoikata-detail-tiles">' + waitTilesHtml(row.waits) + '</div>';
  }

  /* ---------------- 渲染：进张总览 ---------------- */

  function waitTilesHtml(waits) {
    if (!waits.length) {
      return '<span class="hoikata-no-wait">无进张</span>';
    }
    return waits.map(function (w) {
      var cls = 'hoikata-wait';
      if (w.good === 1) cls += ' is-good';
      else if (w.good === -1) cls += ' is-bad';
      if (w.dora) cls += ' is-dora';
      var title = tileLabel(w.key) + ' · 剩余 ' + w.count + ' 张' +
        (w.good === 1 ? ' · 好型' : (w.good === -1 ? ' · 恶型' : '')) +
        (w.dora ? ' · 宝牌' : '') + (w.yakuhai ? ' · 役牌' : '');
      return '<span class="' + cls + '" title="' + escapeHtml(title) + '">' +
        global.MJ.tiles.render([w.key], { size: 'xs', gap: 0 }) +
        '<em class="hoikata-wait-count">' + w.count + '</em>' +
        '</span>';
    }).join('');
  }

  function renderWaits(state) {
    var rows = state.rows;
    var base = state.base;
    var html = '<div class="hoikata-waits">';
    var retreat = [];

    rows.forEach(function (r) {
      if (r.shantenAfter > base) {
        retreat.push(r);
        return;
      }
      html += '<div class="hoikata-wait-block' + (r.isBest ? ' is-best' : '') + '">' +
        '<div class="hoikata-wait-head">' +
        '<span class="hoikata-discard">' +
        global.MJ.tiles.render([r.discardKey], { size: 'xs', gap: 0 }) +
        (r.isBest ? '<span class="tools-badge is-green hoikata-best-badge">推荐</span>' : '') +
        '</span>' +
        '<span class="hoikata-wait-shanten">' + escapeHtml(shantenText(r.shantenAfter)) + '</span>' +
        '<span class="tools-muted">共 ' + fmtInt(r.totalCount) + ' 张</span>' +
        '</div>' +
        '<div class="hoikata-wait-tiles">' + waitTilesHtml(r.waits) + '</div>' +
        '</div>';
    });

    if (retreat.length) {
      html += '<div class="hoikata-wait-block is-retreat">' +
        '<div class="hoikata-wait-head">' +
        retreat.map(function (r) {
          return global.MJ.tiles.render([r.discardKey], { size: 'xs', gap: 0 });
        }).join('') +
        '<span class="hoikata-retreat-label">退向（无进张）</span>' +
        '</div>' +
        '<p class="hoikata-retreat-note">这些切牌会让向听数变差，不推荐。</p>' +
        '</div>';
    }

    html += '</div>' +
      '<div class="hoikata-legendline">' +
      '<span class="hoikata-key"><i class="hoikata-dot is-good"></i>好型进张</span>' +
      '<span class="hoikata-key"><i class="hoikata-dot is-bad"></i>恶型进张</span>' +
      '<span class="hoikata-key"><i class="hoikata-dot is-dora"></i>宝牌进张</span>' +
      '<span class="tools-muted">数字为剩余枚数（已扣除手牌与指示牌）</span>' +
      '</div>';
    return html;
  }

  /* ---------------- 模块外壳 ---------------- */

  function shellHtml() {
    return '<div class="hoikata">' +
      '<section class="tools-card hoikata-cond-card">' +
      '<div class="tools-card-head">' +
      '<div class="hoikata-heading">' +
      '<h2 class="tools-card-title">何切练习</h2>' +
      '<p class="tools-card-sub">随机 14 张手牌，按牌效评估每一种切牌。</p>' +
      '</div>' +
      '<button type="button" class="tools-btn tools-btn-primary" data-act="next">下一题</button>' +
      '</div>' +
      '<div class="tools-card-body hoikata-cond-body">' +
      '<div class="hoikata-chips" data-role="chips"></div>' +
      '<div class="hoikata-board">' +
      '<div class="hoikata-handline">' +
      '<span class="hoikata-label">手牌</span>' +
      '<div class="hoikata-hand" data-role="hand"></div>' +
      '<div class="hoikata-draw">' +
      '<span class="hoikata-label">摸牌</span>' +
      '<div class="hoikata-draw-box" data-role="draw"></div>' +
      '</div>' +
      '</div>' +
      '<div class="hoikata-dorarow">' +
      '<span class="hoikata-label">宝牌指示牌</span>' +
      '<div class="hoikata-dora" data-role="dora"></div>' +
      '</div>' +
      '</div>' +
      '</div>' +
      '</section>' +
      '<section class="tools-card hoikata-result-card">' +
      '<div class="tools-card-head hoikata-result-head">' +
      '<div class="hoikata-heading">' +
      '<h3 class="tools-card-title">打牌评价</h3>' +
      '<p class="tools-card-sub" data-role="summary">正在生成题目…</p>' +
      '</div>' +
      '<div class="tools-seg hoikata-view-seg" role="group" aria-label="视图切换">' +
      '<button type="button" class="tools-seg-btn is-active" data-view="metrics" aria-pressed="true">指标表</button>' +
      '<button type="button" class="tools-seg-btn" data-view="waits" aria-pressed="false">进张总览</button>' +
      '</div>' +
      '</div>' +
      '<div class="tools-card-body hoikata-result-body" data-role="result" aria-live="polite"></div>' +
      '</section>' +
      '</div>';
  }

  function loadingHtml() {
    return '<div class="hoikata-loading" role="status">' +
      '<div class="tools-skeleton hoikata-skeleton"></div>' +
      '<div class="tools-skeleton hoikata-skeleton is-short"></div>' +
      '<div class="tools-skeleton hoikata-skeleton is-short"></div>' +
      '<p class="tools-muted hoikata-loading-text">正在计算牌效与期望打点…</p>' +
      '</div>';
  }

  function condSkeletonHtml() {
    return '<div class="hoikata-cond-skeleton" aria-hidden="true">' +
      '<div class="tools-skeleton hoikata-skeleton is-chip"></div>' +
      '<div class="tools-skeleton hoikata-skeleton is-chip"></div>' +
      '<div class="tools-skeleton hoikata-skeleton is-hand"></div>' +
      '</div>';
  }

  function errorHtml(message) {
    return '<div class="tools-empty is-error">' +
      '<div class="tools-empty-icon" aria-hidden="true">!</div>' +
      '<h3>何切题目生成失败</h3>' +
      '<p>' + escapeHtml(message || '引擎返回了无效结果，请重试。') + '</p>' +
      '<div class="tools-empty-actions">' +
      '<button type="button" class="tools-btn" data-act="next">重新生成</button>' +
      '</div></div>';
  }

  /* ---------------- 模块状态 ---------------- */

  function createState(panel) {
    var root = panel.querySelector('.hoikata');
    return {
      panel: panel,
      root: root,
      chipsEl: root.querySelector('[data-role="chips"]'),
      handEl: root.querySelector('[data-role="hand"]'),
      drawEl: root.querySelector('[data-role="draw"]'),
      doraEl: root.querySelector('[data-role="dora"]'),
      summaryEl: root.querySelector('[data-role="summary"]'),
      resultEl: root.querySelector('[data-role="result"]'),
      nextBtn: root.querySelector('[data-act="next"]'),
      viewBtns: Array.prototype.slice.call(root.querySelectorAll('[data-view]')),
      view: 'metrics',
      problemNo: 0,
      busy: false,
      job: 0,
      rows: [],
      base: 0,
      selected: null,
      problem: null
    };
  }

  function renderProblem(state, problem, computed, elapsed) {
    state.problem = problem;
    state.rows = computed.rows;
    state.base = computed.base;

    if (state.chipsEl) state.chipsEl.innerHTML = renderChips(problem);
    if (state.handEl) state.handEl.innerHTML = renderHand(problem);
    if (state.drawEl) state.drawEl.innerHTML = renderDraw(problem);
    if (state.doraEl) state.doraEl.innerHTML = renderDora(problem);

    if (state.summaryEl) {
      var bestCount = computed.rows.filter(function (r) { return r.isBest; }).length;
      var parts = [
        '第 ' + state.problemNo + ' 题',
        computed.rows.length + ' 种切牌'
      ];
      if (bestCount > 1) parts.push(bestCount + ' 种并列最优');
      parts.push('用时 ' + Math.max(1, Math.round(elapsed)) + ' ms');
      state.summaryEl.textContent = parts.join(' · ');
    }

    renderView(state);
    state.panel.setAttribute('data-hoikata-state', 'ready');
    state.panel.setAttribute('data-hoikata-problem', String(state.problemNo));
    state.panel.setAttribute('data-hoikata-rows', String(computed.rows.length));
    state.panel.setAttribute('data-compute-ms', String(Math.round(elapsed)));
  }

  function refreshSelection(state) {
    if (!state.resultEl) return;
    var rows = state.resultEl.querySelectorAll('tr.hoikata-row');
    Array.prototype.forEach.call(rows, function (tr) {
      tr.classList.toggle('is-selected',
        !!state.selected && tr.getAttribute('data-discard') === state.selected);
    });
    var detail = state.resultEl.querySelector('[data-role="detail"]');
    if (!detail) return;
    var row = state.selected ? state.rows.filter(function (r) {
      return r.discardKey === state.selected;
    })[0] : null;
    if (row) {
      detail.innerHTML = renderDetail(row);
      detail.hidden = false;
    } else {
      detail.innerHTML = '';
      detail.hidden = true;
    }
  }

  function renderView(state) {
    if (!state.resultEl) return;
    state.resultEl.innerHTML = state.view === 'waits'
      ? renderWaits(state)
      : renderMetrics(state);

    state.viewBtns.forEach(function (btn) {
      var active = btn.getAttribute('data-view') === state.view;
      btn.classList.toggle('is-active', active);
      btn.setAttribute('aria-pressed', active ? 'true' : 'false');
    });

    refreshSelection(state);
  }

  function setBusy(state, busy) {
    state.busy = busy;
    if (state.nextBtn) {
      state.nextBtn.disabled = busy;
      state.nextBtn.textContent = busy ? '计算中…' : '下一题';
      state.nextBtn.classList.toggle('is-disabled', busy);
    }
  }

  function generate(state) {
    if (state.busy) return;
    state.problemNo += 1;
    state.selected = null;
    setBusy(state, true);

    if (state.resultEl) state.resultEl.innerHTML = loadingHtml();
    if (state.summaryEl) state.summaryEl.textContent = '正在生成第 ' + state.problemNo + ' 题…';

    var job = ++state.job;

    // 同步计算会阻塞主线程：先让加载态上屏，再执行 generateHoikata + evaluateHand
    global.setTimeout(function () {
      if (job !== state.job) return;
      var started = now();
      try {
        var problem = global.MJ.engine.generator.generateHoikata();
        var computed = computeProblem(problem);
        var elapsed = now() - started;
        if (job !== state.job) return;
        renderProblem(state, problem, computed, elapsed);
        setBusy(state, false);
      } catch (err) {
        if (job !== state.job) return;
        setBusy(state, false);
        state.panel.setAttribute('data-hoikata-state', 'error');
        if (state.resultEl) state.resultEl.innerHTML = errorHtml(err && err.message);
        if (state.summaryEl) state.summaryEl.textContent = '生成失败';
      }
    }, 24);
  }

  /* ---------------- 入口 ---------------- */

  function init(panel) {
    if (!panel) return;
    if (panel.querySelector('.hoikata')) return; // 防御：同一面板不重复初始化
    if (!global.MJ || !global.MJ.engine || !global.MJ.tiles ||
        !global.MJ.engine.generator || !global.MJ.engine.pointEst) {
      panel.innerHTML = errorHtml('牌效引擎尚未加载，请刷新页面后重试。');
      return;
    }

    panel.innerHTML = shellHtml();
    var state = createState(panel);
    var root = state.root;
    panel.setAttribute('data-hoikata-state', 'loading');

    if (state.resultEl) state.resultEl.innerHTML = loadingHtml();
    if (state.handEl) state.handEl.innerHTML = condSkeletonHtml();

    root.addEventListener('click', function (event) {
      var next = event.target.closest('[data-act="next"]');
      if (next && root.contains(next)) {
        generate(state);
        return;
      }
      var row = event.target.closest('tr.hoikata-row');
      if (row && root.contains(row)) {
        var key = row.getAttribute('data-discard');
        state.selected = state.selected === key ? null : key;
        refreshSelection(state);
        return;
      }
      var viewBtn = event.target.closest('[data-view]');
      if (viewBtn && root.contains(viewBtn)) {
        var view = viewBtn.getAttribute('data-view');
        if (view === state.view) return;
        state.view = view;
        renderView(state);
      }
    });

    root.addEventListener('keydown', function (event) {
      if (event.key !== 'Enter' && event.key !== ' ') return;
      var row = event.target.closest('tr.hoikata-row');
      if (!row || !root.contains(row)) return;
      event.preventDefault();
      var key = row.getAttribute('data-discard');
      state.selected = state.selected === key ? null : key;
      refreshSelection(state);
    });

    panel.setAttribute('data-hoikata-state', 'loading');
    generate(state);
  }

  global.MJ = global.MJ || {};
  global.MJ.modules = global.MJ.modules || {};
  global.MJ.modules.hoikata = { init: init };

})(window);
