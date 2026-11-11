/*!
 * 熊熊雀庄 · 工具分页牌面渲染器
 * window.MJ.tiles
 *
 *   MJ.tiles.render(tiles, opts)  -> 牌面 HTML 字符串
 *   MJ.tiles.mount(el, tiles, opts) -> 渲染进容器并返回容器
 *
 * tiles 支持：
 *   ['1m','5p','0s','7z']            牌名字符串（0m/0p/0s = 赤5）
 *   ['123m','456p','77z']            连续写法（按花色拆开）
 *   [{suit:'m',rank:5,red:true}]     对象（red:true 或 rank:0 = 赤5）
 *   '123m456p77z'                    单个字符串
 *
 * opts：
 *   win   : 数组，元素可以是下标（number）、牌名（'4m'）或 true（全部高亮）
 *   red   : 数组，元素是下标或牌名，把对应的普通 5 渲染成赤5（0m/0p/0s）
 *   size  : 'xs'|'sm'|'md'|'lg'|'xl'，或直接给像素宽度（number）
 *   gap   : 牌与牌之间的间距（像素，number）
 *   className : 追加到外层容器的类名
 *   image : false 时只输出容器与占位块（无图环境兜底）
 *
 * 牌图路径：assets/tools/tiles/{key}.png（由本文件所在目录推导，可跨层级部署）
 */
;(function (global) {
  'use strict';

  var SUIT_NAMES = {
    m: ['一万', '二万', '三万', '四万', '五万', '六万', '七万', '八万', '九万'],
    p: ['一筒', '二筒', '三筒', '四筒', '五筒', '六筒', '七筒', '八筒', '九筒'],
    s: ['一索', '二索', '三索', '四索', '五索', '六索', '七索', '八索', '九索'],
    z: ['东风', '南风', '西风', '北风', '白板', '发财', '红中']
  };
  var RED_NAMES = { m: '赤五万', p: '赤五筒', s: '赤五索' };
  var SIZES = { xs: 1, sm: 1, md: 1, lg: 1, xl: 1 };

  /* ---- 牌图目录：优先取 <script src=".../tiles.js"> 的所在目录 + tiles/ ---- */
  function scriptBase() {
    try {
      var s = document.currentScript;
      if (s && s.src) {
        return s.src.replace(/tiles\.js(?:\?[^#]*)?$/i, '') + 'tiles/';
      }
    } catch (e) { /* ignore */ }
    return 'assets/tools/tiles/';
  }

  var BASE = scriptBase();

  function escapeHtml(str) {
    return String(str).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function isSuit(suit) {
    return suit === 'm' || suit === 'p' || suit === 's' || suit === 'z';
  }

  /* 对象牌 -> 牌名 key */
  function keyOf(tile) {
    if (tile == null) return null;
    if (typeof tile === 'string') return normalize(tile)[0] || null;
    if (typeof tile !== 'object') return null;
    var suit = tile.suit;
    if (!isSuit(suit)) return null;
    var rank = Number(tile.rank);
    var red = !!tile.red || rank === 0;
    if (red && suit !== 'z' && (rank === 5 || rank === 0)) return '0' + suit;
    var max = suit === 'z' ? 7 : 9;
    if (rank >= 1 && rank <= max) return String(rank) + suit;
    return null;
  }

  /* 牌名 key -> 中文牌名 */
  function nameOf(key) {
    if (typeof key !== 'string') return '';
    var m = /^([0-9])([mpsz])$/.exec(key);
    if (!m) return '';
    var rank = m[1];
    var suit = m[2];
    if (rank === '0') return RED_NAMES[suit] || '';
    var idx = Number(rank) - 1;
    return (SUIT_NAMES[suit] && SUIT_NAMES[suit][idx]) || '';
  }

  function srcOf(key) {
    return BASE + key + '.png';
  }

  /* 把任意写法展开成 key 数组 */
  function expand(entry, out) {
    if (entry == null) return;
    if (Array.isArray(entry)) {
      for (var i = 0; i < entry.length; i++) expand(entry[i], out);
      return;
    }
    if (typeof entry === 'object') {
      var key = keyOf(entry);
      if (key) out.push(key);
      return;
    }
    if (typeof entry !== 'string') return;

    var str = entry.trim().toLowerCase();
    if (!str) return;

    // r5m / 5mr 形式的赤牌
    var m = /^r([0-9])([mpsz])$/.exec(str) || /^([0-9])([mpsz])r$/.exec(str);
    if (m) {
      if (m[2] !== 'z' && m[1] === '5') out.push('0' + m[2]);
      else out.push(m[1] + m[2]);
      return;
    }

    // 123m / 0m / 123m456p789s11z 形式（可多组连写）
    var temp = [];
    var digits = '';
    for (var i = 0; i < str.length; i++) {
      var ch = str.charAt(i);
      if (ch >= '0' && ch <= '9') {
        digits += ch;
        continue;
      }
      if (ch === 'm' || ch === 'p' || ch === 's' || ch === 'z') {
        if (!digits) return; // 花色前没有数字：整串视为无效
        for (var d = 0; d < digits.length; d++) {
          var digit = digits.charAt(d);
          var num = Number(digit);
          if (ch === 'z') {
            if (num < 1 || num > 7) return;
          } else if (num < 0 || num > 9) {
            return;
          }
          temp.push(ch === 'z' ? digit + 'z' : (digit === '0' ? '0' + ch : digit + ch));
        }
        digits = '';
        continue;
      }
      return; // 非法字符
    }
    if (digits) return; // 结尾多余数字
    for (var t = 0; t < temp.length; t++) out.push(temp[t]);
  }

  function normalize(tiles) {
    if (tiles == null) return [];
    var list = Array.isArray(tiles) ? tiles : [tiles];
    var out = [];
    for (var i = 0; i < list.length; i++) expand(list[i], out);
    return out;
  }

  /* win / red 参数 -> 下标集合 */
  function toIndexSet(spec, keys) {
    var set = {};
    if (spec == null || spec === false) return set;
    if (spec === true) {
      for (var i = 0; i < keys.length; i++) set[i] = true;
      return set;
    }
    var items = Array.isArray(spec) ? spec : [spec];
    for (var n = 0; n < items.length; n++) {
      var it = items[n];
      if (typeof it === 'number' && isFinite(it)) {
        if (it >= 0 && it < keys.length) set[it] = true;
      } else {
        var wanted = normalize(it);
        for (var w = 0; w < wanted.length; w++) {
          for (var k = 0; k < keys.length; k++) {
            if (keys[k] === wanted[w]) set[k] = true;
          }
        }
      }
    }
    return set;
  }

  function px(value) {
    var num = Number(value);
    return isFinite(num) && num > 0 ? Math.round(num * 100) / 100 : null;
  }

  /**
   * 渲染牌面
   * @param {Array|string|object} tiles
   * @param {object} [opts]
   * @returns {string} HTML
   */
  function render(tiles, opts) {
    opts = opts || {};
    var keys = normalize(tiles);
    var winSet = toIndexSet(opts.win, keys);
    var redSet = toIndexSet(opts.red, keys);

    var size = opts.size == null ? 'md' : opts.size;
    var sizeClass = typeof size === 'string' && SIZES[size] ? ' mj-tiles--' + size : '';
    var style = '';
    if (typeof size === 'number') {
      var w = px(size);
      if (w) style = '--tile-w:' + w + 'px;';
    }
    var gap = px(opts.gap);
    if (gap) style += '--tile-gap:' + gap + 'px;';
    var cls = 'mj-tiles' + sizeClass + (opts.className ? ' ' + opts.className : '');
    var label = keys.map(nameOf).filter(Boolean).join('、');

    var html = '<div class="' + escapeHtml(cls) + '" role="group" aria-label="' +
      escapeHtml(label || '牌') + '"' + (style ? ' style="' + escapeHtml(style) + '"' : '') + '>';

    for (var i = 0; i < keys.length; i++) {
      var key = keys[i];
      if (redSet[i] && /^5[mps]$/.test(key)) key = '0' + key.charAt(1);
      var classes = 'mj-tile';
      if (winSet[i]) classes += ' is-win';
      if (/^0[mps]$/.test(key)) classes += ' is-red';

      html += '<span class="' + classes + '" data-tile="' + escapeHtml(key) + '">';
      if (opts.image !== false) {
        html += '<img src="' + escapeHtml(srcOf(key)) + '" alt="' + escapeHtml(nameOf(key)) +
          '" width="80" height="129" loading="lazy" decoding="async" draggable="false">';
      }
      html += '</span>';
    }
    html += '</div>';
    return html;
  }

  /**
   * 渲染进容器
   * @param {Element|string} el 元素或选择器
   * @param {Array|string|object} tiles
   * @param {object} [opts]
   * @returns {Element|null}
   */
  function mount(el, tiles, opts) {
    var node = typeof el === 'string' ? document.querySelector(el) : el;
    if (!node) return null;
    node.innerHTML = render(tiles, opts);
    return node;
  }

  /* 34 张标准牌（不含赤5） */
  function all() {
    var out = [];
    var suits = ['m', 'p', 's'];
    for (var s = 0; s < suits.length; s++) {
      for (var r = 1; r <= 9; r++) out.push(r + suits[s]);
    }
    for (var z = 1; z <= 7; z++) out.push(z + 'z');
    return out;
  }

  function redFives() {
    return ['0m', '0p', '0s'];
  }

  global.MJ = global.MJ || {};
  global.MJ.tiles = {
    render: render,
    mount: mount,
    keyOf: keyOf,
    nameOf: nameOf,
    src: srcOf,
    normalize: normalize,
    all: all,
    redFives: redFives,
    base: BASE,
    KEYS: all(),
    NAMES: SUIT_NAMES
  };
})(typeof window !== 'undefined' ? window : this);
