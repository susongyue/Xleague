/*!
 * scoretable — 番符点数对照表 + 符数计算
 * 点数数据与微信小程序 pages/score-table 完全一致（竖表：符 = 行，番 = 列）。
 * 契约：window.MJ.modules.scoretable = { init: function (panel) { ... } }
 */
(function () {
  'use strict';

  window.MJ = window.MJ || {};
  window.MJ.modules = window.MJ.modules || {};

  /* ───────────────────────── 点数数据（源：score-table.js） ───────────────────────── */
  // ko:  [子家荣和总点数, 子家自摸·闲家每家付, 子家自摸·庄家付]
  // oya: [庄家荣和总点数, 庄家自摸·每家付]
  var PT = {
    '1h': {
      30:  { oya: [1500, 500],   ko: [1000, 300, 500] },
      40:  { oya: [2000, 700],   ko: [1300, 400, 700] },
      50:  { oya: [2400, 800],   ko: [1600, 400, 800] },
      60:  { oya: [2900, 1000],  ko: [2000, 500, 1000] },
      70:  { oya: [3400, 1200],  ko: [2300, 600, 1200] },
      80:  { oya: [3900, 1300],  ko: [2600, 700, 1300] },
      90:  { oya: [4400, 1500],  ko: [2900, 800, 1500] },
      100: { oya: [4800, 1600],  ko: [3200, 800, 1600] },
      110: { oya: [5300, null],  ko: [3600, 800, 1600] }
    },
    '2h': {
      25:  { oya: null,          ko: [1600, null, null] },
      30:  { oya: [2900, 1000],  ko: [2000, 500, 1000] },
      40:  { oya: [3900, 1300],  ko: [2600, 700, 1300] },
      50:  { oya: [4800, 1600],  ko: [3200, 800, 1600] },
      60:  { oya: [5800, 2000],  ko: [3900, 1000, 2000] },
      70:  { oya: [6800, 2300],  ko: [4500, 1200, 2300] },
      80:  { oya: [7700, 2600],  ko: [5200, 1300, 2600] },
      90:  { oya: [8700, 2900],  ko: [5800, 1500, 2900] },
      100: { oya: [9600, 3200],  ko: [6400, 1600, 3200] },
      110: { oya: [10600, 3600], ko: [7100, 1800, 3600] }
    },
    '3h': {
      20:  { oya: [3900, 1300],  ko: [2600, 700, 1300] },
      25:  { oya: [4800, 1600],  ko: [3200, 800, 1600] },
      30:  { oya: [5800, 2000],  ko: [3900, 1000, 2000] },
      40:  { oya: [7700, 2600],  ko: [5200, 1300, 2600] },
      50:  { oya: [9600, 3200],  ko: [6400, 1600, 3200] },
      60:  { oya: [11600, 3900], ko: [7700, 2000, 3900] }
    },
    '4h': {
      20:  { oya: [7700, 2600],  ko: [5200, 1300, 2600] },
      25:  { oya: [9600, 3200],  ko: [6400, 1600, 3200] },
      30:  { oya: [11600, 3900], ko: [7700, 2000, 3900] }
    }
  };

  // 常规列里已达满贯、按固定点数显示的格子（不含 5+ 列）
  var SPECIAL_CELLS = {
    '70_3': 'mangan', '80_3': 'mangan', '90_3': 'mangan', '100_3': 'mangan', '110_3': 'mangan',
    '40_4': 'mangan', '50_4': 'mangan', '60_4': 'mangan', '70_4': 'mangan',
    '80_4': 'mangan', '90_4': 'mangan', '100_4': 'mangan', '110_4': 'mangan'
  };

  // 5 番及以上列：按符数行合并的固定档位
  var MERGE_5PLUS = [
    { fus: [20, 25, 30, 40], type: 'mangan',   hanRange: '5番' },
    { fus: [50],            type: 'haneman',  hanRange: '6~7番' },
    { fus: [60],            type: 'baiman',   hanRange: '8~10番' },
    { fus: [70, 80],        type: 'sanbaiman', hanRange: '11~12番' },
    { fus: [90, 100, 110],  type: 'yakuman',  hanRange: '13番以上' }
  ];

  var SP_LABEL = {
    mangan:    { ko: ['满贯', '8000', '2000,4000'],   oya: ['满贯', '12000', '4000'] },
    haneman:   { ko: ['跳满', '12000', '3000,6000'],  oya: ['跳满', '18000', '6000'] },
    baiman:    { ko: ['倍满', '16000', '4000,8000'],  oya: ['倍满', '24000', '8000'] },
    sanbaiman: { ko: ['三倍满', '24000', '6000,12000'], oya: ['三倍满', '36000', '12000'] },
    yakuman:   { ko: ['役满', '32000', '8000,16000'], oya: ['役满', '48000', '16000'] }
  };

  var TIER_NAMES = { mangan: '满贯', haneman: '跳满', baiman: '倍满', sanbaiman: '三倍满', yakuman: '役满' };

  var FU_ROWS = [20, 25, 30, 40, 50, 60, 70, 80, 90, 100, 110];
  var HAN_COLS = [
    { key: '1h', name: '1番' },
    { key: '2h', name: '2番' },
    { key: '3h', name: '3番' },
    { key: '4h', name: '4番' },
    { key: '5+', name: '5番及以上' }
  ];

  var ROLE_NAME = { ko: '闲家（子家）', oya: '庄家（亲家）' };

  /* ───────────────────────── 工具函数 ───────────────────────── */
  function spLabel(type, role) {
    return SP_LABEL[type][role];
  }

  function pow2(n) {
    return Math.pow(2, n);
  }

  function tsumoNote(diff, ron) {
    if (diff === 0) return '，与荣和总额一致';
    if (diff === 100) return '（自摸分别进位，比荣和多 100 点）';
    return '（与荣和 ' + ron + ' 点不同，以表内数值为准）';
  }

  function chain(n) {
    return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  }

  /* ───────────────────────── 点数表 ───────────────────────── */
  function normalTsumoText(role, pay) {
    if (role === 'ko') {
      return pay[1] != null && pay[2] != null ? pay[1] + ',' + pay[2] : '';
    }
    return pay[1] != null ? String(pay[1]) : '';
  }

  function buildTable(role) {
    var mergeStart = {};
    MERGE_5PLUS.forEach(function (g) { mergeStart[g.fus[0]] = g; });

    var html = '';

    FU_ROWS.forEach(function (fu) {
      html += '<tr>';
      html += '<th scope="row" class="st-fu">' + fu + '<span class="st-fu-unit">符</span></th>';

      HAN_COLS.forEach(function (hc, ci) {
        /* 5 番及以上：rowspan 合并格 */
        if (hc.key === '5+') {
          var g = mergeStart[fu];
          if (!g) return;
          var l = spLabel(g.type, role);
          var fus = g.fus.join('、');
          var aria = g.hanRange + '（' + fus + '符），' + l[0] + '，荣和 ' + l[1] + ' 点，自摸 ' +
            (role === 'ko' ? '闲家每家 ' + l[2].split(',')[0] + ' 点、庄家 ' + l[2].split(',')[1] + ' 点' : '三家各 ' + l[2] + ' 点');
          html += '<td class="st-cell st-merge" rowspan="' + g.fus.length + '" tabindex="0" role="button"' +
            ' data-kind="merge" data-type="' + g.type + '" data-hanrange="' + g.hanRange + '" data-fus="' + fus + '"' +
            ' aria-label="' + aria + '">' +
            '<span class="st-hanrange">' + g.hanRange + '</span>' +
            '<span class="st-sp-name">' + l[0] + '</span>' +
            '<span class="st-ron">' + l[1] + '</span>' +
            '<span class="st-tsumo">' + l[2] + '</span>' +
            '</td>';
          return;
        }

        var hanNum = ci + 1;
        var spType = SPECIAL_CELLS[fu + '_' + hanNum];

        if (spType) {
          var sl = spLabel(spType, role);
          var spAria = fu + '符' + hanNum + '番，' + sl[0] + '，荣和 ' + sl[1] + ' 点，自摸 ' +
            (role === 'ko' ? '闲家 ' + sl[2].split(',')[0] + ' 点、庄家 ' + sl[2].split(',')[1] + ' 点' : '每家 ' + sl[2] + ' 点');
          html += '<td class="st-cell st-special" tabindex="0" role="button"' +
            ' data-kind="special" data-fu="' + fu + '" data-han="' + hanNum + '" data-type="' + spType + '"' +
            ' aria-label="' + spAria + '">' +
            '<span class="st-sp-name">' + sl[0] + '</span>' +
            '<span class="st-ron">' + sl[1] + '</span>' +
            '<span class="st-tsumo">' + sl[2] + '</span>' +
            '</td>';
          return;
        }

        var cell = PT[hc.key] && PT[hc.key][fu];
        var pay = cell && cell[role];
        if (!pay || pay[0] == null) {
          html += '<td class="st-empty" aria-label="' + fu + '符' + hanNum + '番，无此组合">—</td>';
          return;
        }

        var tsumo = normalTsumoText(role, pay);
        var aria2 = fu + '符' + hanNum + '番，荣和 ' + pay[0] + ' 点' +
          (tsumo ? '，自摸 ' + (role === 'ko' ? '闲家 ' + pay[1] + ' 点、庄家 ' + pay[2] + ' 点' : '每家 ' + pay[1] + ' 点') : '');
        html += '<td class="st-cell" tabindex="0" role="button"' +
          ' data-kind="normal" data-fu="' + fu + '" data-han="' + hanNum + '" data-hankey="' + hc.key + '"' +
          ' aria-label="' + aria2 + '">' +
          '<span class="st-ron">' + pay[0] + '</span>' +
          (tsumo ? '<span class="st-tsumo">' + tsumo + '</span>' : '') +
          '</td>';
      });

      html += '</tr>';
    });

    return html;
  }

  function tableView(role) {
    var isKo = role === 'ko';
    var title = isKo ? '闲家点数表' : '庄家点数表';
    var sub = '行 = 符数，列 = 番数。大字为荣和得点，小字为自摸支付（' +
      (isKo ? '闲家,庄家' : '每家') + '）。点击格子查看算分推导。';

    return '' +
      '<div class="st-view" data-view="' + role + '" id="st-view-' + role + '" role="tabpanel" aria-labelledby="st-tab-' + role + '">' +
        '<div class="tools-card">' +
          '<div class="st-view-head">' +
            '<div>' +
              '<h3 class="tools-card-title">' + title + '</h3>' +
              '<p class="tools-card-sub">' + sub + '</p>' +
            '</div>' +
            '<span class="tools-badge is-outline">' + (isKo ? '子家' : '亲家') + '</span>' +
          '</div>' +
          '<div class="tools-table-wrap st-table-wrap">' +
            '<table class="st-table" aria-label="' + title + '（单位：点）">' +
              '<thead><tr><th scope="col" class="st-fu">符 \\ 番</th>' +
                HAN_COLS.map(function (hc) { return '<th scope="col">' + hc.name + '</th>'; }).join('') +
              '</tr></thead>' +
              '<tbody>' + buildTable(role) + '</tbody>' +
            '</table>' +
          '</div>' +
          '<p class="st-hint">窄屏可左右滑动表格，首列固定。带底色的格子为满贯及以上固定点数，5 番以上按番数分级。</p>' +
        '</div>' +
      '</div>';
  }

  /* ───────────────────────── 算分推导 ───────────────────────── */
  function normalDerive(fu, hanNum, role) {
    var cell = PT[HAN_COLS[hanNum - 1].key][fu];
    var pay = cell[role];
    var base = fu * pow2(hanNum + 2);
    var steps = [{
      tag: 'Step 1',
      title: '基本点',
      lines: [
        '基本点 = 符数 × 2^(番数 + 2)',
        fu + ' × 2^(' + hanNum + ' + 2) = ' + fu + ' × ' + pow2(hanNum + 2) + ' = ' + base + ' 点'
      ]
    }];

    if (role === 'ko') {
      steps.push({
        tag: 'Step 2',
        title: '荣和得点（子家）',
        lines: [
          '子家得点 = 4 × 基本点',
          '4 × ' + base + ' = ' + (base * 4) + ' 点',
          '向上取整至百位 = ' + pay[0] + ' 点'
        ]
      });
      if (pay[1] != null && pay[2] != null) {
        steps.push({
          tag: 'Step 3',
          title: '自摸拆分（子家）',
          lines: [
            '闲家每家付 ' + pay[1] + ' 点，庄家付 ' + pay[2] + ' 点',
            pay[1] + ' × 2 + ' + pay[2] + ' = ' + (pay[1] * 2 + pay[2]) + ' 点' +
              tsumoNote(pay[1] * 2 + pay[2] - pay[0], pay[0])
          ]
        });
      } else {
        steps.push({
          tag: 'Step 3',
          title: '自摸拆分',
          lines: ['此组合自摸不存在，仅荣和成立。']
        });
      }
    } else {
      steps.push({
        tag: 'Step 2',
        title: '荣和得点（庄家）',
        lines: [
          '庄家得点 = 6 × 基本点',
          '6 × ' + base + ' = ' + (base * 6) + ' 点',
          '向上取整至百位 = ' + pay[0] + ' 点'
        ]
      });
      if (pay[1] != null) {
        steps.push({
          tag: 'Step 3',
          title: '自摸拆分（庄家）',
          lines: [
            '三家各付 ' + pay[1] + ' 点',
            pay[1] + ' × 3 = ' + (pay[1] * 3) + ' 点' +
              tsumoNote(pay[1] * 3 - pay[0], pay[0])
          ]
        });
      } else {
        steps.push({
          tag: 'Step 3',
          title: '自摸拆分',
          lines: ['此组合自摸不存在，仅荣和成立。']
        });
      }
    }

    var tsumoText = role === 'ko'
      ? (pay[1] != null ? '闲 ' + pay[1] + ' ／ 庄 ' + pay[2] : '—')
      : (pay[1] != null ? '每家 ' + pay[1] : '—');

    return {
      key: 'normal:' + role + ':' + fu + ':' + hanNum,
      title: fu + '符 ' + hanNum + '番 · ' + ROLE_NAME[role],
      ron: pay[0],
      tsumo: tsumoText,
      tsumoLabel: role === 'ko' ? '自摸（闲／庄）' : '自摸（每家）',
      steps: steps,
      note: '进位规则：得点不足百位时向上取整至百位。'
    };
  }

  function specialDerive(fu, hanNum, type, role) {
    var l = spLabel(type, role);
    var base = fu * pow2(hanNum + 2);
    var tsumoText = role === 'ko'
      ? '闲 ' + l[2].split(',')[0] + ' ／ 庄 ' + l[2].split(',')[1]
      : '每家 ' + l[2];

    return {
      key: 'special:' + role + ':' + fu + ':' + hanNum + ':' + type,
      title: fu + '符 ' + hanNum + '番 · ' + l[0] + ' · ' + ROLE_NAME[role],
      ron: l[1],
      tsumo: tsumoText,
      tsumoLabel: role === 'ko' ? '自摸（闲／庄）' : '自摸（每家）',
      steps: [
        {
          tag: '判定',
          title: '基本点达到 2000，进' + l[0],
          lines: [
            '基本点 = ' + fu + ' × 2^(' + hanNum + ' + 2) = ' + base + ' 点 ≥ 2000 点',
            '达到满贯线后不再按符数计算，改按番数分级为固定得点。'
          ]
        },
        {
          tag: '本格',
          title: l[0] + '（固定点数）',
          lines: [
            role === 'ko'
              ? '子家：荣和 ' + l[1] + ' 点；自摸 闲家每家 ' + l[2].split(',')[0] + ' 点，庄家 ' + l[2].split(',')[1] + ' 点'
              : '庄家：荣和 ' + l[1] + ' 点；自摸 三家各付 ' + l[2] + ' 点'
          ]
        }
      ],
      note: '满贯及以上为固定点数，与符数无关。'
    };
  }

  function mergeDerive(type, hanRange, fus, role) {
    var l = spLabel(type, role);
    var tsumoText = role === 'ko'
      ? '闲 ' + l[2].split(',')[0] + ' ／ 庄 ' + l[2].split(',')[1]
      : '每家 ' + l[2];

    return {
      key: 'merge:' + role + ':' + type + ':' + hanRange,
      title: l[0] + '（' + hanRange + ' · ' + fus + '符）· ' + ROLE_NAME[role],
      ron: l[1],
      tsumo: tsumoText,
      tsumoLabel: role === 'ko' ? '自摸（闲／庄）' : '自摸（每家）',
      steps: [
        {
          tag: '说明',
          title: '满贯及以上为固定点数',
          lines: [
            '基本点达到 2000 即进满贯，此后不再按符数计算，而是按番数分级：',
            '5 番 → 满贯　6~7 番 → 跳满　8~10 番 → 倍满　11~12 番 → 三倍满　13 番以上 → 役满'
          ]
        },
        {
          tag: '本格',
          title: l[0] + '（' + hanRange + '）',
          lines: [
            role === 'ko'
              ? '子家：荣和 ' + l[1] + ' 点；自摸 闲家每家 ' + l[2].split(',')[0] + ' 点，庄家 ' + l[2].split(',')[1] + ' 点'
              : '庄家：荣和 ' + l[1] + ' 点；自摸 三家各付 ' + l[2] + ' 点'
          ]
        }
      ],
      note: '该合并档位对应的番数区间见上方标签；固定点数不参与进位。'
    };
  }

  function deriveHtml(d) {
    return '' +
      '<div class="st-derive-inner" role="region" aria-label="算分推导">' +
        '<div class="st-derive-head">' +
          '<div>' +
            '<span class="st-derive-kicker">算分推导</span>' +
            '<h4>' + d.title + '</h4>' +
          '</div>' +
          '<button type="button" class="st-derive-close" data-act="close-derive" aria-label="收起算分推导">收起</button>' +
        '</div>' +
        '<div class="st-pay">' +
          '<div class="st-pay-item"><span>荣和</span><b>' + d.ron + '</b><em>点</em></div>' +
          '<div class="st-pay-item"><span>' + d.tsumoLabel + '</span><b>' + d.tsumo + '</b></div>' +
        '</div>' +
        '<ol class="st-steps">' +
          d.steps.map(function (s) {
            return '<li><span class="st-step-tag">' + s.tag + '</span><div>' +
              '<h5>' + s.title + '</h5>' +
              s.lines.map(function (line) { return '<p>' + line + '</p>'; }).join('') +
              '</div></li>';
          }).join('') +
        '</ol>' +
        '<p class="st-derive-note">' + d.note + '</p>' +
      '</div>';
  }

  /* ───────────────────────── 符数计算器 ───────────────────────── */
  var MELDS = [
    { key: 'minko',  name: '明刻', simple: 2,  term: 4 },
    { key: 'anko',   name: '暗刻', simple: 4,  term: 8 },
    { key: 'minkan', name: '明杠', simple: 8,  term: 16 },
    { key: 'ankan',  name: '暗杠', simple: 16, term: 32 }
  ];

  function countOptions(selected) {
    var out = '';
    for (var i = 0; i <= 4; i++) {
      out += '<option value="' + i + '"' + (i === selected ? ' selected' : '') + '>' + i + '</option>';
    }
    return out;
  }

  function calcHtml() {
    var meldRows = MELDS.map(function (m) {
      return '<tr>' +
        '<th scope="row">' + m.name + '<span>+' + m.simple + ' / +' + m.term + '</span></th>' +
        '<td><select class="st-select st-select-sm" data-meld="' + m.key + '.simple" aria-label="' + m.name + '中张数量">' + countOptions(0) + '</select></td>' +
        '<td><select class="st-select st-select-sm" data-meld="' + m.key + '.term" aria-label="' + m.name + '幺九数量">' + countOptions(0) + '</select></td>' +
        '</tr>';
    }).join('');

    return '' +
      '<div class="st-view" data-view="calc" id="st-view-calc" role="tabpanel" aria-labelledby="st-tab-calc">' +
        '<div class="tools-card st-calc-card">' +
          '<div class="tools-card-head">' +
            '<div>' +
              '<h3 class="tools-card-title">符数计算</h3>' +
              '<p class="tools-card-sub">按和牌方式、面子、雀头与听牌形实时计算，结果向上取整至 10 符。</p>' +
            '</div>' +
            '<span class="tools-badge is-blue">实时</span>' +
          '</div>' +
          '<div class="tools-card-body">' +
            '<div class="st-calc-grid">' +
              '<div class="st-field">' +
                '<span class="st-label">和牌方式</span>' +
                '<div class="tools-seg" data-seg="winMode" role="group" aria-label="和牌方式">' +
                  '<button type="button" class="tools-seg-btn is-active" data-val="ron" aria-pressed="true">荣和</button>' +
                  '<button type="button" class="tools-seg-btn" data-val="tsumo" aria-pressed="false">自摸</button>' +
                '</div>' +
              '</div>' +
              '<div class="st-field">' +
                '<span class="st-label">手牌状态</span>' +
                '<div class="tools-seg" data-seg="handState" role="group" aria-label="手牌状态">' +
                  '<button type="button" class="tools-seg-btn is-active" data-val="closed" aria-pressed="true">门前</button>' +
                  '<button type="button" class="tools-seg-btn" data-val="open" aria-pressed="false">副露</button>' +
                '</div>' +
              '</div>' +
              '<label class="st-field">' +
                '<span class="st-label">雀头</span>' +
                '<select class="st-select" data-calc="pair">' +
                  '<option value="0" selected>无役牌雀头 +0</option>' +
                  '<option value="2">役牌雀头（门风／场风／三元）+2</option>' +
                  '<option value="4">连风雀头 +4</option>' +
                '</select>' +
              '</label>' +
              '<label class="st-field">' +
                '<span class="st-label">听牌形</span>' +
                '<select class="st-select" data-calc="wait">' +
                  '<option value="0" selected>两面／双碰 +0</option>' +
                  '<option value="2">单骑 +2</option>' +
                  '<option value="2">嵌张 +2</option>' +
                  '<option value="2">边张 +2</option>' +
                '</select>' +
              '</label>' +
            '</div>' +
            '<div class="st-checks">' +
              '<label class="st-check"><input type="checkbox" data-calc="pinfu"> 平和（门前自摸固定 20 符）</label>' +
              '<label class="st-check"><input type="checkbox" data-calc="chiitoi"> 七对子（固定 25 符）</label>' +
            '</div>' +
            '<div class="st-meld-wrap">' +
              '<table class="st-meld">' +
                '<caption>面子与杠（填写组数；中张 = 2~8，幺九 = 1／9／字牌）</caption>' +
                '<thead><tr><th scope="col">种类</th><th scope="col">中张</th><th scope="col">幺九</th></tr></thead>' +
                '<tbody>' + meldRows + '</tbody>' +
              '</table>' +
            '</div>' +
            '<div class="st-result" aria-live="polite">' +
              '<div class="st-result-main"><span>合计符数</span><b class="st-fu-value">30</b><span>符</span></div>' +
              '<ul class="st-breakdown"></ul>' +
            '</div>' +
            '<p class="st-calc-note" aria-live="polite"></p>' +
          '</div>' +
        '</div>' +
        '<details class="st-rules">' +
          '<summary>符数计算规则速查</summary>' +
          '<div class="st-rules-body">' +
            '<table class="st-rules-table">' +
              '<thead><tr><th scope="col">项目</th><th scope="col">符数</th></tr></thead>' +
              '<tbody>' +
                '<tr><th scope="row">底符</th><td>+20</td></tr>' +
                '<tr><th scope="row">明刻</th><td>中张 +2，幺九 +4</td></tr>' +
                '<tr><th scope="row">暗刻</th><td>中张 +4，幺九 +8</td></tr>' +
                '<tr><th scope="row">明杠</th><td>中张 +8，幺九 +16</td></tr>' +
                '<tr><th scope="row">暗杠</th><td>中张 +16，幺九 +32</td></tr>' +
                '<tr><th scope="row">雀头</th><td>门风 +2，场风 +2，连风 +4，三元牌 +2</td></tr>' +
                '<tr><th scope="row">听牌形</th><td>单骑 +2，嵌张 +2，边张 +2</td></tr>' +
                '<tr><th scope="row">和牌状态</th><td>无平和自摸 +2，门前荣和 +10</td></tr>' +
                '<tr><th scope="row">进位</th><td>合计后向上取整至 10 位</td></tr>' +
              '</tbody>' +
            '</table>' +
            '<ul class="st-rules-list">' +
              '<li><b>特例 1</b>平和 + 门前自摸，固定 20 符。</li>' +
              '<li><b>特例 2</b>七对子，固定 25 符。</li>' +
              '<li><b>特例 3</b>副露后不足 30 符时，固定按 30 符计算。</li>' +
            '</ul>' +
          '</div>' +
        '</details>' +
      '</div>';
  }

  function parseMeldValue(v) {
    return parseInt(v, 10) || 0;
  }

  function readCalc(root) {
    var winBtn = root.querySelector('[data-seg="winMode"] .is-active');
    var handBtn = root.querySelector('[data-seg="handState"] .is-active');
    var calc = {
      winMode: winBtn ? winBtn.dataset.val : 'ron',
      handState: handBtn ? handBtn.dataset.val : 'closed',
      pair: parseInt(root.querySelector('[data-calc="pair"]').value, 10) || 0,
      wait: parseInt(root.querySelector('[data-calc="wait"]').value, 10) || 0,
      pinfu: root.querySelector('[data-calc="pinfu"]').checked,
      chiitoi: root.querySelector('[data-calc="chiitoi"]').checked,
      melds: {}
    };
    MELDS.forEach(function (m) {
      calc.melds[m.key] = {
        simple: parseMeldValue(root.querySelector('[data-meld="' + m.key + '.simple"]').value),
        term: parseMeldValue(root.querySelector('[data-meld="' + m.key + '.term"]').value)
      };
    });
    return calc;
  }

  function computeFu(c) {
    var rows = [];

    if (c.chiitoi) {
      return {
        fu: 25,
        rows: [{ label: '七对子', val: '固定 25 符' }],
        note: '七对子固定 25 符，不参与进位。'
      };
    }

    if (c.pinfu && c.handState === 'closed') {
      var pfu = c.winMode === 'tsumo' ? 20 : 30;
      return {
        fu: pfu,
        rows: [{
          label: '平和',
          val: c.winMode === 'tsumo' ? '门前自摸固定 20 符' : '20 符 + 门前荣和 10 符'
        }],
        note: c.winMode === 'tsumo'
          ? '特例 1：平和 + 门前自摸，固定 20 符。'
          : '平和荣和：底符 20 + 门前荣和 10 = 30 符。'
      };
    }

    var fu = 20;
    rows.push({ label: '底符', val: '+20' });

    MELDS.forEach(function (m) {
      var n = c.melds[m.key];
      var add = n.simple * m.simple + n.term * m.term;
      if (!add) return;
      fu += add;
      rows.push({
        label: m.name + '（中张 ' + n.simple + ' / 幺九 ' + n.term + '）',
        val: '+' + add
      });
    });

    if (c.pair) {
      fu += c.pair;
      rows.push({ label: '雀头', val: '+' + c.pair });
    }

    if (c.wait) {
      fu += c.wait;
      rows.push({ label: '听牌形', val: '+' + c.wait });
    }

    if (c.handState === 'closed' && c.winMode === 'ron') {
      fu += 10;
      rows.push({ label: '门前荣和', val: '+10' });
    }

    if (c.handState === 'closed' && c.winMode === 'tsumo') {
      fu += 2;
      rows.push({ label: '无平和自摸', val: '+2' });
    }

    var raw = fu;
    var notes = [];

    if (c.handState === 'open' && raw < 30) {
      raw = 30;
      notes.push('特例 3：副露后不足 30 符，固定按 30 符计算。');
    }

    var finalFu = Math.ceil(raw / 10) * 10;
    if (finalFu !== raw) {
      rows.push({ label: '进位', val: raw + ' → ' + finalFu });
      notes.push('合计 ' + raw + ' 符，向上取整至 10 位为 ' + finalFu + ' 符。');
    }

    rows.push({ label: '合计', val: finalFu + ' 符', total: true });

    return { fu: finalFu, rows: rows, note: notes.join(' ') };
  }

  var calcBound = false;

  function updateCalc(root) {
    var c = readCalc(root);
    var res = computeFu(c);

    root.querySelector('.st-fu-value').textContent = res.fu;
    root.querySelector('.st-breakdown').innerHTML = res.rows.map(function (r) {
      return '<li' + (r.total ? ' class="is-total"' : '') + '><span>' + r.label + '</span><b>' + r.val + '</b></li>';
    }).join('');
    root.querySelector('.st-calc-note').textContent = res.note || '';

    var chiitoi = c.chiitoi;
    var pinfu = c.pinfu;
    root.querySelectorAll('[data-meld]').forEach(function (el) { el.disabled = chiitoi || pinfu; });
    root.querySelector('[data-calc="pair"]').disabled = chiitoi || pinfu;
    root.querySelector('[data-calc="wait"]').disabled = chiitoi || pinfu;
    root.querySelector('[data-calc="pinfu"]').disabled = chiitoi || c.handState === 'open';
    root.querySelector('[data-calc="chiitoi"]').disabled = pinfu;
  }

  /* ───────────────────────── 初始化 ───────────────────────── */
  function init(panel) {
    if (!panel) return;

    panel.innerHTML = '' +
      '<div class="st">' +
        '<div class="st-tabs" role="tablist" aria-label="番符表视图">' +
          '<button type="button" class="st-tab is-active" id="st-tab-ko" role="tab" data-sub="ko" aria-selected="true" aria-controls="st-view-ko">闲家点数表</button>' +
          '<button type="button" class="st-tab" id="st-tab-oya" role="tab" data-sub="oya" aria-selected="false" aria-controls="st-view-oya" tabindex="-1">庄家点数表</button>' +
          '<button type="button" class="st-tab" id="st-tab-calc" role="tab" data-sub="calc" aria-selected="false" aria-controls="st-view-calc" tabindex="-1">符数计算</button>' +
        '</div>' +
        tableView('ko') +
        tableView('oya') +
        calcHtml() +
        '<div class="st-derive" id="st-derive" hidden></div>' +
      '</div>';

    var root = panel.querySelector('.st');
    var deriveEl = root.querySelector('.st-derive');
    var views = {
      ko: root.querySelector('[data-view="ko"]'),
      oya: root.querySelector('[data-view="oya"]'),
      calc: root.querySelector('[data-view="calc"]')
    };
    var tabs = Array.prototype.slice.call(root.querySelectorAll('[data-sub]'));
    var currentSub = 'ko';
    var currentDeriveKey = null;

    function setSub(sub) {
      currentSub = sub;
      tabs.forEach(function (t) {
        var on = t.dataset.sub === sub;
        t.classList.toggle('is-active', on);
        t.setAttribute('aria-selected', on ? 'true' : 'false');
        t.tabIndex = on ? 0 : -1;
      });
      Object.keys(views).forEach(function (k) {
        views[k].hidden = k !== sub;
      });
      hideDerive();
      if (sub === 'calc') updateCalc(root);
    }

    function hideDerive() {
      deriveEl.hidden = true;
      deriveEl.innerHTML = '';
      currentDeriveKey = null;
      root.querySelectorAll('.st-cell[aria-expanded="true"]').forEach(function (el) {
        el.removeAttribute('aria-expanded');
      });
    }

    function showDerive(cell) {
      var role = currentSub;
      if (role !== 'ko' && role !== 'oya') return;

      var kind = cell.dataset.kind;
      var data;
      if (kind === 'normal') {
        data = normalDerive(parseInt(cell.dataset.fu, 10), parseInt(cell.dataset.han, 10), role);
      } else if (kind === 'special') {
        data = specialDerive(parseInt(cell.dataset.fu, 10), parseInt(cell.dataset.han, 10), cell.dataset.type, role);
      } else if (kind === 'merge') {
        data = mergeDerive(cell.dataset.type, cell.dataset.hanrange, cell.dataset.fus, role);
      } else {
        return;
      }

      if (currentDeriveKey === data.key) {
        hideDerive();
        return;
      }

      root.querySelectorAll('.st-cell[aria-expanded="true"]').forEach(function (el) {
        el.removeAttribute('aria-expanded');
      });
      deriveEl.innerHTML = deriveHtml(data);
      deriveEl.hidden = false;
      cell.setAttribute('aria-expanded', 'true');
      currentDeriveKey = data.key;

      if (deriveEl.getBoundingClientRect().top > window.innerHeight - 140) {
        deriveEl.scrollIntoView({
          block: 'nearest',
          behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth'
        });
      }
    }

    /* 子 tab 点击 */
    root.addEventListener('click', function (e) {
      var tab = e.target.closest('[data-sub]');
      if (tab && root.contains(tab)) {
        setSub(tab.dataset.sub);
        return;
      }

      var close = e.target.closest('[data-act="close-derive"]');
      if (close) {
        hideDerive();
        return;
      }

      var cell = e.target.closest('.st-cell');
      if (cell && root.contains(cell)) {
        showDerive(cell);
        return;
      }

      var segBtn = e.target.closest('.tools-seg-btn[data-val]');
      if (segBtn && root.contains(segBtn)) {
        var seg = segBtn.closest('[data-seg]');
        seg.querySelectorAll('.tools-seg-btn').forEach(function (b) {
          var on = b === segBtn;
          b.classList.toggle('is-active', on);
          b.setAttribute('aria-pressed', on ? 'true' : 'false');
        });

        if (seg.dataset.seg === 'handState' && segBtn.dataset.val === 'open') {
          root.querySelector('[data-calc="pinfu"]').checked = false;
        }
        if (seg.dataset.seg === 'winMode') {
          /* 平和门前自摸固定 20 符；切换和牌方式只需重算 */
        }
        updateCalc(root);
      }
    });

    /* 键盘：子 tab 左右切换、单元格 Enter/Space 展开 */
    root.addEventListener('keydown', function (e) {
      var cell = e.target.closest('.st-cell');
      if (cell) {
        if (e.key === 'Enter' || e.key === ' ' || e.key === 'Spacebar') {
          e.preventDefault();
          showDerive(cell);
        }
        return;
      }

      var tab = e.target.closest('[data-sub]');
      if (!tab) return;

      var idx = tabs.indexOf(tab);
      var next = -1;
      if (e.key === 'ArrowRight') next = (idx + 1) % tabs.length;
      else if (e.key === 'ArrowLeft') next = (idx - 1 + tabs.length) % tabs.length;
      else if (e.key === 'Home') next = 0;
      else if (e.key === 'End') next = tabs.length - 1;
      if (next < 0) return;

      e.preventDefault();
      setSub(tabs[next].dataset.sub);
      tabs[next].focus();
    });

    /* 计算器输入 */
    root.addEventListener('change', function (e) {
      var t = e.target;
      if (!t.matches('[data-calc], [data-meld]')) return;

      if (t.matches('[data-calc="chiitoi"]') && t.checked) {
        root.querySelector('[data-calc="pinfu"]').checked = false;
      }
      if (t.matches('[data-calc="pinfu"]') && t.checked) {
        root.querySelector('[data-calc="chiitoi"]').checked = false;
      }
      updateCalc(root);
    });

    /* 初始状态 */
    views.oya.hidden = true;
    views.calc.hidden = true;
    updateCalc(root);

    /* 供调试与自动化验收使用（不影响契约） */
    root.stScoretable = {
      computeFu: computeFu,
      readCalc: readCalc,
      setSub: setSub
    };
  }

  window.MJ.modules.scoretable = { init: init };
})();
