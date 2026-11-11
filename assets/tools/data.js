/*!
 * 熊熊雀庄 · 工具分页数据加载层
 * window.MJ.data
 *
 *   MJ.data.loadTraining()  -> Promise<Array>  牌效训练题库（300 条）
 *   MJ.data.loadYaku()      -> Promise<Array>  役种一览（123 条）
 *   MJ.data.get('training'|'yaku')  -> 已缓存数据或 null
 *   MJ.data.clear(name?)    -> 清缓存（不传则清全部）
 *
 * 数据文件：
 *   assets/tools/data/training.json  （原样复制自小程序 tools/training-problems-new.json）
 *   assets/tools/data/yaku.json      （由 pages/search/yaku-data.js 转成的 JSON 数组）
 *
 * 说明：fetch 成功后会缓存 Promise 与结果；失败不缓存，可再次调用重试。
 *       失败抛出 Error，message 为可直接展示给用户的中文说明。
 */
;(function (global) {
  'use strict';

  function scriptBase() {
    try {
      var s = document.currentScript;
      if (s && s.src) return s.src.replace(/data\.js(?:\?[^#]*)?$/i, '');
    } catch (e) { /* ignore */ }
    return 'assets/tools/';
  }

  var BASE = scriptBase();
  var FILES = {
    training: 'data/training.json',
    yaku: 'data/yaku.json'
  };
  var LABELS = {
    training: '牌效训练题库',
    yaku: '役种一览'
  };

  var cache = {};
  var pending = {};

  function failText(key, url, err) {
    var reason = err && err.message ? err.message : '未知错误';
    return '无法加载「' + (LABELS[key] || key) + '」数据（' + url + '）：' + reason;
  }

  function load(key) {
    if (!FILES[key]) {
      return Promise.reject(new Error('未知的数据集：' + key));
    }
    if (cache[key]) return Promise.resolve(cache[key]);
    if (pending[key]) return pending[key];

    var url = BASE + FILES[key];
    var task;

    if (typeof fetch !== 'function') {
      task = Promise.reject(new Error('当前浏览器不支持 fetch，无法读取数据文件'));
    } else {
      task = fetch(url, { credentials: 'same-origin' })
        .then(function (res) {
          if (!res.ok) throw new Error('HTTP ' + res.status);
          return res.json();
        })
        .then(function (data) {
          if (!Array.isArray(data)) throw new Error('数据格式错误：根节点应为数组');
          cache[key] = data;
          return data;
        });
    }

    var guarded = task.catch(function (err) {
      delete pending[key];
      var e = new Error(failText(key, url, err));
      e.cause = err;
      e.url = url;
      throw e;
    }).then(function (data) {
      delete pending[key];
      return data;
    });

    pending[key] = guarded;
    return guarded;
  }

  function loadTraining() {
    return load('training');
  }

  function loadYaku() {
    return load('yaku');
  }

  function get(key) {
    return cache[key] || null;
  }

  function clear(key) {
    if (key) {
      delete cache[key];
      delete pending[key];
      return;
    }
    cache = {};
    pending = {};
  }

  global.MJ = global.MJ || {};
  global.MJ.data = {
    base: BASE,
    files: FILES,
    labels: LABELS,
    load: load,
    loadTraining: loadTraining,
    loadYaku: loadYaku,
    get: get,
    clear: clear
  };
})(typeof window !== 'undefined' ? window : this);
