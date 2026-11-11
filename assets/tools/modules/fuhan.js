/* 算番模块（/tools/#fuhan）
 * 三步问答：番数 → 满贯确认 →（未封顶时）符数 → 结算
 * 依赖：MJ.engine.generator.generateFuhan
 *       MJ.engine.tileCore.sortTiles
 *       MJ.engine.score.calcPayment / limitName
 *       MJ.tiles.render / nameOf
 */
(function () {
  'use strict';

  window.MJ = window.MJ || {};
  window.MJ.modules = window.MJ.modules || {};

  var WIND_CN = { east: '东', south: '南', west: '西', north: '北' };
  var FU_POOL = [20, 25, 30, 40, 50, 60, 70, 80, 90, 100, 110];

  var state = {
    panel: null,
    boundPanel: null,
    q: null,
    seq: 0,
    step: 1,
    revealed: false,
    wrongHan: null,
    wrongFu: null,
    feedback: null,
    focus: null
  };

  function esc(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, function (ch) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch];
    });
  }

  function tileKey(tile) {
    if (!tile || !tile.suit) return '';
    if (tile.red && tile.suit !== 'z') return '0' + tile.suit;
    return String(tile.rank) + tile.suit;
  }

  function tileName(tile) {
    if (window.MJ.tiles && typeof window.MJ.tiles.nameOf === 'function') {
      var name = window.MJ.tiles.nameOf(tileKey(tile));
      if (name) return name;
    }
    return tileKey(tile);
  }

  function sameTile(a, b) {
    return !!a && !!b && a.suit === b.suit && a.rank === b.rank && !!a.red === !!b.red;
  }

  function engine() {
    return window.MJ && window.MJ.engine;
  }

  function readyError() {
    var e = engine();
    if (!e) return '算法引擎（engine.js）没有加载成功。';
    if (!e.generator || typeof e.generator.generateFuhan !== 'function') return '引擎缺少 generateFuhan 方法。';
    if (!e.tileCore || typeof e.tileCore.sortTiles !== 'function') return '引擎缺少 tileCore.sortTiles 方法。';
    if (!e.score || typeof e.score.calcPayment !== 'function') return '引擎缺少 score.calcPayment 方法。';
    if (!window.MJ.tiles || typeof window.MJ.tiles.render !== 'function') return '牌面渲染（tiles.js）没有加载成功。';
    if (typeof window.MJ.tiles.nameOf !== 'function') return '牌面渲染缺少 nameOf 方法。';
    return '';
  }

  function newQuestion() {
    var e = engine();
    var raw = e.generator.generateFuhan();
    if (!raw || !raw.answer || !raw.hand || !raw.hand.tiles) {
      throw new Error('引擎没有返回有效的题目数据。');
    }

    /* 引擎的 dealer 与自风独立随机，会出现「自风 东家」却按闲家结算的矛盾。
       庄家必为东家：这里按自风归一，并同步刷新 payment，保证题面/点数自洽。 */
    var answer = raw.answer;
    var seat = raw.sit && raw.sit.seatWind;
    var seatDealer = seat === 'east';
    if (seat && (!!answer.dealer !== seatDealer)) {
      answer.dealer = seatDealer;
      answer.payment = e.score.calcPayment(answer.han, answer.fu, {
        dealer: seatDealer,
        tsumo: !!raw.hand.tsumo
      });
    }

    var tiles = e.tileCore.sortTiles(raw.hand.tiles);
    var winTile = raw.hand.winTile || tiles[tiles.length - 1];
    var winIndex = -1;
    var i;
    for (i = 0; i < tiles.length; i++) {
      if (tiles[i] === winTile) { winIndex = i; break; }
    }
    if (winIndex < 0) {
      for (i = 0; i < tiles.length; i++) {
        if (sameTile(tiles[i], winTile)) { winIndex = i; break; }
      }
    }

    state.q = {
      hand: raw.hand,
      sit: raw.sit || {
        roundWind: 'east',
        seatWind: 'east',
        doraIndicators: raw.hand.doraIndicators || [],
        uraIndicators: raw.hand.uraIndicators || []
      },
      answer: answer,
      tiles: tiles,
      winTile: winTile,
      winIndex: winIndex
    };
    state.seq += 1;
    state.step = 1;
    state.revealed = false;
    state.wrongHan = null;
    state.wrongFu = null;
    state.feedback = null;
    state.focus = null;
    render();
  }

  /* ---------- 规则推导 ---------- */

  function skipFu() {
    var a = state.q.answer;
    return a.han >= 5 || (a.han === 4 && a.fu >= 40) || (a.han === 3 && a.fu >= 70);
  }

  function isYakuman() {
    var a = state.q.answer;
    return !!a.yakuman || a.han >= 13;
  }

  function hanOptions() {
    var han = state.q.answer.han;
    var seen = {};
    var out = [];

    function add(value, max) {
      if (value < 1 || value > max || seen[value]) return;
      seen[value] = true;
      out.push(value);
    }

    if (han >= 13) {
      add(11, 26);
      add(12, 26);
      add(13, 26);
      add(han, 26);
      if (han === 13) add(26, 26);
    } else {
      [0, -1, 1, -2, 2, -3].forEach(function (d) { add(han + d, 12); });
      for (var fill = 1; out.length < 4 && fill <= 12; fill += 1) add(fill, 12);
    }
    out.sort(function (a, b) { return a - b; });
    return out;
  }

  function fuOptions() {
    var fu = Number(state.q.answer.fu) || 0;
    var seen = {};
    var out = [];

    function add(value) {
      if (!value || value < 20 || seen[value]) return;
      seen[value] = true;
      out.push(value);
    }

    /* 正确答案必须出现在选项里，即使它超出常用符数池 */
    add(fu);
    var idx = FU_POOL.indexOf(fu);
    if (idx >= 0) {
      [1, -1, 2, -2, 3, -3].forEach(function (d) {
        var next = FU_POOL[idx + d];
        if (next) add(next);
      });
    }
    for (var i = 0; i < FU_POOL.length && out.length < 4; i += 1) add(FU_POOL[i]);
    out.sort(function (a, b) { return a - b; });
    return out;
  }

  /* ---------- 渲染 ---------- */

  function render() {
    if (!state.panel || !state.q) return;
    var html = '<div class="fuhan">' +
      renderQuestionCard() +
      (state.revealed || state.step === 'done'
        ? renderResult()
        : state.step === 2
          ? renderConfirmStep()
          : state.step === 3
            ? renderFuStep()
            : renderHanStep()) +
      '</div>';
    state.panel.innerHTML = html;
    applyFocus();
  }

  function metaItem(label, valueHtml, cls) {
    return '<div class="fuhan-meta-item' + (cls ? ' ' + cls : '') + '">' +
      '<span class="fuhan-meta-label">' + esc(label) + '</span>' +
      '<span class="fuhan-meta-value">' + valueHtml + '</span>' +
      '</div>';
  }

  function roundWindText() {
    var sit = state.q.sit;
    var hand = state.q.hand;
    if (sit && WIND_CN[sit.roundWind]) return WIND_CN[sit.roundWind] + '场';
    return ['东', '南', '西', '北'][(hand.roundWind || 1) - 1] + '场';
  }

  function seatWindText() {
    var sit = state.q.sit;
    var hand = state.q.hand;
    if (sit && WIND_CN[sit.seatWind]) return WIND_CN[sit.seatWind] + '家';
    return ['东', '南', '西', '北'][(hand.seatWind || 1) - 1] + '家';
  }

  function renderQuestionCard() {
    var q = state.q;
    var hand = q.hand;
    var sit = q.sit;
    var dora = sit.doraIndicators || hand.doraIndicators || [];
    var ura = sit.uraIndicators || hand.uraIndicators || [];
    var doraHtml = dora.length
      ? window.MJ.tiles.render(dora, { size: 'xs' })
      : '<span class="fuhan-muted">无</span>';
    var uraHtml = hand.riichi && ura.length
      ? window.MJ.tiles.render(ura, { size: 'xs' })
      : '<span class="fuhan-muted">' + (hand.riichi ? '无' : '未立直，不计里宝') + '</span>';
    var riichiText = hand.riichi ? (hand.ippatsu ? '立直 · 一发' : '立直') : '未立直';
    var handHtml = window.MJ.tiles.render(q.tiles, {
      win: q.winIndex >= 0 ? q.winIndex : true
    });
    var answerBtn = (state.revealed || state.step === 'done')
      ? ''
      : '<button type="button" class="tools-btn tools-btn-ghost" data-act="show-answer">看答案</button>';

    return '<div class="tools-card fuhan-qcard">' +
        '<div class="tools-card-head">' +
          '<div class="fuhan-qhead-main">' +
            '<h2 class="tools-card-title">算番练习 <span class="tools-badge is-blue">第 ' + state.seq + ' 题</span></h2>' +
            '<p class="tools-card-sub">看牌型与场况：先数番，再判断要不要数符，最后核对点数。</p>' +
          '</div>' +
          '<div class="fuhan-toolbar">' +
            answerBtn +
            '<button type="button" class="tools-btn tools-btn-primary" data-act="next">下一题</button>' +
          '</div>' +
        '</div>' +
        '<div class="fuhan-hand" aria-label="本局手牌">' + handHtml + '</div>' +
        '<div class="fuhan-hand-foot">' +
          '<span>和牌张 <b>' + esc(tileName(q.winTile)) + '</b><span class="fuhan-hl">蓝框高亮</span></span>' +
          '<span class="fuhan-muted">共 ' + q.tiles.length + ' 张</span>' +
        '</div>' +
        '<div class="fuhan-meta">' +
          metaItem('场风', esc(roundWindText())) +
          metaItem('自风', esc(seatWindText())) +
          metaItem('和牌方式', esc(hand.tsumo ? '自摸' : '荣和')) +
          metaItem('立直', esc(riichiText)) +
          metaItem('宝牌指示牌', doraHtml) +
          metaItem('里宝指示牌', uraHtml) +
        '</div>' +
      '</div>';
  }

  function stepHead(num, title, sub) {
    return '<div class="fuhan-step-head">' +
        '<div class="fuhan-step-titlewrap">' +
          '<span class="fuhan-step-num" aria-hidden="true">' + esc(num) + '</span>' +
          '<div>' +
            '<h3 class="tools-card-title fuhan-step-title">' + esc(title) + '</h3>' +
            '<p class="tools-card-sub">' + esc(sub) + '</p>' +
          '</div>' +
        '</div>' +
      '</div>';
  }

  function feedbackHtml() {
    if (!state.feedback) return '';
    var kind = state.feedback.kind || 'info';
    return '<div class="fuhan-feedback is-' + esc(kind) + '" role="status" aria-live="polite">' +
      esc(state.feedback.text) +
      '</div>';
  }

  function renderHanStep() {
    var options = hanOptions().map(function (value) {
      var sub = value >= 13 ? '役满' : '番';
      return '<button type="button" class="fuhan-opt' + (state.wrongHan === value ? ' is-wrong' : '') +
        '" data-act="han" data-value="' + value + '" aria-label="' + value + ' 番">' +
        '<span>' + value + '</span><small>' + sub + '</small></button>';
    }).join('');

    return '<div class="tools-card fuhan-stepcard">' +
        stepHead('1', '这副牌和了几番？', '先只数番，不用管符数。宝牌能加番，但宝牌本身不算役。') +
        '<div class="fuhan-opts" role="group" aria-label="选择番数">' + options + '</div>' +
        feedbackHtml() +
      '</div>';
  }

  function renderConfirmStep() {
    var a = state.q.answer;
    var han = a.han;
    var skip = skipFu();
    var limit = window.MJ.engine.score.limitName(han, a.fu) || '';
    var explain;

    if (han >= 5) {
      explain = '本局 <b>' + han + ' 番</b>。5 番以上不再按符计算，直接按番数封顶（满贯及以上）。';
    } else if (skip) {
      explain = '本局 <b>' + han + ' 番</b>，且符数已达到满贯线（4 番 40 符 / 3 番 70 符），按满贯封顶计点。';
    } else {
      explain = '本局 <b>' + han + ' 番</b>，还没有到满贯封顶线，需要数符才能算出准确点数。';
    }

    return '<div class="tools-card fuhan-stepcard">' +
        stepHead('2', '满贯确认', '先看这手牌是否已经封顶；封顶时符数不影响最终点数。') +
        '<div class="fuhan-confirm">' +
          '<p class="fuhan-confirm-rule">' + explain + '</p>' +
          '<div class="fuhan-confirm-status">' +
            '<span class="tools-badge is-' + (skip ? 'amber' : 'blue') + '">' +
              (skip ? '已封顶 · 不必数符' : '未封顶 · 需要数符') +
            '</span>' +
            (limit ? '<span class="fuhan-muted">按 ' + esc(limit) + ' 计算</span>' : '') +
          '</div>' +
          '<button type="button" class="tools-btn tools-btn-primary tools-btn-lg" data-act="confirm">' +
            (skip ? '确认 · 直接结算' : '下一步 · 选择符数') +
          '</button>' +
        '</div>' +
        feedbackHtml() +
      '</div>';
  }

  function renderFuStep() {
    var options = fuOptions().map(function (value) {
      return '<button type="button" class="fuhan-opt' + (state.wrongFu === value ? ' is-wrong' : '') +
        '" data-act="fu" data-value="' + value + '" aria-label="' + value + ' 符">' +
        '<span>' + value + '</span><small>符</small></button>';
    }).join('');

    return '<div class="tools-card fuhan-stepcard">' +
        stepHead('3', '这副牌是几符？', '副底 20 符；暗刻/明刻、雀头、听牌形、自摸与门前荣和各有权重，最后切上取整。') +
        '<div class="fuhan-opts" role="group" aria-label="选择符数">' + options + '</div>' +
        feedbackHtml() +
      '</div>';
  }

  function yakuQuery(name) {
    if (/^役牌/.test(name)) return '役牌';
    if (/^场风/.test(name)) return '场风';
    if (/^自风/.test(name)) return '自风';
    return name;
  }

  function fuTable(answer) {
    var rows = answer.fuDetail || [];
    var sum = 0;
    var body = rows.map(function (row) {
      var fu = Number(row.fu) || 0;
      sum += fu;
      return '<tr><td>' + esc(row.name) + '</td><td class="is-num">' + fu + ' 符</td></tr>';
    }).join('');
    var total = Number(answer.fu) || 0;
    var extra = total - sum;
    if (extra > 0) {
      body += '<tr><td>切上取整</td><td class="is-num">' + extra + ' 符</td></tr>';
    }
    return '<div class="tools-table-wrap fuhan-futable">' +
        '<table class="tools-table">' +
          '<thead><tr><th scope="col">符数构成</th><th scope="col" class="is-num">符</th></tr></thead>' +
          '<tbody>' + body +
            '<tr class="fuhan-fu-total"><td>合计</td><td class="is-num is-strong">' + total + ' 符</td></tr>' +
          '</tbody>' +
        '</table>' +
      '</div>';
  }

  function scoreCell(label, valueHtml, subHtml, cls) {
    return '<div class="fuhan-score-cell' + (cls ? ' ' + cls : '') + '">' +
        '<div class="fuhan-score-label">' + esc(label) + '</div>' +
        '<div class="fuhan-score-value">' + valueHtml + '</div>' +
        (subHtml ? '<div class="fuhan-score-sub">' + subHtml + '</div>' : '') +
      '</div>';
  }

  function renderResult() {
    var q = state.q;
    var a = q.answer;
    var hand = q.hand;
    var han = a.han;
    var fu = a.fu;
    var skip = skipFu();
    var yakuman = isYakuman();
    var limit = window.MJ.engine.score.limitName(han, fu) || '';
    var dealer = !!a.dealer;
    var dealerText = dealer ? '庄家' : '闲家';
    var ron = window.MJ.engine.score.calcPayment(han, fu, { dealer: dealer, tsumo: false });
    var tsumo = window.MJ.engine.score.calcPayment(han, fu, { dealer: dealer, tsumo: true });
    var yaku = a.yaku || [];
    var yakuItems = yaku.map(function (item) {
      var text = item.han >= 13 ? '役满' : '+' + item.han + ' 番';
      return '<li><a class="fuhan-yaku" href="#yaku?q=' + encodeURIComponent(yakuQuery(item.name)) +
        '" title="在役种一览中查看「' + esc(item.name) + '」">' +
        '<span>' + esc(item.name) + '</span><b>' + text + '</b></a></li>';
    }).join('');

    var fuBlock;
    if (yakuman) {
      fuBlock = '<p class="fuhan-note-text">役满不计符，符数不参与点数计算。</p>';
    } else if (skip) {
      fuBlock = '<p class="fuhan-note-text">已达封顶线，符数不计入点数。</p>' +
        '<details class="fuhan-fold"><summary>查看符数明细（仅供对照）</summary>' + fuTable(a) + '</details>';
    } else {
      fuBlock = fuTable(a);
    }

    var statusBadge = state.revealed
      ? '<span class="tools-badge is-amber">已看答案</span>'
      : '<span class="tools-badge is-green">' + esc(limit || '完成') + '</span>';

    return '<div class="tools-card fuhan-stepcard fuhan-resultcard">' +
        '<div class="fuhan-step-head">' +
          '<div class="fuhan-step-titlewrap">' +
            '<span class="fuhan-step-num ' + (state.revealed ? 'is-answer' : 'is-done') + '" aria-hidden="true">' +
              (state.revealed ? '!' : '✓') +
            '</span>' +
            '<div>' +
              '<h3 class="tools-card-title fuhan-step-title">' + (state.revealed ? '答案与解析' : '结算') + '</h3>' +
              '<p class="tools-card-sub">' +
                (state.revealed
                  ? '已直接显示正确答案与解析，点「下一题」继续练习。'
                  : '三步完成，下面是对应的役种、符数与点数。') +
              '</p>' +
            '</div>' +
          '</div>' +
          statusBadge +
        '</div>' +
        '<div class="fuhan-result">' +
          '<div class="fuhan-score">' +
            scoreCell('番数', '<b>' + han + '</b><small> 番</small>', yakuman ? '役满' : '') +
            scoreCell('符数',
              skip || yakuman ? '不计符' : '<b>' + fu + '</b><small> 符</small>',
              yakuman ? '役满不计符' : (skip ? '封顶后不影响点数' : '已切上取整')) +
            scoreCell('满贯级别', esc(limit || '未封顶'), '') +
            scoreCell('荣和', '<b>' + ron.total + '</b><small> 点</small>',
              dealerText + ' · 荣和', hand.tsumo ? '' : 'is-current') +
            scoreCell('自摸', esc(tsumo.detail), '合计 ' + tsumo.total + ' 点 · ' + dealerText,
              'is-wide' + (hand.tsumo ? ' is-current' : '')) +
          '</div>' +
          '<div class="fuhan-result-cols">' +
            '<section class="fuhan-block">' +
              '<h4 class="fuhan-block-title">役种 <span class="fuhan-muted">' + yaku.length + ' 项</span></h4>' +
              '<ul class="fuhan-yaku-list">' + yakuItems + '</ul>' +
              '<div class="fuhan-yaku-total">' + (yakuman ? '合计 <b>役满</b>' : '合计 <b>' + han + '</b> 番') + '</div>' +
            '</section>' +
            '<section class="fuhan-block">' +
              '<h4 class="fuhan-block-title">符数明细</h4>' + fuBlock +
            '</section>' +
          '</div>' +
          '<div class="fuhan-result-foot">' +
            '<p class="fuhan-muted">点击役种名称，可到「役种一览」查看说明。</p>' +
            '<button type="button" class="tools-btn tools-btn-primary" data-act="next">下一题</button>' +
          '</div>' +
        '</div>' +
      '</div>';
  }

  /* ---------- 交互 ---------- */

  function chooseHan(value) {
    if (!state.q || state.step !== 1 || state.revealed) return;
    var correct = state.q.answer.han;
    if (value === correct) {
      state.wrongHan = null;
      state.feedback = { kind: 'ok', text: '番数正确：' + value + ' 番。接下来确认是否已经满贯封顶。' };
      state.step = 2;
      state.focus = '[data-act="confirm"]';
    } else {
      state.wrongHan = value;
      state.feedback = {
        kind: 'error',
        text: '不是 ' + value + ' 番。再数一遍：立直、自摸、役牌、断幺九、宝牌都能加番；宝牌只加番、本身不算役。答错不会进入下一步，可以再选一次。'
      };
      state.focus = '[data-act="han"][data-value="' + value + '"]';
    }
    render();
  }

  function confirmMangan() {
    if (!state.q || state.step !== 2 || state.revealed) return;
    if (skipFu()) {
      state.feedback = null;
      state.step = 'done';
      state.focus = '[data-act="next"]';
    } else {
      state.feedback = { kind: 'info', text: '按规则，本局还没到满贯封顶线，仍需数符。' };
      state.step = 3;
      state.focus = '[data-act="fu"]';
    }
    render();
  }

  function chooseFu(value) {
    if (!state.q || state.step !== 3 || state.revealed) return;
    var correct = state.q.answer.fu;
    if (value === correct) {
      state.wrongFu = null;
      state.feedback = null;
      state.step = 'done';
      state.focus = '[data-act="next"]';
    } else {
      state.wrongFu = value;
      state.feedback = {
        kind: 'error',
        text: '不是 ' + value + ' 符。再数一遍：副底 20 符，暗刻/明刻、雀头、听牌形、自摸与门前荣和各有权重，最后切上取整。答错不会进入下一步，可以再选一次。'
      };
      state.focus = '[data-act="fu"][data-value="' + value + '"]';
    }
    render();
  }

  function revealAnswer() {
    if (!state.q || state.revealed || state.step === 'done') return;
    state.revealed = true;
    state.step = 'done';
    state.wrongHan = null;
    state.wrongFu = null;
    state.feedback = null;
    state.focus = '[data-act="next"]';
    render();
  }

  function applyFocus() {
    if (!state.focus || !state.panel) return;
    var selector = state.focus;
    state.focus = null;
    var el = state.panel.querySelector(selector);
    if (!el) return;
    try {
      el.focus({ preventScroll: true });
    } catch (err) {
      el.focus();
    }
  }

  function onClick(event) {
    var target = event.target;
    var button = target && target.closest ? target.closest('[data-act]') : null;
    if (!button || !state.panel || !state.panel.contains(button)) return;

    var act = button.getAttribute('data-act');
    if (act === 'next') {
      newQuestion();
    } else if (act === 'show-answer') {
      revealAnswer();
    } else if (act === 'han') {
      chooseHan(Number(button.getAttribute('data-value')));
    } else if (act === 'confirm') {
      confirmMangan();
    } else if (act === 'fu') {
      chooseFu(Number(button.getAttribute('data-value')));
    } else if (act === 'retry') {
      init(state.panel);
    }
  }

  function bind(panel) {
    if (state.boundPanel === panel) return;
    if (state.boundPanel) state.boundPanel.removeEventListener('click', onClick);
    panel.addEventListener('click', onClick);
    state.boundPanel = panel;
  }

  function renderError(message) {
    if (!state.panel) return;
    state.panel.innerHTML = '<div class="tools-empty is-error">' +
        '<h3>算番模块暂时不可用</h3>' +
        '<p>' + esc(message) + '</p>' +
        '<p class="fuhan-muted">请刷新页面重试；如果反复出现，可能是算法引擎没有加载。</p>' +
        '<div class="tools-empty-actions">' +
          '<button type="button" class="tools-btn tools-btn-primary" data-act="retry">重新加载</button>' +
        '</div>' +
      '</div>';
  }

  function init(panel) {
    if (!panel) return;
    state.panel = panel;
    bind(panel);

    var error = readyError();
    if (error) {
      state.q = null;
      renderError(error);
      return;
    }

    try {
      newQuestion();
    } catch (err) {
      state.q = null;
      renderError('生成题目失败：' + (err && err.message ? err.message : err));
    }
  }

  /* 从役种一览返回算番时，面板可能已被外壳重新清空，按原状态重绘 */
  document.addEventListener('mj:tools-activate', function (event) {
    var detail = event.detail || {};
    if (detail.name !== 'fuhan') return;
    if (detail.panel && detail.panel !== state.panel) {
      state.panel = detail.panel;
      bind(detail.panel);
    }
    if (!state.panel || !state.q) return;
    if (!state.panel.querySelector('.fuhan') && !state.panel.querySelector('.tools-empty')) {
      render();
    }
  });

  window.MJ.modules.fuhan = {
    init: init,
    getState: function () {
      return {
        seq: state.seq,
        step: state.step,
        revealed: state.revealed,
        question: state.q
      };
    }
  };
})();
