/*!
 * 熊熊雀庄 · 工具分页日麻算法引擎（浏览器单文件版）
 * 移植自微信小程序 miniprogram/utils/mahjong 的 9 个 CommonJS 模块：
 *   tile-core / shanten / agari / yaku / score / ukeire / point-est / generator / commentary
 * 算法逻辑逐字保留，仅把模块引入改为同文件内的 _deps 引用、导出改为 return。
 * 暴露：window.MJ.engine = { tileCore, shanten, agari, yaku, score, ukeire, pointEst, generator, commentary }
 * 本文件为普通 <script> 即可加载的 IIFE，无 CommonJS / Node API 依赖。
 */
;(function (global) {
  var _deps = {}

  // ==================== tile-core.js ====================
  var tileCore = (function (_deps) {
// 牌数据核心：模型、编解码、34 编码、排序、牌山
// tile 对象: { suit: 'm'|'p'|'s'|'z', rank: 1..9(z:1..7), red?: true }
// 34 索引: 0-8 = 1m-9m, 9-17 = 1p-9p, 18-26 = 1s-9s, 27-33 = 1z-7z

const SUITS = ['m', 'p', 's', 'z']

function tileToIndex(t) {
  const base = { m: 0, p: 9, s: 18, z: 27 }[t.suit]
  return base + t.rank - 1
}

function indexToTile(i) {
  if (i < 9) return { suit: 'm', rank: i + 1 }
  if (i < 18) return { suit: 'p', rank: i - 8 }
  if (i < 27) return { suit: 's', rank: i - 17 }
  return { suit: 'z', rank: i - 26 }
}

// tiles 数组 -> 长度34的计数数组
function toCounts(tiles) {
  const c = new Array(34).fill(0)
  for (const t of tiles) c[tileToIndex(t)]++
  return c
}

// 解析字符串如 "123m406p78s55z"（0 表示赤5）
function parseTiles(str) {
  const out = []
  let digits = []
  for (const ch of str) {
    if (ch >= '0' && ch <= '9') digits.push(ch)
    else if ('mpsz'.includes(ch)) {
      for (const d of digits) {
        if (d === '0') out.push({ suit: ch, rank: 5, red: true })
        else out.push({ suit: ch, rank: +d })
      }
      digits = []
    }
  }
  return out
}

function tilesToString(tiles) {
  const groups = { m: [], p: [], s: [], z: [] }
  for (const t of sortTiles(tiles)) groups[t.suit].push(t.red ? 0 : t.rank)
  let s = ''
  for (const k of SUITS) if (groups[k].length) s += groups[k].join('') + k
  return s
}

function sortTiles(tiles) {
  return tiles.slice().sort((a, b) => {
    const d = tileToIndex(a) - tileToIndex(b)
    if (d !== 0) return d
    return (a.red ? 1 : 0) - (b.red ? 1 : 0)
  })
}

function sameTile(a, b) {
  return a.suit === b.suit && a.rank === b.rank
}

// 完整牌山 136 张（含 3 张赤5）
function buildWall(withRed = true) {
  const wall = []
  for (const s of ['m', 'p', 's']) {
    for (let r = 1; r <= 9; r++) {
      for (let i = 0; i < 4; i++) {
        if (withRed && r === 5 && i === 0) wall.push({ suit: s, rank: 5, red: true })
        else wall.push({ suit: s, rank: r })
      }
    }
  }
  for (let z = 1; z <= 7; z++) for (let i = 0; i < 4; i++) wall.push({ suit: 'z', rank: z })
  return wall
}

function shuffle(arr) {
  const a = arr.slice()
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

function isTerminal(i) {
  return i < 27 && (i % 9 === 0 || i % 9 === 8)
}
function isHonor(i) {
  return i >= 27
}
function isYaochu(i) {
  return isTerminal(i) || isHonor(i)
}

return {
  SUITS,
  tileToIndex,
  indexToTile,
  toCounts,
  parseTiles,
  tilesToString,
  sortTiles,
  sameTile,
  buildWall,
  shuffle,
  isTerminal,
  isHonor,
  isYaochu,
}
  })(_deps)
  _deps.tileCore = tileCore

  // ==================== shanten.js ====================
  var shanten = (function (_deps) {
// 向听数计算：一般形 / 七对子 / 国士无双，取最小
// 输入：34 计数数组（13 或 14 张均可）。0 = 听牌，-1 = 和牌

const { isYaochu } = _deps.tileCore

function shanten(counts) {
  return Math.min(shantenNormal(counts), shantenChiitoi(counts), shantenKokushi(counts))
}

function shantenChiitoi(counts) {
  let pairs = 0, kinds = 0
  for (let i = 0; i < 34; i++) {
    if (counts[i] > 0) kinds++
    if (counts[i] >= 2) pairs++
  }
  return 6 - pairs + Math.max(0, 7 - kinds)
}

function shantenKokushi(counts) {
  let kinds = 0, hasPair = false
  for (let i = 0; i < 34; i++) {
    if (!isYaochu(i)) continue
    if (counts[i] > 0) kinds++
    if (counts[i] >= 2) hasPair = true
  }
  return 13 - kinds - (hasPair ? 1 : 0)
}

// 一般形：回溯搜索面子/搭子的最优组合
function shantenNormal(counts) {
  const c = counts.slice()
  let best = 8
  const total = c.reduce((a, b) => a + b, 0)
  const maxMelds = Math.floor(total / 3) // 通常 4

  function evalState(melds, partials, hasPair) {
    // 向听 = (4 - melds)*2 - partials - hasPair 的标准式
    let p = partials
    if (melds + p > 4) p = 4 - melds
    const s = 8 - melds * 2 - p - (hasPair ? 1 : 0)
    if (s < best) best = s
  }

  function walk(i, melds, partials, hasPair) {
    // 剪枝
    if (8 - melds * 2 - partials - (hasPair ? 1 : 0) >= best) {
      // 仍可能改善，继续
    }
    while (i < 34 && c[i] === 0) i++
    if (i >= 34) { evalState(melds, partials, hasPair); return }

    // 刻子
    if (c[i] >= 3) {
      c[i] -= 3; walk(i, melds + 1, partials, hasPair); c[i] += 3
    }
    // 顺子
    if (i < 27 && i % 9 <= 6 && c[i + 1] > 0 && c[i + 2] > 0) {
      c[i]--; c[i + 1]--; c[i + 2]--
      walk(i, melds + 1, partials, hasPair)
      c[i]++; c[i + 1]++; c[i + 2]++
    }
    // 对子作雀头（任何时候都可取）
    if (c[i] >= 2 && !hasPair) {
      c[i] -= 2
      walk(i, melds, partials, true)
      c[i] += 2
    }
    if (melds + partials < 4) {
      // 对子作搭子
      if (c[i] >= 2) {
        c[i] -= 2
        walk(i, melds, partials + 1, hasPair)
        c[i] += 2
      }
      // 两面/边张搭子
      if (i < 27 && i % 9 <= 7 && c[i + 1] > 0) {
        c[i]--; c[i + 1]--
        walk(i, melds, partials + 1, hasPair)
        c[i]++; c[i + 1]++
      }
      // 嵌张搭子
      if (i < 27 && i % 9 <= 6 && c[i + 2] > 0) {
        c[i]--; c[i + 2]--
        walk(i, melds, partials + 1, hasPair)
        c[i]++; c[i + 2]++
      }
    }
    // 跳过这张牌（视为孤张）
    const saved = c[i]
    c[i] = 0
    walk(i + 1, melds, partials, hasPair)
    c[i] = saved
  }

  walk(0, 0, 0, false)
  return best
}

return { shanten, shantenChiitoi, shantenKokushi, shantenNormal }
  })(_deps)
  _deps.shanten = shanten

  // ==================== agari.js ====================
  var agari = (function (_deps) {
// 和牌判定与分解（输入：34 计数数组，14 张形）
// 分解结果: { pair: idx, melds: [{type:'shuntsu'|'kotsu', idx}], kind:'normal'|'chiitoi'|'kokushi' }

const { isYaochu } = _deps.tileCore

// 枚举所有 4面子+1雀头 的分解
function decomposeAll(counts) {
  const results = []
  for (let p = 0; p < 34; p++) {
    if (counts[p] >= 2) {
      counts[p] -= 2
      const melds = []
      searchMelds(counts, 0, melds, (found) => {
        results.push({ kind: 'normal', pair: p, melds: found.slice() })
      })
      counts[p] += 2
    }
  }
  return results
}

function searchMelds(c, start, melds, emit) {
  let i = start
  while (i < 34 && c[i] === 0) i++
  if (i >= 34) {
    if (melds.length === 4) emit(melds)
    return
  }
  // 刻子
  if (c[i] >= 3) {
    c[i] -= 3
    melds.push({ type: 'kotsu', idx: i })
    searchMelds(c, i, melds, emit)
    melds.pop()
    c[i] += 3
  }
  // 顺子（仅数牌，不跨花色）
  if (i < 27 && i % 9 <= 6 && c[i + 1] > 0 && c[i + 2] > 0) {
    c[i]--; c[i + 1]--; c[i + 2]--
    melds.push({ type: 'shuntsu', idx: i })
    searchMelds(c, i, melds, emit)
    melds.pop()
    c[i]++; c[i + 1]++; c[i + 2]++
  }
}

function isChiitoi(counts) {
  let pairs = 0
  for (let i = 0; i < 34; i++) {
    if (counts[i] === 2) pairs++
    else if (counts[i] !== 0) return false
  }
  return pairs === 7
}

function isKokushi(counts) {
  let hasPair = false
  for (let i = 0; i < 34; i++) {
    if (counts[i] === 0) { if (isYaochu(i)) return false; continue }
    if (!isYaochu(i)) return false
    if (counts[i] === 2) { if (hasPair) return false; hasPair = true }
    else if (counts[i] !== 1) return false
  }
  return hasPair
}

// 是否和牌（14 张）
function isAgari(counts) {
  if (isChiitoi(counts) || isKokushi(counts)) return true
  return decomposeAll(counts.slice()).length > 0
}

return { decomposeAll, isChiitoi, isKokushi, isAgari }
  })(_deps)
  _deps.agari = agari

  // ==================== yaku.js ====================
  var yaku = (function (_deps) {
// 役种判定 + 符数计算
// 输入 hand: {
//   tiles: 14张tile数组（含和牌张，门清立直练习范围，不含副露/杠）,
//   winTile: tile,             // 和牌张
//   tsumo: bool, riichi: bool, ippatsu: bool,
//   roundWind: 1..4, seatWind: 1..4,   // 1東2南3西4北
//   doraIndicators: tile[],    // 宝牌指示牌
//   uraIndicators: tile[],     // 里宝牌指示牌（立直时）
//   haitei: bool, houtei: bool // 海底/河底
// }
// 输出所有分解中的最高得点结果：
// { yaku: [{name, han}], han, fu, fuDetail: [...], yakuman: bool }

const { tileToIndex, indexToTile, toCounts, isYaochu, isTerminal, isHonor } = _deps.tileCore
const { decomposeAll, isChiitoi, isKokushi } = _deps.agari

const WIND_NAME = ['東', '南', '西', '北']

function doraNext(idx) {
  // 宝牌指示牌 -> 宝牌
  if (idx < 27) {
    const s = Math.floor(idx / 9) * 9
    return s + ((idx - s + 1) % 9)
  }
  if (idx < 31) return 27 + ((idx - 27 + 1) % 4) // 風牌 東南西北循环
  return 31 + ((idx - 31 + 1) % 3)               // 三元牌 白發中循环
}

function countDora(tiles, indicators) {
  if (!indicators || !indicators.length) return 0
  const doraIdx = indicators.map((t) => doraNext(tileToIndex(t)))
  let n = 0
  for (const t of tiles) {
    const i = tileToIndex(t)
    for (const d of doraIdx) if (i === d) n++
  }
  return n
}

function countRed(tiles) {
  return tiles.filter((t) => t.red).length
}

// 计算单个分解的役与符
function evalDecomp(dec, hand, counts) {
  const { pair, melds } = dec
  const winIdx = tileToIndex(hand.winTile)
  const yaku = []
  let yakumanList = []

  const allIdx = []
  for (const m of melds) {
    if (m.type === 'shuntsu') allIdx.push(m.idx, m.idx + 1, m.idx + 2)
    else allIdx.push(m.idx, m.idx, m.idx)
  }
  allIdx.push(pair, pair)

  const shuntsu = melds.filter((m) => m.type === 'shuntsu')
  const kotsu = melds.filter((m) => m.type === 'kotsu')

  // ---- 判断刻子明暗：荣和的和牌张组成的刻子视为明刻 ----
  const kotsuInfo = kotsu.map((m) => {
    let concealed = true
    if (!hand.tsumo && m.idx === winIdx) {
      const inShuntsu = shuntsu.some((s) => winIdx >= s.idx && winIdx <= s.idx + 2)
      if (!inShuntsu) concealed = false
    }
    return { idx: m.idx, concealed }
  })

  // ---- 听牌形（用于平和与符）----
  let waitFu = 2 // 默认 嵌张/边张/单骑 2 符
  let ryanmen = false
  const winInKotsu = kotsu.some((m) => m.idx === winIdx)
  if (winInKotsu) {
    // 和牌张凑成刻子：雀头正是和牌张 -> 单骑(+2)；否则为双碰(不另计 2 符)
    waitFu = pair === winIdx ? 2 : 0
  } else {
    ryanmen = shuntsu.some((s) => {
      const r = s.idx % 9
      if (winIdx === s.idx) return r >= 1        // 两面（排除 1-2-3 听 1 的边张）
      if (winIdx === s.idx + 2) return r <= 5     // 两面（排除 7-8-9 听 9 的边张）
      return false
    })
    if (ryanmen) waitFu = 0
  }

  // ---- 役判定 ----
  const roundWindIdx = 27 + hand.roundWind - 1
  const seatWindIdx = 27 + hand.seatWind - 1
  const menzen = true // 本练习范围：门清

  if (hand.riichi) yaku.push({ name: '立直', han: 1 })
  if (hand.ippatsu && hand.riichi) yaku.push({ name: '一发', han: 1 })
  if (hand.tsumo && menzen) yaku.push({ name: '门前清自摸和', han: 1 })
  if (hand.haitei && hand.tsumo) yaku.push({ name: '海底摸月', han: 1 })
  if (hand.houtei && !hand.tsumo) yaku.push({ name: '河底捞鱼', han: 1 })

  // 平和：全顺子 + 雀头非役牌 + 两面听
  const pairIsYakuhai = pair === roundWindIdx || pair === seatWindIdx || pair >= 31
  if (shuntsu.length === 4 && !pairIsYakuhai && ryanmen) yaku.push({ name: '平和', han: 1 })

  // 断幺九
  if (allIdx.every((i) => !isYaochu(i))) yaku.push({ name: '断幺九', han: 1 })

  // 役牌
  for (const k of kotsu) {
    if (k.idx === 31) yaku.push({ name: '役牌 白', han: 1 })
    if (k.idx === 32) yaku.push({ name: '役牌 發', han: 1 })
    if (k.idx === 33) yaku.push({ name: '役牌 中', han: 1 })
    if (k.idx === roundWindIdx) yaku.push({ name: `场风 ${WIND_NAME[hand.roundWind - 1]}`, han: 1 })
    if (k.idx === seatWindIdx) yaku.push({ name: `自风 ${WIND_NAME[hand.seatWind - 1]}`, han: 1 })
  }

  // 一杯口 / 二杯口（门清）
  const shuntsuKeys = shuntsu.map((s) => s.idx)
  let dupPairs = 0
  const seen = {}
  for (const k of shuntsuKeys) seen[k] = (seen[k] || 0) + 1
  for (const k in seen) dupPairs += Math.floor(seen[k] / 2)
  if (dupPairs === 2) yaku.push({ name: '二杯口', han: 3 })
  else if (dupPairs === 1) yaku.push({ name: '一杯口', han: 1 })

  // 三色同顺
  for (let r = 0; r <= 6; r++) {
    if ([r, r + 9, r + 18].every((k) => shuntsuKeys.includes(k))) {
      yaku.push({ name: '三色同顺', han: 2 })
      break
    }
  }
  // 三色同刻
  for (let r = 0; r <= 8; r++) {
    if ([r, r + 9, r + 18].every((k) => kotsu.some((m) => m.idx === k))) {
      yaku.push({ name: '三色同刻', han: 2 })
      break
    }
  }
  // 一气通贯
  for (const base of [0, 9, 18]) {
    if ([base, base + 3, base + 6].every((k) => shuntsuKeys.includes(k))) {
      yaku.push({ name: '一气通贯', han: 2 })
      break
    }
  }
  // 对对和
  if (kotsu.length === 4) yaku.push({ name: '对对和', han: 2 })

  // 三暗刻 / 四暗刻
  const ankou = kotsuInfo.filter((k) => k.concealed).length
  if (ankou === 4) {
    if (pair === winIdx && hand.tsumo === false) yakumanList.push({ name: '四暗刻单骑', han: 13 })
    else if (hand.tsumo) yakumanList.push({ name: '四暗刻', han: 13 })
    else yaku.push({ name: '三暗刻', han: 2 }) // 荣和使一刻成明刻
  } else if (ankou === 3) yaku.push({ name: '三暗刻', han: 2 })

  // 混全带幺九 / 纯全带幺九
  const allSetsYaochu = melds.every((m) => {
    if (m.type === 'kotsu') return isYaochu(m.idx)
    return m.idx % 9 === 0 || m.idx % 9 === 6
  }) && isYaochu(pair)
  if (allSetsYaochu) {
    const anyHonor = allIdx.some(isHonor)
    const hasShuntsu = shuntsu.length > 0
    if (!anyHonor && hasShuntsu) yaku.push({ name: '纯全带幺九', han: 3 })
    else if (anyHonor && hasShuntsu) yaku.push({ name: '混全带幺九', han: 2 })
  }

  // 混老头 / 清老头
  if (allIdx.every(isYaochu) && shuntsu.length === 0) {
    if (allIdx.every(isTerminal)) yakumanList.push({ name: '清老头', han: 13 })
    else if (allIdx.every(isHonor)) yakumanList.push({ name: '字一色', han: 13 })
    else yaku.push({ name: '混老头', han: 2 })
  }

  // 混一色 / 清一色
  const suitsUsed = new Set(allIdx.filter((i) => i < 27).map((i) => Math.floor(i / 9)))
  const hasHonorTiles = allIdx.some(isHonor)
  if (suitsUsed.size === 1) {
    if (hasHonorTiles) yaku.push({ name: '混一色', han: 3 })
    else yaku.push({ name: '清一色', han: 6 })
  }

  // 小三元 / 大三元
  const dragonKotsu = kotsu.filter((m) => m.idx >= 31).length
  if (dragonKotsu === 3) yakumanList.push({ name: '大三元', han: 13 })
  else if (dragonKotsu === 2 && pair >= 31) yaku.push({ name: '小三元', han: 2 })

  // 小四喜 / 大四喜
  const windKotsu = kotsu.filter((m) => m.idx >= 27 && m.idx <= 30).length
  if (windKotsu === 4) yakumanList.push({ name: '大四喜', han: 13 })
  else if (windKotsu === 3 && pair >= 27 && pair <= 30) yakumanList.push({ name: '小四喜', han: 13 })

  // 绿一色
  const GREEN = [19, 20, 21, 23, 25, 32] // 23468s 發
  if (allIdx.every((i) => GREEN.includes(i))) yakumanList.push({ name: '绿一色', han: 13 })

  // 九莲宝灯
  if (suitsUsed.size === 1 && !hasHonorTiles) {
    const base = Math.floor(allIdx[0] / 9) * 9
    const need = [3, 1, 1, 1, 1, 1, 1, 1, 3]
    const cnt = new Array(9).fill(0)
    for (const i of allIdx) cnt[i - base]++
    let extra = -1
    let ok = true
    for (let r = 0; r < 9; r++) {
      if (cnt[r] === need[r]) continue
      if (cnt[r] === need[r] + 1 && extra === -1) { extra = r; continue }
      ok = false; break
    }
    if (ok && extra !== -1) {
      if (base + extra === winIdx) yakumanList.push({ name: '纯正九莲宝灯', han: 13 })
      else yakumanList.push({ name: '九莲宝灯', han: 13 })
    }
  }

  // ---- 符数 ----
  const fuDetail = [{ name: '副底', fu: 20 }]
  let fu = 20
  const isPinfu = yaku.some((y) => y.name === '平和')
  if (!yakumanList.length) {
    // 刻子符
    for (const k of kotsuInfo) {
      const yao = isYaochu(k.idx)
      const f = k.concealed ? (yao ? 8 : 4) : (yao ? 4 : 2)
      fu += f
      fuDetail.push({ name: `${k.concealed ? '暗刻' : '明刻'} ${tileName(k.idx)}`, fu: f })
    }
    // 雀头符
    let pf = 0
    if (pair >= 31) pf = 2
    if (pair === roundWindIdx) pf += 2
    if (pair === seatWindIdx) pf += 2
    if (pf) { fu += pf; fuDetail.push({ name: `雀头 ${tileName(pair)}`, fu: pf }) }
    // 听牌形符
    if (waitFu) { fu += waitFu; fuDetail.push({ name: '听牌形（边/嵌/单骑）', fu: waitFu }) }
    // 门清荣和 / 自摸
    if (!hand.tsumo) { fu += 10; fuDetail.push({ name: '门前清荣和', fu: 10 }) }
    else if (!isPinfu) { fu += 2; fuDetail.push({ name: '自摸', fu: 2 }) }
    // 平和自摸固定 20 符；平和荣和 30 符
    if (isPinfu && hand.tsumo) { fu = 20; fuDetail.length = 1 }
    fu = Math.ceil(fu / 10) * 10
  }

  return { yaku, yakumanList, fu, fuDetail }
}

function tileName(idx) {
  const t = indexToTile(idx)
  if (t.suit === 'z') return ['東', '南', '西', '北', '白', '發', '中'][t.rank - 1]
  return `${t.rank}${{ m: '萬', p: '筒', s: '索' }[t.suit]}`
}

// 主入口：返回最高得点结果
function calcHand(hand) {
  const counts = toCounts(hand.tiles)
  const winIdx = tileToIndex(hand.winTile)
  const results = []

  // 国士
  if (isKokushi(counts)) {
    const thirteen = counts[winIdx] === 2
    results.push({
      yaku: [{ name: thirteen ? '国士无双十三面' : '国士无双', han: 13 }],
      han: 13, fu: 0, fuDetail: [], yakuman: true,
    })
  }
  // 七对子
  if (isChiitoi(counts)) {
    const yaku = [{ name: '七对子', han: 2 }]
    if (hand.riichi) yaku.unshift({ name: '立直', han: 1 })
    if (hand.ippatsu && hand.riichi) yaku.push({ name: '一发', han: 1 })
    if (hand.tsumo) yaku.push({ name: '门前清自摸和', han: 1 })
    const idxs = []
    for (let i = 0; i < 34; i++) if (counts[i]) idxs.push(i)
    if (idxs.every((i) => !isYaochu(i))) yaku.push({ name: '断幺九', han: 1 })
    const suits = new Set(idxs.filter((i) => i < 27).map((i) => Math.floor(i / 9)))
    const hasZ = idxs.some(isHonor)
    if (idxs.every(isHonor)) {
      results.push({ yaku: [{ name: '字一色', han: 13 }], han: 13, fu: 0, fuDetail: [], yakuman: true })
    } else {
      if (suits.size === 1 && hasZ) yaku.push({ name: '混一色', han: 3 })
      if (suits.size === 1 && !hasZ) yaku.push({ name: '清一色', han: 6 })
      if (idxs.every(isYaochu)) yaku.push({ name: '混老头', han: 2 })
      const dora = countDora(hand.tiles, hand.doraIndicators) + countRed(hand.tiles) +
        (hand.riichi ? countDora(hand.tiles, hand.uraIndicators) : 0)
      if (dora) yaku.push({ name: '宝牌', han: dora })
      const han = yaku.reduce((a, y) => a + y.han, 0)
      results.push({ yaku, han, fu: 25, fuDetail: [{ name: '七对子固定', fu: 25 }], yakuman: false })
    }
  }
  // 一般形
  for (const dec of decomposeAll(counts.slice())) {
    const r = evalDecomp(dec, hand, counts)
    if (r.yakumanList.length) {
      const han = r.yakumanList.reduce((a, y) => a + y.han, 0)
      results.push({ yaku: r.yakumanList, han, fu: 0, fuDetail: [], yakuman: true })
    } else {
      const yaku = r.yaku.slice()
      const dora = countDora(hand.tiles, hand.doraIndicators) + countRed(hand.tiles) +
        (hand.riichi ? countDora(hand.tiles, hand.uraIndicators) : 0)
      if (yaku.length && dora) yaku.push({ name: '宝牌', han: dora })
      const han = yaku.reduce((a, y) => a + y.han, 0)
      results.push({ yaku, han, fu: r.fu, fuDetail: r.fuDetail, yakuman: false })
    }
  }

  if (!results.length) return null // 未和牌
  // 取最高：先番后符（役满优先）
  results.sort((a, b) => (b.yakuman - a.yakuman) || (b.han - a.han) || (b.fu - a.fu))
  const bestValid = results.find((r) => r.yaku.length && (r.yakuman || r.yaku.some((y) => y.name !== '宝牌')))
  return bestValid || { ...results[0], noYaku: true }
}

return { calcHand }
  })(_deps)
  _deps.yaku = yaku

  // ==================== score.js ====================
  var score = (function (_deps) {
// 点数计算：符 x 番 -> 支付点数（含满贯以上封顶）

// 基本点 = fu * 2^(2+han)，上限 2000（满贯）
function basePoints(han, fu) {
  if (han >= 13) return 8000       // 役满
  if (han >= 11) return 6000       // 三倍满
  if (han >= 8) return 4000        // 倍满
  if (han >= 6) return 3000        // 跳满
  const base = fu * Math.pow(2, 2 + han)
  if (base > 2000 || han >= 5) return 2000 // 满贯（含切上满贯不采用，>2000 封顶）
  return base
}

function limitName(han, fu) {
  if (han >= 13) return '役满'
  if (han >= 11) return '三倍满'
  if (han >= 8) return '倍满'
  if (han >= 6) return '跳满'
  const base = fu * Math.pow(2, 2 + han)
  if (base > 2000 || han >= 5) return '满贯'
  return ''
}

const ceil100 = (x) => Math.ceil(x / 100) * 100

// 返回 { total, detail } detail 为字符串说明
function calcPayment(han, fu, { dealer, tsumo }) {
  const base = basePoints(han, fu)
  if (tsumo) {
    if (dealer) {
      const each = ceil100(base * 2)
      return { total: each * 3, detail: `${each} 点 x 3 家` }
    }
    const ko = ceil100(base)
    const oya = ceil100(base * 2)
    return { total: ko * 2 + oya, detail: `${ko} / ${oya}（闲家/庄家）` }
  }
  const total = ceil100(base * (dealer ? 6 : 4))
  return { total, detail: `荣和 ${total} 点` }
}

return { basePoints, limitName, calcPayment }
  })(_deps)
  _deps.score = score

  // ==================== ukeire.js ====================
  var ukeire = (function (_deps) {
// 进张（有效进张）计算 + 牌效综合评价
// 在「进张数量」之外，额外考虑：
//   1. 有效进张（有効進張）：按改善质量加权（和牌 > 听牌(听牌型) > 仅降向听），并乘宝牌系数
//   2. 手牌打点：宝牌（赤牌 + 指示牌派生）数量 + 役牌（场风/自风）
//   3. 场况：宝牌指示牌 doraIndicators + 场风 roundWind + 自风 seatWind（东场/南场等）

// 役牌（yakuhai）规则：
//   - 场风（东风场→東、南风场→南…）、自风（门风）牌作为役牌，进张/在手牌加权
//   - 三元牌（白發中）在真麻永远为役牌，本引擎已纳入（white=31 / 發=32 / 中=33）
//   - 若该风牌同时是场风与自风（庄家），权重再略增
//   - 未指定场风/自风时，三元牌仍按役牌加权（与真麻一致）
const { toCounts, indexToTile, tileToIndex } = _deps.tileCore
const { shanten } = _deps.shanten

// 赤ドラ（红五）始终为宝牌
const RED_DORA = new Set([4, 13, 22])

// 风牌 34 索引：東=27 南=28 西=29 北=30
const WIND_IDX = { east: 27, south: 28, west: 29, north: 30 }

// 宝牌指示牌 -> 宝牌牌的 34 索引
function doraIndexFromIndicator(ind) {
  if (ind.suit === 'z') return 27 + ((ind.rank % 7) + 1) - 1
  let r = ind.rank + 1
  if (r > 9) r = 1
  return { m: 0, p: 9, s: 18 }[ind.suit] + r - 1
}

function indicatorDoraSet(indicators) {
  const s = new Set()
  for (const ind of indicators || []) s.add(doraIndexFromIndicator(ind))
  return s
}

function isDora(tile, indSet) {
  if (tile.red) return true
  return indSet.has(tileToIndex(tile))
}

function countDora(tiles, indSet) {
  let n = 0
  for (const t of tiles) if (isDora(t, indSet)) n++
  return n
}

// 由场况构造役牌集合与风牌索引
// 役牌 = 场风 + 自风 + 三元牌(白發中，永远役牌)
const SANGEN_IDX = [31, 32, 33] // 白=31 發=32 中=33
function buildSituation(opts = {}) {
  const yakSet = new Set(SANGEN_IDX) // 三元牌始终为役牌
  const rw = opts.roundWind
  const sw = opts.seatWind
  const roundIdx = rw && WIND_IDX[rw] != null ? WIND_IDX[rw] : -1
  const seatIdx = sw && WIND_IDX[sw] != null ? WIND_IDX[sw] : -1
  if (roundIdx >= 0) yakSet.add(roundIdx)
  if (seatIdx >= 0) yakSet.add(seatIdx)
  const hasYakuhai = yakSet.size > 0
  return { yakSet, hasYakuhai, roundIdx, seatIdx }
}

// 听牌型的等待质量（用于有效进张加权）
function waitSet(counts14) {
  const waits = []
  for (let j = 0; j < 34; j++) {
    if (counts14[j] >= 4) continue
    const c = counts14.slice()
    c[j]++
    let ok = false
    for (let i = 0; i < 34 && !ok; i++) {
      if (c[i] > 0) {
        c[i]--
        if (shanten(c) === -1) ok = true
        c[i]++
      }
    }
    if (ok) waits.push(j)
  }
  return waits
}

function hasRun(counts, suit, r1, r2) {
  return counts[suit * 9 + r1 - 1] > 0 && counts[suit * 9 + r2 - 1] > 0
}

function waitQuality(counts14) {
  const waits = waitSet(counts14)
  if (waits.length === 0) return 1.0
  if (waits.length === 1) {
    const w = waits[0]
    if (counts14[w] >= 2) return 0.5 // 单骑
    if (w < 27) {
      const suit = Math.floor(w / 9)
      const r = (w % 9) + 1
      // 边张（12等3 / 89等7）
      if ((r >= 3 && hasRun(counts14, suit, r - 2, r - 1)) ||
          (r <= 7 && hasRun(counts14, suit, r + 1, r + 2))) {
        return 0.8
      }
    }
    return 0.7 // 嵌张
  }
  // 双碰：两个等待都是对子
  if (counts14[waits[0]] >= 2 && counts14[waits[1]] >= 2) return 0.85
  return 1.0 // 两面
}

// 13 张手牌的进张与综合评价
// indSet: 指示牌派生的宝牌索引集合（赤牌已内置）
// opts: { lite?, roundWind?, seatWind? }
// 返回 { shanten, ukeire:[{idx,count,shanten,dora,yakuhai,contrib}], total, effective, doraTiles, yakuhaiTiles }
function ukeire(counts13, indSet, opts = {}) {
  const base = shanten(counts13)
  const sit = buildSituation(opts)
  const list = []
  let total = 0
  let effective = 0
  let doraTiles = 0
  let yakuhaiTiles = 0
  for (let i = 0; i < 34; i++) {
    if (counts13[i] >= 4) continue
    const c = counts13.slice()
    c[i]++
    const s = shanten(c)
    if (s < base) {
      const left = 4 - counts13[i]
      const tile = indexToTile(i)
      const isD = isDora(tile, indSet) || RED_DORA.has(i)
      // 进张加权：宝牌 > 场风/自风役牌（双风再增）> 普通
      let mul = 1.0
      if (isD) mul = 1.6
      else if (sit.hasYakuhai && sit.yakSet.has(i)) {
        mul = i === sit.roundIdx && i === sit.seatIdx ? 1.4 : 1.3
      }
      const yakh = sit.hasYakuhai && sit.yakSet.has(i) ? 1 : 0
      let w
      if (s === -1) w = 2.5 // 和牌
      else if (s === 0) w = (opts.lite ? 1.4 : waitQuality(c)) * 1.4 // 听牌
      else w = 1.0
      const contrib = left * w * mul
      list.push({ idx: i, count: left, shanten: s, dora: isD, yakuhai: yakh, contrib })
      total += left
      effective += contrib
      if (isD) doraTiles += left
      if (yakh) yakuhaiTiles += left
    }
  }
  return { shanten: base, ukeire: list, total, effective, doraTiles, yakuhaiTiles }
}

function removeOneTile(tiles, idx) {
  for (let k = 0; k < tiles.length; k++) {
    if (tileToIndex(tiles[k]) === idx) {
      return tiles.slice(0, k).concat(tiles.slice(k + 1))
    }
  }
  return tiles
}

// 对 14 张手牌，评估每一种（去重）打牌
function evaluateDiscards(tiles14, indSet = new Set(), opts = {}) {
  const all = toCounts(tiles14)
  const sit = buildSituation(opts)
  const seen = new Set()
  const results = []
  for (let i = 0; i < 34; i++) {
    if (all[i] === 0 || seen.has(i)) continue
    seen.add(i)
    const c = all.slice()
    c[i]--
    const u = ukeire(c, indSet, opts)
    const hand13 = removeOneTile(tiles14, i)
    const doraCount = countDora(hand13, indSet)
    // 役牌（场风/自风）在手牌中的枚数：成对/成刻潜力 → 打点代理
    const yakuhaiCount = sit.hasYakuhai
      ? hand13.filter((t) => sit.yakSet.has(tileToIndex(t))).length
      : 0
    // 打点代理：手牌宝牌 + 进张中宝牌半数 + 役牌在手 + 进张中役牌少量
    const valueScore =
      doraCount + u.doraTiles * 0.5 + yakuhaiCount * 0.6 + u.yakuhaiTiles * 0.3
    // 综合评价：速度(有效进张) 为主，打点(宝牌+役牌) 为次
    const ev = u.effective + 0.5 * valueScore
    results.push({
      discardIndex: i,
      discardTile: indexToTile(i),
      shantenAfter: u.shanten,
      ukeireTiles: u.ukeire,
      ukeireTotal: u.total,
      effective: u.effective,
      doraCount,
      doraUkeire: u.doraTiles,
      yakuhaiCount,
      yakuhaiTiles: u.yakuhaiTiles,
      valueScore,
      ev,
      tenpai: u.shanten === 0,
      goodShape: u.shanten === 0 && u.total > 4,
    })
  }
  // 严格分层排序（字典序），优先级由高到低：
  //   1) 向听数最低  2) 进张张数最多  3) 好型优先  4) 宝牌+役牌最多
  //   5) 有效进张最多（仅当前四层全并列时的平手规则）
  results.sort(
    (a, b) =>
      a.shantenAfter - b.shantenAfter ||
      b.ukeireTotal - a.ukeireTotal ||
      (b.goodShape ? 1 : 0) - (a.goodShape ? 1 : 0) ||
      (b.doraCount + b.yakuhaiCount) - (a.doraCount + a.yakuhaiCount) ||
      b.effective - a.effective ||
      a.discardIndex - b.discardIndex
  )
  // 推荐打牌 = 字典序最优（并列者都标 isBest；何切无唯一「正解」）
  const top = results[0]
  for (const r of results) {
    r.isBest =
      r.shantenAfter === top.shantenAfter &&
      r.ukeireTotal === top.ukeireTotal &&
      r.goodShape === top.goodShape &&
      r.doraCount + r.yakuhaiCount === top.doraCount + top.yakuhaiCount &&
      r.effective === top.effective
  }
  return results
}

return {
  doraIndexFromIndicator,
  indicatorDoraSet,
  isDora,
  countDora,
  ukeire,
  evaluateDiscards,
}
  })(_deps)
  _deps.ukeire = ukeire

  // ==================== point-est.js ====================
  var pointEst = (function (_deps) {
// 何切评估引擎（移植自 Xpilot 思路，适配本小程序 34 数组牌模型）
// 产出：每个候选切牌的 期待打点(evIndex) / 好型率(goodShapeRate) / 总进张(totalCount)
//      / 进张逐张明细(improvements) / 进张好型着色(improvementsQuality)
// 设计说明：
//  - 好型率递归、EV 折现框架沿用 Xpilot；
//  - 役判定改为 34 数组版 identifyYaku34（复用 agari.decomposeAll，dora 按指示牌精确算），
//    替换 Xpilot 的 identifyYaku（其 34 数组层赤牌信息已丢失，仅能粗估 dora）；
//  - 原 Xpilot 16 巡递归节点语义含糊，重写为清晰的 evNode13/evTenpai（向听深度折现的期望和牌点数）。

const { shanten } = _deps.shanten
const { decomposeAll, isChiitoi, isKokushi } = _deps.agari
const { tileToIndex, isYaochu } = _deps.tileCore

// ---------- 牌编码工具 ----------
const TYPE_ORDER = { m: 0, p: 1, s: 2, z: 3 }
const numVal = (t) => (t[0] === '0' ? 5 : parseInt(t[0], 10))
const convertToTiles34Arr = (tiles) => {
  const arr = new Array(34).fill(0)
  for (const t of tiles) arr[TYPE_ORDER[t[t.length - 1]] * 9 + numVal(t) - 1]++
  return arr
}
const getTileIndex = (tile) => {
  const type = TYPE_ORDER[tile[tile.length - 1]]
  const num = numVal(tile)
  return type * 9 + num - 1
}
const indexToTile = (i) => (i % 9 + 1) + ['m', 'p', 's', 'z'][Math.floor(i / 9)]
const calcShanten = (c) => shanten(c)
const calcShantenCached = (c, cache) => {
  const key = c.join(',')
  const v = cache.get(key)
  if (v !== undefined) return v
  const r = calcShanten(c)
  cache.set(key, r)
  return r
}
const remainingCounts34 = (hand34, rem34) => {
  const r = new Array(34).fill(0)
  for (let i = 0; i < 34; i++) r[i] = Math.max(0, rem34[i] - hand34[i])
  return r
}

// ---------- 宝牌 ----------
function doraNext(idx) {
  if (idx < 27) {
    const s = Math.floor(idx / 9) * 9
    return s + ((idx - s + 1) % 9)
  }
  if (idx < 31) return 27 + ((idx - 27 + 1) % 4)
  return 31 + ((idx - 31 + 1) % 3)
}
function doraCount34(counts, doraIdx) {
  let n = 0
  for (const d of doraIdx) n += counts[d] || 0
  return n
}

// ---------- 役判定（34 数组版，门清范围） ----------
// counts：被评价的完整手牌（含和牌张），用于牌构成类役；dec：面子结构，用于组合类役
function calcHan(dec, counts, opt, winIdx) {
  const { roundWindIdx, seatWindIdx, doraIdx } = opt
  const { pair, melds } = dec
  let han = 0
  const shuntsu = melds.filter((m) => m.type === 'shuntsu')
  const kotsu = melds.filter((m) => m.type === 'kotsu' || m.type === 'kantsu')
  // 牌构成按真实手牌展开（听牌手 13 张 + 和牌张），避免遗漏未完成面子里的牌
  const allIdx = []
  for (let i = 0; i < 34; i++) for (let n = 0; n < (counts[i] || 0); n++) allIdx.push(i)
  // 断幺九
  if (allIdx.every((i) => !isYaochu(i))) han += 1
  // 役牌
  for (const k of kotsu) {
    if (k.idx === 31) han += 1
    else if (k.idx === 32) han += 1
    else if (k.idx === 33) han += 1
    if (k.idx === roundWindIdx) han += 1
    else if (k.idx === seatWindIdx) han += 1
  }
  // 平和（全顺子 + 雀头非役牌 + 两面听）：复用 waitKindOf，保证与好型判定口径一致
  const pairIsYakuhai = pair === roundWindIdx || pair === seatWindIdx || pair >= 31
  const ryanmen = winIdx != null && waitKindOf(dec, winIdx) === 'ryanmen'
  if (shuntsu.length === 4 && !pairIsYakuhai && ryanmen) han += 1
  // 一杯口 / 二杯口
  const shuntsuKeys = shuntsu.map((s) => s.idx)
  const seen = {}
  let dup = 0
  for (const k of shuntsuKeys) seen[k] = (seen[k] || 0) + 1
  for (const k in seen) dup += Math.floor(seen[k] / 2)
  if (dup === 2) han += 3
  else if (dup === 1) han += 1
  // 三色同顺
  for (let r = 0; r <= 6; r++) {
    if ([r, r + 9, r + 18].every((k) => shuntsuKeys.includes(k))) { han += 2; break }
  }
  // 一气通贯
  for (const base of [0, 9, 18]) {
    if ([base, base + 3, base + 6].every((k) => shuntsuKeys.includes(k))) { han += 2; break }
  }
  // 三元牌 / 风牌的大役（役牌本身已在上面按刻子计）
  const dragonKotsu = kotsu.filter((k) => k.idx >= 31).length
  const windKotsu = kotsu.filter((k) => k.idx >= 27 && k.idx <= 30).length
  if (dragonKotsu === 3) han += 13                                   // 大三元
  else if (dragonKotsu === 2 && pair >= 31) han += 2                 // 小三元
  if (windKotsu === 4) han += 13                                     // 大四喜
  else if (windKotsu === 3 && pair >= 27 && pair <= 30) han += 13    // 小四喜
  // 对对和（含杠子）
  if (kotsu.length === 4) han += 2
  // 三暗刻 / 四暗刻：荣和补成的刻子按明刻计，因此「非本次和牌张」的刻子才算暗刻
  const concealed = kotsu.filter((k) => !(winIdx != null && k.idx === winIdx)).length
  if (kotsu.length === 4 && concealed === 4) han += 13               // 四暗刻（自摸 / 单骑和）
  else if (concealed === 3) han += 2                                 // 三暗刻
  // 混全带幺九 / 纯全带幺九
  const allSetsYaochu = melds.every((m) =>
    m.type === 'kotsu' ? isYaochu(m.idx) : (m.idx % 9 === 0 || m.idx % 9 === 6)
  ) && isYaochu(pair)
  if (allSetsYaochu) {
    const anyHonor = allIdx.some((i) => i >= 27)
    if (!anyHonor && shuntsu.length > 0) han += 3
    else if (anyHonor && shuntsu.length > 0) han += 2
  }
  // 混老头 / 清老头 / 字一色
  if (allIdx.every(isYaochu) && shuntsu.length === 0) {
    if (allIdx.every((i) => i >= 27)) han += 13                      // 字一色
    else if (allIdx.every((i) => i < 27)) han += 13                  // 清老头
    else han += 2                                                    // 混老头
  }
  // 混一色 / 清一色（门清：混一色 2 番，清一色 6 番）
  const suitSet = new Set(allIdx.filter((i) => i < 27).map((i) => Math.floor(i / 9)))
  if (suitSet.size === 1) {
    if (allIdx.some((i) => i >= 27)) han += 2                        // 混一色
    else han += 6                                                    // 清一色
  }
  // 宝牌（按指示牌精确算，含赤牌合并）
  han += doraCount34(counts, doraIdx)
  return han
}

// 缓存：同一手牌 + 同一场况的役/符判定结果，避免递归评估中重复计算（设上限防内存膨胀）
const _yakuCache = new Map()
// forcedWinIdx：已知真实和牌张时传入（避免把同一完成形按最有利的解释计役，如双碰和当成单骑去认四暗刻）
function identifyYaku34(hand34, opt, forcedWinIdx) {
  const full = hand34.slice()
  if (isChiitoi(full)) return { han: 2 + doraCount34(full, opt.doraIdx), fu: 25 }
  if (isKokushi(full)) return { han: 13, fu: 25 }
  const key = full.join(',') + '|' + opt.roundWindIdx + '|' + opt.seatWindIdx +
    '|' + (opt.isRiichi ? 1 : 0) + '|' + (opt.doraIdx || []).join(',') +
    '|' + (forcedWinIdx == null ? '*' : forcedWinIdx)
  const cached = _yakuCache.get(key)
  if (cached) return cached
  let bestHan = 0
  let bestFu = 20
  let bestPts = 0
  // 以「实际点数最高」挑选役解释：番数高不一定点数高（满贯封顶 / 符数差异），必须比点数
  const consider = (dec, winIdx) => {
    const fu = calcFuWithWin(dec, opt, winIdx)
    let han = calcHan(dec, full, opt, winIdx)
    if (opt.isRiichi) han += 1 // 立直是行为役，牌型里不含，需显式加
      const pts = pointsFromHanFu(han, fu)
    if (pts > bestPts) { bestPts = pts; bestHan = han; bestFu = fu }
  }
  const freeOnly = forcedWinIdx == null
  const decomps = decomposeAll(full)
  if (decomps.length === 0) {
    // 14 张听牌手：枚举和牌张，对 13 张主体分解后分别判役 / 算符
    const c13 = full.slice()
    for (let i = 0; i < 34; i++) {
      if (c13[i] <= 0) continue
      if (!freeOnly && i !== forcedWinIdx) continue
      c13[i]--
      for (const dec of decomposeAll(c13)) consider(dec, i)
      c13[i]++
    }
  } else {
    // 完整和牌形：对每个分解枚举和牌张候选（顺子两端 / 刻子任一张 / 雀头）
    for (const dec of decomps) {
      const cands = []
      for (const m of dec.melds) {
        if (m.type === 'shuntsu') cands.push(m.idx, m.idx + 2)
        else cands.push(m.idx)
      }
      cands.push(dec.pair)
      for (const c of cands) {
        if (!freeOnly && c !== forcedWinIdx) continue
        consider(dec, c)
      }
    }
  }
  const res = { han: bestHan, fu: bestFu }
  if (_yakuCache.size > 8000) _yakuCache.clear()
  _yakuCache.set(key, res)
  return res
}

// ---------- 好型判定 / 好型率 ----------
// 听型分类：判断某个和牌张 winIdx 在某个分解里扮演的角色
// 好型 = 两面 / 双碰；恶型 = 嵌张 / 边张 / 单骑
const waitKindOf = (dec, winIdx) => {
  if (dec.pair === winIdx) return 'tanki'
  for (const m of dec.melds) {
    if (m.type === 'shuntsu') {
      const lo = m.idx
      if (winIdx < lo || winIdx > lo + 2) continue
      if (winIdx === lo + 1) return 'kanchan'
      if (winIdx === lo) return lo % 9 === 6 ? 'penchan' : 'ryanmen'
      return lo % 9 === 0 ? 'penchan' : 'ryanmen'
    }
    if (m.idx === winIdx) return 'shanpon'
  }
  return null
}

// 13 张听牌手：是否存在「两面 / 双碰」的和牌张（任一和牌张的任一分解成立即可）
const tenpaiIsGood13 = (h13) => {
  for (let w = 0; w < 34; w++) {
    if (h13[w] >= 4) continue
    h13[w]++
    let good = false
    if (calcShanten(h13) === -1) {
      const decs = decomposeAll(h13)
      for (let d = 0; d < decs.length; d++) {
        const k = waitKindOf(decs[d], w)
        if (k === 'ryanmen' || k === 'shanpon') { good = true; break }
      }
    }
    h13[w]--
    if (good) return true
  }
  return false
}

const isGoodShapeTenpai34 = (hand34, rem34) => {
  const total = hand34.reduce((a, b) => a + b, 0)
  if (total % 3 === 2) {
    // 14 张听牌手：枚举切哪一张后仍是听牌，再按 13 张主体判好型
    for (let i = 0; i < 34; i++) {
      if (hand34[i] <= 0) continue
      hand34[i]--
      const ok = calcShanten(hand34) === 0 && tenpaiIsGood13(hand34)
      hand34[i]++
      if (ok) return true
    }
    return false
  }
  return tenpaiIsGood13(hand34)
}

// 好型率（递归）：有效进张中，最终导向好型听牌的期望占比。
// 以「有效进张张数」为权重求加权平均，避免分母用全部剩余牌导致数值被稀释。
const MAX_GOOD_SHAPE_DEPTH = 3
const calculateGoodShapeRate34 = (hand34, rem34, targetShanten, goodShapeCache, shantenCache, depth = MAX_GOOD_SHAPE_DEPTH) => {
  const cacheKey = hand34.join(',') + '|' + rem34.join(',') + '|' + targetShanten + '|' + depth
  const cached = goodShapeCache.get(cacheKey)
  if (cached !== undefined) return cached
  const S = calcShantenCached(hand34, shantenCache)
  // 已听牌：直接判好型（1 或 0）
  if (S === 0) {
    const v = isGoodShapeTenpai34(hand34, rem34) ? 1 : 0
    goodShapeCache.set(cacheKey, v)
    return v
  }
  if (S >= targetShanten && depth <= 0) {
    goodShapeCache.set(cacheKey, 0)
    return 0
  }
  // good = Σ(进张张数 × 该进张最终好型概率)；eff = 有效进张总数；rate = good / eff
  let good = 0
  let eff = 0
  for (let i = 0; i < 34; i++) {
    if (rem34[i] <= 0) continue
    hand34[i]++
    const nS = calcShantenCached(hand34, shantenCache)
    if (nS < S) {
      const w = rem34[i]
      eff += w
      let p
      if (nS === 0) {
        p = isGoodShapeTenpai34(hand34, rem34) ? 1 : 0
      } else if (depth >= 2) {
        p = calculateGoodShapeRate34(
          hand34, remainingCounts34(hand34, rem34), nS, goodShapeCache, shantenCache, depth - 1
        )
      } else {
        p = 0 // 深度用尽仍未听牌，按未知保守计 0
      }
      good += w * p
    }
    hand34[i]--
  }
  const rate = eff > 0 ? good / eff : 0
  goodShapeCache.set(cacheKey, rate)
  return rate
}

// ---------- 期望点数估计（Xpilot 风格平滑 + 固定点数） ----------
const WINNING_RATE_DECAY = 0.5
// ---------- 符数计算（门清场景：无副露，暗刻/暗杠/雀头役牌/听牌型） ----------
// 符数必须绑定「具体和牌张」计算：荣和补成的刻子按明刻计，待ち符只看这一次和牌的听型。
// 口径：门清荣和 = 底符 20 + 门前荣和 10 + 面子符 + 雀头符 + 待ち符，最后进位到 10 符。
function calcFuWithWin(dec, opt, winIdx) {
  const { roundWindIdx, seatWindIdx } = opt
  const { pair, melds } = dec
  let fu = 20 // 底符
  let waitFu = 0 // 待ち符：嵌张 / 边张 / 单骑 +2
  if (winIdx != null && winIdx === pair) waitFu = 2 // 单骑听
  // 雀头：役牌 / 场风 / 自风；连风 +4
  if (pair >= 31) fu += 2
  else if (pair === roundWindIdx || pair === seatWindIdx) fu += 2
  if (pair === roundWindIdx && pair === seatWindIdx) fu += 2
  for (const m of melds) {
    if (m.type === 'shuntsu') {
      if (winIdx == null) continue
      const lo = m.idx
      if (winIdx === lo + 1) waitFu = 2 // 嵌张
      else if (winIdx === lo && lo % 9 === 6) waitFu = 2 // 89 待 7（边张）
      else if (winIdx === lo + 2 && lo % 9 === 0) waitFu = 2 // 12 待 3（边张）
      continue // 顺子不计符
    }
    const isYao = isYaochu(m.idx)
    const open = winIdx != null && m.idx === winIdx // 荣和补成的刻子 → 明刻扱い
    if (m.type === 'kotsu') fu += open ? (isYao ? 4 : 2) : (isYao ? 8 : 4)
    else fu += open ? (isYao ? 16 : 8) : (isYao ? 32 : 16) // 杠子
  }
  fu += 10 // 门前清荣和 +10 符
  fu += waitFu
  return Math.ceil(fu / 10) * 10
}

// ---------- 标准点数表（符×番 → 闲家荣和点数 = 4×基本点，进位到 100） ----------
function pointsFromHanFu(han, fu) {
  if (han <= 0) return 0
  let a // 基本点 = 符 × 2^(番+2)
  if (han >= 13) a = 8000 // 役满
  else if (han >= 11) a = 6000 // 三倍满
  else if (han >= 8) a = 4000 // 倍满
  else if (han >= 6) a = 3000 // 跳满
  else if (han >= 5) a = 2000 // 满贯（只看番）
  else {
    a = fu * Math.pow(2, han + 2)
    if (a > 2000) a = 2000 // 满贯封顶，符数不再影响
    a = Math.ceil(a / 10) * 10
  }
  const ron = Math.ceil((4 * a) / 100) * 100
  return ron
}

// 听牌手的期望和牌点数估计：按听牌张加权（点数表），立直额外 +1 番
const ScientificScoreEstimator = {
  // 该手牌（14 张含和牌张）在荣和口径下的点数；立直已计入 identifyYaku34
  // winIdx 已知时务必传入，避免把完成形按最有利的解释计役
  estimate(hand34, opt, winIdx) {
    const res = identifyYaku34(hand34, opt, winIdx)
    if (res.han <= 0) return 0
    return pointsFromHanFu(res.han, res.fu)
  },
}

// 听牌 13 张手的期望和牌点数（按听牌张加权，乘和牌率折扣）
function evTenpai(hand34_13, rem34, opt, cache) {
  let total = 0
  let cnt = 0
  for (let k = 0; k < 34; k++) {
    if (rem34[k] <= 0) continue
    hand34_13[k]++
    if (calcShantenCached(hand34_13, cache.shantenCache) === -1) {
      // 传入真实和牌张 k：同一完成形可能有多种和法，必须按这一次实际和的那张计役 / 算符
      const p = ScientificScoreEstimator.estimate(hand34_13, opt, k)
      total += rem34[k] * p
      cnt += rem34[k]
    }
    hand34_13[k]--
  }
  if (cnt === 0) return 0
  return (total / cnt) * WINNING_RATE_DECAY
}

// 13 张未听手面的期望和牌点数（向听深度递归，depth 控制前瞻巡数）
function evNode13(hand34, rem34, depth, opt, cache) {
  const key = JSON.stringify([hand34, rem34, depth])
  const memo = cache.nodeMemo
  if (memo.has(key)) return memo.get(key)
  const S = calcShantenCached(hand34, cache.shantenCache)
  let r
  if (S < 0) {
    r = ScientificScoreEstimator.estimate(hand34, opt)
  } else if (S === 0) {
    r = evTenpai(hand34, rem34, opt, cache)
  } else if (depth <= 0) {
    r = 0
  } else {
    let total = 0
    let cnt = 0
    for (let i = 0; i < 34; i++) {
      if (rem34[i] <= 0) continue
      hand34[i]++
      const S2 = calcShantenCached(hand34, cache.shantenCache)
      if (S2 < S) {
        let best = 0
        for (let j = 0; j < 34; j++) {
          if (hand34[j] <= 0) continue
          hand34[j]--
          const remAfter = rem34.slice()
          remAfter[i]--
          const child = evNode13(hand34, remAfter, depth - 1, opt, cache)
          if (child > best) best = child
          hand34[j]++
        }
        total += rem34[i] * best
        cnt += rem34[i]
      }
      hand34[i]--
    }
    r = cnt > 0 ? total / cnt : 0
  }
  memo.set(key, r)
  return r
}

// ---------- 主入口：对每个候选切牌评估 ----------
function evaluateHand(hand14, remMap, options) {
  const cache = {
    shantenCache: new Map(),
    goodShapeCache: new Map(),
    nodeMemo: new Map(),
  }
  const opt = (options && options.opt) || { roundWindIdx: 27, seatWindIdx: 27, doraIdx: [], isRiichi: false }
  const current34 = convertToTiles34Arr(hand14)
  const currentShanten = calcShanten(current34)
  const rem34 = new Array(34).fill(0)
  for (const [k, v] of Object.entries(remMap)) rem34[getTileIndex(k)] += v
  const results = {}
  const maxDepth = currentShanten <= 0 ? 1 : (options && options.evDepth != null ? Math.min(options.evDepth, currentShanten) : Math.min(2, currentShanten))
  const gsd = (options && options.goodShapeDepth != null) ? options.goodShapeDepth : MAX_GOOD_SHAPE_DEPTH

  hand14.forEach((tileToDiscard) => {
    if (results[tileToDiscard]) return // 同牌只算一次
    const di = hand14.indexOf(tileToDiscard)
    const newHand = hand14.slice()
    newHand.splice(di, 1) // 只移除一张该牌（手牌有重复牌时不能全删）
    const new34 = convertToTiles34Arr(newHand)
    const rem = remainingCounts34(new34, rem34)
    const shantenAfterDiscard = calcShantenCached(new34, cache.shantenCache)

    const improvements = {}
    const improvementsQuality = {}
    let totalCount = 0
    let shantenImproved = false
    for (let i = 0; i < 34; i++) {
      if (rem34[i] <= 0) continue
      new34[i]++
      const newShanten = calcShantenCached(new34, cache.shantenCache)
      if (newShanten < shantenAfterDiscard) {
        let key
        if (i === 4 && remMap['0m'] > 0) {
          improvements['0m'] = remMap['0m']
          if (rem34[i] > remMap['0m']) improvements['5m'] = rem34[i] - remMap['0m']
          key = '0m'
        } else if (i === 13 && remMap['0p'] > 0) {
          improvements['0p'] = remMap['0p']
          if (rem34[i] > remMap['0p']) improvements['5p'] = rem34[i] - remMap['0p']
          key = '0p'
        } else if (i === 22 && remMap['0s'] > 0) {
          improvements['0s'] = remMap['0s']
          if (rem34[i] > remMap['0s']) improvements['5s'] = rem34[i] - remMap['0s']
          key = '0s'
        } else {
          key = indexToTile(i)
          improvements[key] = rem34[i]
        }
        totalCount += rem34[i]
        shantenImproved = true
        if (shantenAfterDiscard === 1 && newShanten === 0) {
          improvementsQuality[key] = isGoodShapeTenpai34(new34, rem34)
        }
      }
      new34[i]--
    }

    let evIndex = 0
    if (shantenImproved) {
      const ev = evNode13(new34, rem34, maxDepth, opt, cache)
      evIndex = Math.floor(ev * 10)
    }
    const goodShapeRate = shantenImproved
      ? calculateGoodShapeRate34(new34, rem34.slice(), shantenAfterDiscard, cache.goodShapeCache, cache.shantenCache, gsd)
      : 0

    results[tileToDiscard] = { improvements, totalCount, goodShapeRate, evIndex, improvementsQuality }
  })
  return results
}

// 指示牌兼容两种写法：字符串 '4m' / '0m'（赤5），或对象 { suit:'m', rank:4, red?:true }
const toTileObj = (t) => {
  if (t == null) return null
  if (typeof t === 'string') {
    const m = /^([0-9])([mpsz])$/.exec(t)
    if (!m) return null
    return { suit: m[2], rank: m[1] === '0' ? 5 : +m[1], red: m[1] === '0' }
  }
  if (typeof t === 'number') return { suit: ['m', 'p', 's', 'z'][Math.floor(t / 9)], rank: (t % 9) + 1 }
  return t
}
// 由 sit 构造评估用 opt（dora 指示牌含表宝，立直时含里宝）
function buildOpt(sit) {
  const doraIndicators = sit && sit.doraIndicators ? sit.doraIndicators : []
  const uraIndicators = sit && sit.uraIndicators ? sit.uraIndicators : []
  const doraTiles = doraIndicators.concat(sit && sit.riichi ? uraIndicators : [])
  const doraIdx = doraTiles
    .map((t) => {
      const o = toTileObj(t)
      return o && o.suit != null && o.rank != null ? doraNext(tileToIndex(o)) : null
    })
    .filter((v) => v != null)
  // 风牌字符串规范化：兼容英文(east/south...)与中文(東南西北)，也接受已转换的 1-4 序号或 27-30 索引
  const WIND_ORDER = { east: 1, south: 2, west: 3, north: 4 }
  const WIND_CN = { 東: 'east', 南: 'south', 西: 'west', 北: 'north' }
  const windToIdx = (w) => {
    if (w == null) return 27
    if (typeof w === 'number') return w >= 27 ? w : 27 + (w - 1)
    const key = (WIND_CN[w] || WIND_ORDER[w.toLowerCase()] ? w.toLowerCase() : null) || 'east'
    const order = WIND_ORDER[WIND_CN[key] || key] || 1
    return 27 + order - 1
  }
  const roundWindIdx = windToIdx(sit && sit.roundWind)
  const seatWindIdx = windToIdx(sit && sit.seatWind)
  return { roundWindIdx, seatWindIdx, doraIdx, isRiichi: !!(sit && sit.riichi) }
}

return {
  evaluateHand,
  buildOpt,
  isGoodShapeTenpai34,
  identifyYaku34,
  estimate: (h, opt, winIdx) => ScientificScoreEstimator.estimate(h, opt, winIdx),
}
  })(_deps)
  _deps.pointEst = pointEst

  // ==================== generator.js ====================
  var generator = (function (_deps) {
// 出题与手牌生成：算符算番、何切练习
//
// 最底层约束（立直麻将规则）：一副牌共 136 张，每一种牌（含赤5）最多 4 张。
// 因此任何「同时可见」的牌——手牌 + 摸进牌 + 表宝指示牌 + 里宝指示牌——
// 都必须从「同一副 136 张」中抽取，且彼此剔除。这样任一类牌的总数天然 ≤ 4，
// 既不会出现 5 张红中，也不会出现「指示牌 2 张南 + 手牌 3 张南」这类不可能局面。
const { buildWall, shuffle, toCounts, tileToIndex, indexToTile } = _deps.tileCore
const { shanten } = _deps.shanten
const { evaluateDiscards, indicatorDoraSet } = _deps.ukeire
const { calcHand } = _deps.yaku
const { calcPayment } = _deps.score

const WINDS = ['east', 'south', 'west', 'north']
const randInt = (n) => Math.floor(Math.random() * n)

// 从牌山中剔除 used[i] 张第 i 类牌，返回剩余牌（用同一索引口径，赤5 与普5 同计）
function removeCounts(wall, used) {
  const need = used.slice()
  return wall.filter((t) => {
    const i = tileToIndex(t)
    if (need[i] > 0) { need[i]--; return false }
    return true
  })
}

// 宝牌指示牌数量：60% = 1 张，30% = 2 张，10% = 3 张（表、里数量一致）
function doraCount() {
  const r = Math.random()
  return r < 0.6 ? 1 : r < 0.9 ? 2 : 3
}

// 从同一副（已剔除手牌的）牌山抽 n 张表宝 + n 张里宝；与被剔除的手牌互不重复
function drawIndicators(pool, n) {
  const sh = shuffle(pool)
  return {
    doraIndicators: sh.slice(0, n),
    uraIndicators: sh.slice(n, 2 * n),
  }
}

// 随机生成一副和牌（4 面子 + 1 雀头，保证 14 张可和，且每类牌 ≤ 4）
function buildWinningCounts() {
  for (let attempt = 0; attempt < 300; attempt++) {
    const c = new Array(34).fill(0)
    let ok = true
    for (let m = 0; m < 4; m++) {
      if (Math.random() < 0.45) {
        const sBase = [0, 9, 18][randInt(3)]
        const r = randInt(7)                       // 0..6 -> rank 1..7
        const a = sBase + r, b = a + 1, d = a + 2
        if (c[a] >= 4 || c[b] >= 4 || c[d] >= 4) { ok = false; break }
        c[a]++; c[b]++; c[d]++
      } else {
        const idx = randInt(34)
        if (c[idx] + 3 > 4) { ok = false; break }   // 刻子：+3 后不得超 4
        c[idx] += 3
      }
    }
    if (!ok) continue
    const pairCandidates = []
    for (let i = 0; i < 34; i++) if (c[i] <= 2) pairCandidates.push(i)  // 雀头：+2 后不得超 4
    if (!pairCandidates.length) continue
    const p = pairCandidates[randInt(pairCandidates.length)]
    c[p] += 2
    if (c.reduce((a, b) => a + b, 0) !== 14) continue
    if (c.some((x) => x > 4)) continue            // 双保险：任何一类不得超 4
    return c
  }
  // 兜底：固定一手 14 张、每类 ≤ 4 的可和牌型
  const c = new Array(34).fill(0)
  ;[0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 18, 19].forEach((i) => c[i]++)
  c[19]++
  return c
}

function countsToTiles(c) {
  const tiles = []
  for (let i = 0; i < 34; i++) for (let k = 0; k < c[i]; k++) tiles.push(indexToTile(i))
  return tiles
}

// 算符算番：生成随机和牌型 + 答案；指示牌从「剔除手牌后」的牌山抽取
function generateFuhan() {
  const counts = buildWinningCounts()
  const handTiles = countsToTiles(counts)
  const pool = removeCounts(buildWall(true), toCounts(handTiles))  // 136 - 14 = 122 张
  const n = doraCount()
  const { doraIndicators, uraIndicators } = drawIndicators(pool, n)
  const roundWindName = WINDS[randInt(2)]            // 东场 / 南场
  const seatWindName = WINDS[randInt(4)]
  const winTile = handTiles[randInt(handTiles.length)]
  const tsumo = Math.random() < 0.5
  const riichi = Math.random() < 0.7
  const ippatsu = riichi && Math.random() < 0.3
  const hand = {
    tiles: handTiles,
    winTile,
    tsumo,
    riichi,
    ippatsu,
    roundWind: roundWindName === 'east' ? 1 : roundWindName === 'south' ? 2 : roundWindName === 'west' ? 3 : 4,
    seatWind: WINDS.indexOf(seatWindName) + 1,
    doraIndicators,
    uraIndicators,
  }
  let res = calcHand(hand)
  if (!res || res.noYaku) {                       // 确保有役
    hand.riichi = true
    res = calcHand(hand)
  }
  const dealer = Math.random() < 0.5
  const pay = calcPayment(res.han, res.fu, { dealer, tsumo })
  return {
    hand,
    sit: { roundWind: roundWindName, seatWind: seatWindName, doraIndicators, uraIndicators },
    answer: {
      yaku: res.yaku, han: res.han, fu: res.fu,
      fuDetail: res.fuDetail, yakuman: res.yakuman, payment: pay, dealer,
    },
  }
}

// 何切练习：生成 14 张、向听 1~2 的手牌 + 牌效评价
// 指示牌先从整副牌山前段抽出，手牌再从「剔除指示牌后」的牌山抽取
function generateHoikata() {
  const n = doraCount()
  const sh = shuffle(buildWall(true))
  const doraIndicators = sh.slice(0, n)
  const uraIndicators = sh.slice(n, 2 * n)
  const rest = sh.slice(2 * n)                     // 已剔除指示牌的牌山
  let tiles = null
  for (let t = 0; t + 14 <= rest.length; t++) {
    const cand = rest.slice(t, t + 14)
    const s = shanten(toCounts(cand))
    if (s >= 1 && s <= 2) { tiles = cand; break }
  }
  if (!tiles) tiles = rest.slice(0, 14)
  const roundWindName = WINDS[randInt(2)]
  const seatWindName = WINDS[randInt(4)]
  const riichi = Math.random() < 0.7
  const ippatsu = riichi && Math.random() < 0.3
  const indSet = indicatorDoraSet(doraIndicators)
  const results = evaluateDiscards(tiles, indSet, { roundWind: roundWindName, seatWind: seatWindName })
  const baseShanten = shanten(toCounts(tiles))
  return {
    tiles,
    drawTile: { ...tiles[13] },
    sit: { roundWind: roundWindName, seatWind: seatWindName, doraIndicators, uraIndicators },
    indSet: [...indSet],
    results,
    baseShanten,
    riichi,
    ippatsu,
  }
}

// 牌效训练集：按难度（向听数）生成单题
//   level: 'easy' = 向听 1，'medium' = 向听 2，'hard' = 向听 3 及以上（更远的向听数）
// 指示牌先从整副牌山前段抽出，手牌再从「剔除指示牌后」的牌山抽 14 张并匹配目标向听数
function generateTraining(level) {
  for (let attempt = 0; attempt < 4000; attempt++) {
    const n = doraCount()
    const sh = shuffle(buildWall(true))
    const doraIndicators = sh.slice(0, n)
    const uraIndicators = sh.slice(n, 2 * n)
    const rest = sh.slice(2 * n)
    const start = randInt(rest.length - 13)
    const tiles = rest.slice(start, start + 14)
    const s = shanten(toCounts(tiles))
    if (s < 1) continue                                 // 跳过已听/和牌
    if (level === 'easy' && s !== 1) continue
    if (level === 'medium' && s !== 2) continue
    if (level === 'hard' && s < 3) continue
    const roundWindName = WINDS[randInt(2)]
    const seatWindName = WINDS[randInt(4)]
    const riichi = Math.random() < 0.7
    const ippatsu = riichi && Math.random() < 0.3
    const indSet = indicatorDoraSet(doraIndicators)
    const results = evaluateDiscards(tiles, indSet, { roundWind: roundWindName, seatWind: seatWindName })
    const baseShanten = shanten(toCounts(tiles))
    return {
      tiles,
      drawTile: { ...tiles[13] },
      sit: { roundWind: roundWindName, seatWind: seatWindName, doraIndicators, uraIndicators },
      indSet: [...indSet],
      results,
      baseShanten,
      riichi,
      ippatsu,
    }
  }
  return generateHoikata()                              // 兜底
}

return { generateFuhan, generateHoikata, generateTraining, buildWinningCounts, countsToTiles, WINDS }
  })(_deps)
  _deps.generator = generator

  // ==================== commentary.js ====================
  var commentary = (function (_deps) {
// 何切「职业棋手」风格解析生成（离线规则式，不依赖网络 / LLM）
// 思路：用 evaluateHand 已算出的每一切牌进张明细，对比「推荐切牌」与「最强竞争切牌」
//       —— 哪张摸进来能直接听牌、哪张摸进来还要再切一张，由此自然推导出为什么切这张。
// 解析只谈牌型 / 进张走向 / 宝牌关联，不堆砌好型率、期望打点等已在数据表中呈现的数字。
const { shanten } = _deps.shanten

const SUIT_NAME = { m: '万', p: '筒', s: '索' }
const Z_NAME = ['东', '南', '西', '北', '白', '发', '中']

function tileName(str) {
  const red = str[0] === '0'
  const suit = str[str.length - 1]
  if (suit === 'z') return Z_NAME[parseInt(str[0], 10) - 1]
  const rank = red ? 5 : parseInt(str[0], 10)
  return (red ? '赤' : '') + rank + SUIT_NAME[suit]
}
function objToStr(t) {
  return (t.red ? '0' : '') + t.rank + t.suit
}
function strToIdx(s) {
  const red = s[0] === '0'
  const suit = s[s.length - 1]
  const rank = red ? 5 : parseInt(s[0], 10)
  return { m: 0, p: 1, s: 2, z: 3 }[suit] * 9 + rank - 1
}
function handTo34(strs) {
  const a = new Array(34).fill(0)
  strs.forEach((s) => { a[strToIdx(s)]++ })
  return a
}
function isYaochuIdx(i) {
  return i % 9 === 0 || i % 9 === 8 || i >= 27
}
function doraNextIdx(i) {
  if (i < 27) { const s = Math.floor(i / 9) * 9; return s + ((i - s + 1) % 9) }
  if (i < 31) return 27 + ((i - 27 + 1) % 4)
  return 31 + ((i - 31 + 1) % 3)
}
function idxToName(i) {
  return (i % 9 + 1) + ['m', 'p', 's', 'z'][Math.floor(i / 9)]
}

// 牌姿读解：从 14 张结构里挑出可见的「役 / 型」走向
function detectSeeds(counts) {
  const seeds = []
  const anyYao = counts.some((c, i) => c > 0 && isYaochuIdx(i))
  if (!anyYao) seeds.push('断幺九')
  const suitHas = [0, 1, 2].map((s) => counts.slice(s * 9, s * 9 + 9).some((c) => c > 0))
  const honorHas = counts.slice(27).some((c) => c > 0)
  const nSuits = suitHas.filter(Boolean).length
  if (nSuits === 1 && !honorHas) seeds.push('纯一色')
  else if (nSuits === 1 && honorHas) seeds.push('混一色')
  for (let r = 0; r <= 6; r++) {
    if (counts[r] && counts[r + 9] && counts[r + 18]) { seeds.push('三色同顺'); break }
  }
  for (const b of [0, 9, 18]) {
    if (counts[b] && counts[b + 3] && counts[b + 6]) { seeds.push('一气通贯'); break }
  }
  for (let s = 0; s < 3; s++) {
    for (let r = 0; r <= 6; r++) {
      if (counts[s * 9 + r] >= 2 && counts[s * 9 + r + 1] >= 2 && counts[s * 9 + r + 2] >= 2) {
        seeds.push('一杯口'); break
      }
    }
  }
  let fourRun = 0
  for (let s = 0; s < 3; s++) {
    let run = 0
    let max = 0
    for (let r = 0; r < 9; r++) {
      if (counts[s * 9 + r] > 0) { run++; if (run > max) max = run } else run = 0
    }
    if (max >= 4) fourRun++
  }
  if (fourRun > 1) seeds.push(fourRun + '个四连型')
  else if (fourRun === 1) seeds.push('四连型')
  let trips = 0
  for (let i = 0; i < 34; i++) if (counts[i] >= 3) trips++
  if (trips >= 2) seeds.push('对对和')
  let pairCnt = 0
  for (let i = 0; i < 34; i++) if (counts[i] === 2) pairCnt++
  if (pairCnt >= 6) seeds.push('七对子')
  for (const i of [31, 32, 33]) if (counts[i] >= 2) seeds.push(Z_NAME[i - 31] + '对子')
  return seeds
}

// 在「14 张去掉 discard 后的 13 张」基础上，逐张进张判断是否直接听牌
function splitUkeire(hand14, discardStr, improvements) {
  const base = handTo34(hand14)
  base[strToIdx(discardStr)]--
  const tenpai = []
  const advance = []
  for (const k of Object.keys(improvements)) {
    const c = base.slice()
    c[strToIdx(k)]++
    if (shanten(c) === 0) tenpai.push(k)
    else advance.push(k)
  }
  return { tenpai, advance }
}

// 主入口
// ctx = { hand14: string[14], rows: [{ tile(obj), discardTile(obj), isBest, xp:{improvements, evIndex} }], doraIndicators: string[] }
function generateCommentary(ctx) {
  const { hand14, rows, doraIndicators = [] } = ctx
  const counts = handTo34(hand14)
  const seeds = detectSeeds(counts)

  const best = rows.find((r) => r.isBest) ||
    rows.slice().sort((a, b) => (b.xp ? b.xp.evIndex : 0) - (a.xp ? a.xp.evIndex : 0))[0]
  const alt = rows.filter((r) => r !== best)
    .sort((a, b) => (b.xp ? b.xp.evIndex : 0) - (a.xp ? a.xp.evIndex : 0))[0]

  const bestKey = objToStr(best.tile)
  const altKey = alt ? objToStr(alt.tile) : null

  const doraSet = new Set(
    doraIndicators.map((ind) => idxToName(doraNextIdx(strToIdx(ind))))
  )

  const bT = splitUkeire(hand14, bestKey, best.xp ? best.xp.improvements : {})
  const aT = alt && alt.xp ? splitUkeire(hand14, altKey, alt.xp.improvements) : null

  const lines = []

  // 1) 牌姿读解
  if (seeds.length) {
    lines.push('这手牌能看到' + seeds.join('、') + '的走向。')
  } else {
    lines.push('这是一手牌效至上的手牌，先把搭子整理顺是关键。')
  }

  // 2) 推荐切牌
  lines.push('本手推荐切' + tileName(bestKey) + '。')

  // 3) 与最强竞争切牌的对比推导
  if (alt && altKey !== bestKey && aT) {
    const bTenpaiNames = bT.tenpai.map(tileName)
    const bestOnly = bT.tenpai.filter((k) => !aT.tenpai.includes(k)).map(tileName)
    const doraT = bT.tenpai.filter((k) => doraSet.has(k))

    if (bestOnly.length) {
      lines.push(
        '恐怕不少人第一感会切' + tileName(altKey) +
        '，但切' + tileName(bestKey) + '之后，摸进' + bTenpaiNames.join('、') +
        '都能直接听牌；而切' + tileName(altKey) + '时，' + bestOnly.join('、') +
        '这些牌进张后还得再切一张才能听牌，等于绕了远路。'
      )
    } else {
      lines.push(
        '切' + tileName(altKey) + '看着更顺手，但本手切' + tileName(bestKey) +
        '把进张的余裕留得更厚，听牌面也更宽。'
      )
    }
    if (doraT.length) {
      lines.push('其中' + doraT.map(tileName).join('、') + '还是宝牌，摸到就能把打点直接顶上去。')
    }
    if (bestOnly.length) {
      lines.push('打' + tileName(bestKey) + '看上去稍显可惜，其实是相当厚实的一打。')
    }
  } else if (alt && altKey === bestKey) {
    lines.push('这一打把牌姿收得最干净，后续进张也最顺。')
  } else {
    lines.push('切' + tileName(bestKey) + '后牌型最整，是最该走的一步。')
  }

  return lines.join('')
}

return { generateCommentary, detectSeeds }
  })(_deps)
  _deps.commentary = commentary

  var engine = {
    tileCore: tileCore,
    shanten: shanten,
    agari: agari,
    yaku: yaku,
    score: score,
    ukeire: ukeire,
    pointEst: pointEst,
    generator: generator,
    commentary: commentary
  }
  global.MJ = global.MJ || {}
  global.MJ.engine = engine
})(typeof window !== 'undefined' ? window : this)
