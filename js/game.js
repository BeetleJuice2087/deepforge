/* Deepforge: the dungeon itself. Floors, rooms, the Knight, monsters, combat, light and the HUD.
   One room fits on screen (15 x 11 tiles of 8 pixels), drawn small and scaled up crisp. */
(function (DF) {
  'use strict';
  const T = 8, RW = 15, RH = 11, LW = RW * T, LH = RH * T;
  const TL = { FLOOR: 0, WALL: 1, BLOCK: 2, PIT: 3, HAZ: 4, SPRING: 5, BRAZIER: 6 };
  const DIRS = { n: [0, -1], s: [0, 1], w: [-1, 0], e: [1, 0] };
  const OPP = { n: 's', s: 'n', w: 'e', e: 'w' };
  const DOOR_TILE = { n: [7, 0], s: [7, RH - 1], w: [0, 5], e: [RW - 1, 5] };
  const FLYERS = new Set(['bat', 'bird', 'flutter', 'ghost', 'cloud', 'bee', 'jelly', 'star', 'orb']);
  const $ = (s) => document.querySelector(s);
  const rnd = Math.random, rint = (n) => Math.floor(rnd() * n), pick = (a) => a[rint(a.length)];
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
  const C = DF.color, SND = DF.SND, AI = DF.AI;
  const norm = window.DF_PROMPTS.norm;

  /* ================= Saved progress (camp) ================= */
  const META_KEY = 'deepforge.save';
  function defaultMeta() {
    return { v: 1, gold: 0, up: { vit: 0, str: 0, tough: 0, fort: 0, satchel: 0, pack: 0 }, books: { mon: {}, item: {}, recipes: [] },
      stats: { runs: 0, deepest: 0, kills: 0, forged: 0, bosses: 0, goldTotal: 0, elites: 0, deaths: 0, dmgDealt: 0, dmgTaken: 0, hits: 0, crits: 0, weakHits: 0,
        swings: 0, bashes: 0, potions: 0, chests: 0, mimics: 0, rooms: 0, descents: 0, rerolls: 0, items: 0, legendaries: 0, walked: 0, playSecs: 0, floorsAI: 0, floorsHand: 0, bought: 0, sold: 0, rests: 0, scrolls: 0, spells: 0, pots: 0 },
      records: { killedBy: {}, elemKills: {}, bigHit: null, bestRun: null, longestRun: 0, bestItem: null }, run: null, tips: {} };
  }
  let meta = defaultMeta();
  try { const s = JSON.parse(localStorage.getItem(META_KEY) || 'null'); if (s && s.v === 1) meta = Object.assign(defaultMeta(), s, { up: Object.assign(defaultMeta().up, s.up), stats: Object.assign(defaultMeta().stats, s.stats), books: Object.assign(defaultMeta().books, s.books), records: Object.assign(defaultMeta().records, s.records) }); } catch (e) { /* fresh */ }
  // Repair anything odd in a save (missing or non-number values), so the shop always adds up.
  function tidyMeta() {
    const num = (v) => (Number.isFinite(Number(v)) ? Math.max(0, Math.floor(Number(v))) : 0);
    meta.gold = num(meta.gold);
    for (const k in defaultMeta().up) meta.up[k] = num(meta.up[k]);
    for (const k in defaultMeta().stats) meta.stats[k] = Number.isFinite(Number(meta.stats[k])) ? Math.max(0, Number(meta.stats[k])) : 0;
    if (!meta.records || typeof meta.records !== 'object') meta.records = defaultMeta().records;
    for (const k of ['killedBy', 'elemKills']) if (!meta.records[k] || typeof meta.records[k] !== 'object') meta.records[k] = {};
  }
  tidyMeta();
  const bump = (k, n) => { meta.stats[k] = (meta.stats[k] || 0) + (n == null ? 1 : n); };
  let metaTimer = 0;
  function saveMeta(now) {
    clearTimeout(metaTimer);
    const w = () => { snapshotRun(); try { localStorage.setItem(META_KEY, JSON.stringify(meta)); } catch (e) { /* full */ } };
    if (now) w(); else metaTimer = setTimeout(w, 600);
  }
  // Past level 10 each level costs 18% more than the one before, so gold always has a use but it gets steep.
  const steep = (base, step) => (l) => (l < 10 ? base + l * step : Math.round((base + 9 * step) * Math.pow(1.18, l - 9)));
  const UPGRADES = [
    { id: 'vit', name: 'Vitality', text: '+6 max health', max: Infinity, cost: steep(25, 20) },
    { id: 'str', name: 'Strength', text: '+1 attack', max: Infinity, cost: steep(30, 25) },
    { id: 'tough', name: 'Toughness', text: '+1 defence', max: Infinity, cost: steep(30, 25) },
    { id: 'fort', name: 'Fortune', text: '+4% luck: crits and better loot', max: 14, cost: steep(40, 30) },
    { id: 'satchel', name: 'Satchel', text: '+1 potion at the start of each run', max: 5, cost: (l) => 60 + l * 60 },
    { id: 'pack', name: 'Bigger Pack', text: '+4 bag slots (8 \u2192 12 \u2192 16 \u2192 20)', max: 3, cost: (l) => [120, 260, 450][l] || 450 },
  ];
  // Returns '' when bought, or the reason it couldn't be.
  function buyUpgrade(id) {
    tidyMeta();
    const u = UPGRADES.find((x) => x.id === id); if (!u) return 'unknown';
    const l = meta.up[id], cost = u.cost(l);
    if (l >= u.max) return `${u.name} is already maxed.`;
    if (meta.gold < cost) return `You need ${cost - meta.gold} more gold for ${u.name}.`;
    meta.gold -= cost; meta.up[id] = l + 1; saveMeta(true); SND.coin(0.5); return '';
  }

  /* ================= Items ================= */
  let uidN = 1;
  const newUid = () => 'i' + Date.now().toString(36) + (uidN++);
  function rollRarity(floorN, luck, min) {
    const r = rnd();
    let rar = 0;
    if (r < 0.008 + floorN * 0.004 + luck * 0.08) rar = 4;
    else if (r < 0.04 + floorN * 0.012 + luck * 0.2) rar = 3;
    else if (r < 0.13 + floorN * 0.025 + luck * 0.4) rar = 2;
    else if (r < 0.42 + floorN * 0.02) rar = 1;
    return Math.max(rar, min || 0);
  }
  // A weapon found by a ranger becomes a bow, by a mage a wand or staff, by a tinkerer a wrench or hammer.
  function classWeapon(it, cls) {
    const offhand = it.type === 'armour' && DF.ARMOUR_SLOT[it.icon] === 'offhand';
    const kit = it.type === 'weapon' ? DF.CLASS_WEAPONS[cls] : offhand ? DF.CLASS_OFFHAND[cls] : null;
    if (!kit || kit[it.icon]) return;
    const icons = Object.keys(kit), r = DF.seeded(it.name + '|' + cls), icon = icons[r(icons.length)], noun = kit[icon][r(kit[icon].length)];
    const nounRe = new RegExp('\\b(' + DF.WEAPON_NOUNS.slice().sort((x, y) => y.length - x.length).join('|') + ')\\b', 'i');
    const m = String(it.name || '').match(nounRe);
    const old = m ? m[1] : it.icon;
    if (m) it.name = it.name.replace(nounRe, noun);
    if (it.description) {
      const art = /^[aeiou]/i.test(noun) ? 'an' : 'a';
      it.description = it.description
        .replace(new RegExp('\\b(an?) ' + old + '\\b', 'i'), (all, a0) => (a0[0] === 'A' ? art[0].toUpperCase() + art.slice(1) : art) + ' ' + noun.toLowerCase())
        .replace(new RegExp('\\b' + old + '\\b', 'gi'), noun.toLowerCase());
    }
    it.icon = icon;
  }
  function makeItem(spec, rarity, lvl, cls) {
    const it = Object.assign({}, spec, { uid: newUid(), rarity: clamp(rarity | 0, 0, 4), lvl: Math.max(0, lvl | 0) });
    classWeapon(it, cls || (run && run.cls));
    it.colors = (spec.colors || []).slice(0, 2);
    if (it.type === 'weapon') {
      const [lo, hi] = DF.POWER_COUNT[it.rarity], r = DF.seeded(it.name);
      let p = (spec.powers || []).filter((x) => DF.POWERS.includes(x)).slice(0, hi);
      while (p.length < lo) { const x = DF.POWERS[r(DF.POWERS.length)]; if (!p.includes(x)) p.push(x); }
      it.powers = p;
    } else it.powers = [];
    if (it.type === 'trinket' && !DF.STATS.includes(it.stat)) it.stat = 'luck';
    return it;
  }
  // The numbers for an item: the AI never sets these, the game balances them from rarity and depth.
  function itemStats(it) {
    if (!it) return {};
    const m = DF.RAR_MULT[it.rarity || 0], L = it.lvl || 0;
    if (it.type === 'weapon') return { attack: Math.round((2 + L * 1.3) * m) };
    if (it.type === 'armour') {
      // The body piece is the main armour; the smaller pieces each lean toward a different stat.
      const d0 = (1 + L * 0.7) * m, k = DF.ARMOUR_SLOT[it.icon] || 'body';
      if (k === 'offhand') return { defence: Math.max(1, Math.round(d0 * 0.6)) };
      if (k === 'head') return { defence: Math.max(1, Math.round(d0 * 0.35)), health: Math.round(d0 * 1.2) };
      if (k === 'hands') return { defence: Math.max(1, Math.round(d0 * 0.3)), attack: Math.max(1, Math.round(d0 * 0.35)) };
      if (k === 'feet') return { defence: Math.max(1, Math.round(d0 * 0.3)), speed: Math.round(2 + d0 * 0.6) };
      const d = Math.round(d0); return { defence: d, health: Math.round(d * 1.5) };
    }
    if (it.type === 'trinket') {
      const s = it.stat;
      if (s === 'health') return { health: Math.round((6 + L * 3) * m) };
      if (s === 'attack') return { attack: Math.max(1, Math.round((1 + L * 0.6) * m)) };
      if (s === 'defence') return { defence: Math.max(1, Math.round((1 + L * 0.6) * m)) };
      if (s === 'speed') return { speed: Math.round((4 + L * 0.8) * m) };
      return { luck: Math.round((3 + L * 0.8) * m) };
    }
    return {};
  }
  // Weapon shapes change how a swing feels.
  const WEAPON_FEEL = {
    sword: { range: 11, arc: 2.0, cd: 0.32, mult: 1 }, axe: { range: 11, arc: 2.6, cd: 0.38, mult: 1.1 }, hammer: { range: 11, arc: 2.1, cd: 0.46, mult: 1.35 },
    spear: { range: 15, arc: 1.1, cd: 0.34, mult: 1 }, dagger: { range: 9, arc: 1.8, cd: 0.22, mult: 0.8 }, mace: { range: 10, arc: 2.2, cd: 0.4, mult: 1.2 },
    wand: { range: 10, arc: 1.6, cd: 0.3, mult: 0.85 }, bow: { range: 9, arc: 1.6, cd: 0.3, mult: 0.8 }, wrench: { range: 11, arc: 2.2, cd: 0.34, mult: 1.05 },
    crossbow: { range: 9, arc: 1.6, cd: 0.3, mult: 0.8 }, staff: { range: 10, arc: 1.6, cd: 0.3, mult: 0.85 },
  };
  function recordItem(it) {
    const k = norm(it.name); if (!k) return false;
    if (!it.forged) { bump('items'); if (it.rarity >= 4) bump('legendaries'); }
    const best = meta.records.bestItem;
    if (!best || (it.rarity || 0) > best.rarity) meta.records.bestItem = { name: it.name, rarity: it.rarity || 0, icon: it.icon, colors: it.colors, element: it.element, type: it.type };
    const had = !!meta.books.item[k];
    const old = meta.books.item[k] || { found: 0, best: 0 };
    meta.books.item[k] = { spec: { name: it.name, description: it.description, type: it.type, icon: it.icon, element: it.element, powers: it.powers, stat: it.stat, colors: it.colors },
      found: old.found + 1, best: Math.max(old.best || 0, it.rarity || 0), forged: old.forged || !!it.forged };
    saveMeta();
    if (!had) DF.UI.discovery('item', it);
    return !had;
  }
  function recordMonster(spec) {
    const k = norm(spec.name);
    if (meta.books.mon[k]) return;
    meta.books.mon[k] = { spec: { name: spec.name, description: spec.description, colors: spec.colors, element: spec.element, weakness: spec.weakness,
      tier: spec.tier, behaviour: spec.behaviour, abilities: spec.abilities, body: spec.body || '', boss: !!spec.boss, special: spec.special || '', specialText: spec.specialText || '' }, kills: 0, theme: run ? run.content.theme.name : '' };
    saveMeta();
    DF.UI.discovery('monster', spec);
  }

  /* ================= Returning monsters ================= */
  // Some of each floor's monsters come back from your Monster Book, so you meet old foes again
  // (and the book doesn't just grow and grow). The more you've met, the more often they return,
  // but every floor keeps at least one fresh slot.
  function knownMonsters(boss) {
    return Object.values(meta.books.mon).map((b) => b.spec)
      .filter((s) => s && s.behaviour && s.name !== 'Mimic Chest' && !!s.boss === boss);
  }
  function chooseFamiliar(pool, element, taken) {
    const free = pool.filter((s) => !taken.includes(norm(s.name)));
    if (!free.length) return null;
    const w = free.map((s) => (s.element === element ? 3 : 1)), total = w.reduce((a, b) => a + b, 0);
    let t = rnd() * total;
    for (let i = 0; i < free.length; i++) { t -= w[i]; if (t <= 0) return free[i]; }
    return free[0];
  }
  function planReturning(c, element) {
    const pool = knownMonsters(false), share = Math.min(0.6, pool.length / 24);
    const picks = [null, null, null, null], taken = [];
    let n = 0;
    for (let i = 0; i < 4; i++) {
      if (n >= 3 || rnd() >= share) continue;
      const s = chooseFamiliar(pool, element, taken); if (!s) break;
      picks[i] = Object.assign({}, s, { boss: false, returning: true }); taken.push(norm(s.name)); n++;
    }
    let boss = null;
    const bosses = knownMonsters(true);
    if (c.n % 5 !== 0 && rnd() < Math.min(0.35, bosses.length / 8)) {
      const s = chooseFamiliar(bosses, element, []); if (s) boss = Object.assign({}, s, { returning: true });
    }
    c.planned = true;
    return { picks, boss };
  }

  /* ================= Floors the AI dreams up ahead of time ================= */
  const tierFor = (n) => Math.min(5, 1 + Math.floor((n - 1) / 3));
  function newContent(n) {
    return { n, tier: tierFor(n), seed: rint(window.DF_PROMPTS.THEME_SEEDS), gseed: Math.floor(Math.random() * 1e9), theme: null, monsters: [null, null, null, null], boss: null, loot: Array(6).fill(null), prio: 2, dead: false, failed: false };
  }
  // Ask the AI for a whole floor, one piece at a time (later pieces know the earlier ones).
  function dream(c) {
    c.dreaming = true;
    if (!AI.ready()) { c.failed = true; return; }
    AI.request('theme', { seed: c.seed, tier: c.tier }, c.prio).then(async (th) => {
      if (c.dead) return;
      if (!th) { c.failed = true; return; }
      c.theme = th;
      const base = { theme: th.name, themeDesc: th.description, element: th.element };
      const plan = planReturning(c, th.element);
      plan.picks.forEach((s, i) => { if (s) c.monsters[i] = s; });
      if (plan.boss) c.boss = plan.boss;
      const avoid = c.monsters.filter(Boolean).map((m) => m.name);
      for (let i = 0; i < 4; i++) {
        if (c.dead) return;
        if (c.monsters[i]) continue; // an old foe comes back here: nothing to invent
        const m = await AI.request('monster', Object.assign({ slot: String(i), avoid: avoid.slice() }, base), c.prio);
        if (m) { c.monsters[i] = m; avoid.push(m.name); }
      }
      if (c.dead) return;
      if (!c.boss) { const b = await AI.request('monster', Object.assign({ slot: c.n % 5 === 0 ? 'named' : 'boss', avoid: avoid.slice() }, base), c.prio); if (b) c.boss = b; }
      for (let i = 0; i < 6; i++) {
        if (c.dead) return;
        const it = await AI.request('item', Object.assign({ slot: i }, base), c.prio - 1);
        if (it) c.loot[i] = it;
      }
    });
  }
  const contentReady = (c) => c.failed || (c.theme && c.monsters.filter(Boolean).length >= 3 && c.boss);
  // Turn whatever is ready into a full floor. Gaps are filled by the floor generator (built around the AI's
  // theme when there is one); now and then a whole floor comes from the six handmade ones instead.
  function materialize(c, usedFallbacks) {
    const pool = DF.FALLBACK_THEMES;
    const gen = DF.GEN.floor(c.gseed != null ? c.gseed : c.seed + ':' + c.n, c.n, c.theme || null);
    let fb = gen;
    if (!c.theme) { const free = pool.filter((t) => !usedFallbacks.includes(t.name)); if (free.length && rnd() < 0.2) fb = free[c.seed % free.length]; }
    const theme = c.theme ? Object.assign({}, c.theme) : { name: fb.name, description: fb.description, element: fb.element, rule: fb.rule, colors: fb.colors };
    // Floors from the handmade maps get returning monsters too (so your AI inventions turn up even offline).
    if (!c.planned) { const plan = planReturning(c, theme.element); plan.picks.forEach((s, i) => { if (s && !c.monsters[i]) c.monsters[i] = s; }); if (plan.boss && !c.boss) c.boss = plan.boss; }
    const monsters = [0, 1, 2, 3].map((i) => Object.assign({}, c.monsters[i] || fb.monsters[i]));
    const boss = Object.assign({}, c.boss || fb.boss, { boss: true, named: c.n % 5 === 0 });
    // The floor's treasure: the AI's own finds first, then the floor's list, then generated armour for any
    // place to wear things the list doesn't cover yet (so helms, gloves and boots turn up too).
    const loot = [], seen = new Set(), slotOf = (x) => (x.type === 'armour' ? DF.ARMOUR_SLOT[x.icon] || 'body' : x.type);
    const add = (x) => { if (x && !seen.has(x.name)) { seen.add(x.name); loot.push(x); } };
    c.loot.forEach(add); fb.loot.forEach(add);
    gen.loot.filter((x) => x.type === 'armour' && !loot.some((y) => slotOf(y) === slotOf(x))).forEach(add);
    const fromAI = { theme: !!c.theme, monsters: c.monsters.filter(Boolean).length, boss: !!c.boss };
    return { n: c.n, theme, monsters, boss, loot, fromAI, fallback: c.theme || fb.generated ? '' : fb.name };
  }

  /* ================= Making a floor ================= */
  function buildFloor(n) {
    const want = Math.min(15, 7 + n + rint(2)), G = 7;
    const cells = new Map(), key = (x, y) => x + ',' + y;
    const add = (x, y) => { const r = { gx: x, gy: y, type: 'fight', doors: {}, visited: false, seen: false, cleared: false, enemies: [], pickups: [], effects: [] }; cells.set(key(x, y), r); return r; };
    const start = add(3, 3); start.type = 'start';
    let guard = 0;
    while (cells.size < want && guard++ < 2000) {
      const from = pick([...cells.values()]), d = pick(Object.keys(DIRS));
      const x = from.gx + DIRS[d][0], y = from.gy + DIRS[d][1];
      if (x < 0 || y < 0 || x >= G || y >= G || cells.has(key(x, y))) continue;
      const nb = Object.values(DIRS).filter(([dx, dy]) => cells.has(key(x + dx, y + dy))).length;
      if (nb > 1 && rnd() < 0.85) continue; // keep it branchy, like a real dungeon
      add(x, y);
    }
    const rooms = [...cells.values()];
    rooms.forEach((r) => { for (const d in DIRS) { const o = cells.get(key(r.gx + DIRS[d][0], r.gy + DIRS[d][1])); if (o) r.doors[d] = true; } });
    // Distance from the start.
    const distTo = new Map([[start, 0]]), q = [start];
    while (q.length) { const r = q.shift(); for (const d in r.doors) { const o = cells.get(key(r.gx + DIRS[d][0], r.gy + DIRS[d][1])); if (!distTo.has(o)) { distTo.set(o, distTo.get(r) + 1); q.push(o); } } }
    const byFar = rooms.filter((r) => r !== start).sort((a, b) => distTo.get(b) - distTo.get(a));
    const ends = byFar.filter((r) => Object.keys(r.doors).length === 1);
    const take = (list) => { const r = list.find((x) => x.type === 'fight'); return r; };
    const boss = ends[0] || byFar[0]; boss.type = 'boss';
    const forge = take(ends.slice(1)) || take(byFar.slice(Math.floor(byFar.length / 3))); if (forge) forge.type = 'forge';
    const tre = take(ends.slice(1)) || take(byFar); if (tre) tre.type = 'treasure';
    if (n >= 2 && rooms.length > 9) { const t2 = take(ends.slice(1).reverse()); if (t2 && rnd() < 0.6) t2.type = 'treasure'; }
    // A merchant on most floors, and a campfire to rest at on many (never next to the start).
    const mid = byFar.filter((r) => distTo.get(r) >= 2);
    if (rnd() < 0.75) { const sh = take(ends.slice(1)) || take(mid.slice().reverse()); if (sh) sh.type = 'shop'; }
    if (n >= 2 && rnd() < 0.65) { const cf = take(mid.slice(Math.floor(mid.length / 3))) || take(mid); if (cf) cf.type = 'camp'; }
    // A strange room on most floors: a shrine, a cursed chest, a traveller, a well or an old armoury.
    if (rnd() < (n >= 2 ? 0.7 : 0.4)) { const ev = take(mid.slice().reverse()) || take(mid); if (ev) ev.type = 'event'; }
    rooms.forEach((r) => { r.dist = distTo.get(r); });
    return { rooms, start, cells, get: (x, y) => cells.get(key(x, y)) };
  }
  const isDoorTile = (tx, ty) => (tx === 7 && (ty === 0 || ty === RH - 1)) || (ty === 5 && (tx === 0 || tx === RW - 1));
  const doorDirAt = (tx, ty) => (ty === 0 ? 'n' : ty === RH - 1 ? 's' : tx === 0 ? 'w' : 'e');
  function buildTiles(room, theme) {
    const t = new Uint8Array(RW * RH);
    const rule = theme.rule;
    let layout = room.type === 'start' || room.type === 'boss' ? DF.ROOMS[0] : pick(DF.ROOMS);
    if (room.type === 'boss') layout = pick([DF.ROOMS[0], DF.ROOMS[1], DF.ROOMS[9]]);
    if (room.type === 'treasure' || room.type === 'forge' || room.type === 'shop' || room.type === 'camp' || room.type === 'event') layout = pick([DF.ROOMS[0], DF.ROOMS[1], DF.ROOMS[3], DF.ROOMS[5]]);
    const flipX = rnd() < 0.5, flipY = rnd() < 0.5;
    for (let y = 0; y < RH; y++) for (let x = 0; x < RW; x++) {
      if (x === 0 || y === 0 || x === RW - 1 || y === RH - 1) { t[y * RW + x] = TL.WALL; continue; }
      const lx = flipX ? RW - 2 - x : x - 1, ly = flipY ? RH - 2 - y : y - 1;
      const ch = layout[ly][lx];
      t[y * RW + x] = ch === '#' ? TL.BLOCK : ch === '~' ? TL.PIT : ch === 'h' ? (rule === 'hazard pools' ? TL.HAZ : TL.FLOOR)
        : ch === '*' ? (rule === 'healing springs' ? TL.SPRING : TL.BRAZIER) : TL.FLOOR;
    }
    for (const d in room.doors) { const [x, y] = DOOR_TILE[d]; t[y * RW + x] = TL.FLOOR; }
    // Special rooms keep their middle clear.
    if (room.type !== 'fight') for (let y = 3; y <= 7; y++) for (let x = 5; x <= 9; x++) if (t[y * RW + x] !== TL.FLOOR) t[y * RW + x] = TL.FLOOR;
    // Every door must reach every other door: clear a plus-shaped path if a layout blocks it.
    const walk = (k) => t[k] === TL.FLOOR || t[k] === TL.HAZ || t[k] === TL.SPRING;
    const reach = () => {
      const seen = new Uint8Array(RW * RH), q = [5 * RW + 7]; seen[q[0]] = 1;
      while (q.length) { const k = q.pop(), x = k % RW, y = (k / RW) | 0; [[1, 0], [-1, 0], [0, 1], [0, -1]].forEach(([dx, dy]) => { const nx = x + dx, ny = y + dy; if (nx < 0 || ny < 0 || nx >= RW || ny >= RH) return; const nk = ny * RW + nx; if (!seen[nk] && walk(nk)) { seen[nk] = 1; q.push(nk); } }); }
      return Object.keys(room.doors).every((d) => { const [x, y] = DOOR_TILE[d]; return seen[y * RW + x]; });
    };
    if (!walk(5 * RW + 7)) t[5 * RW + 7] = TL.FLOOR;
    if (!reach()) {
      for (let x = 1; x < RW - 1; x++) if (!walk(5 * RW + x)) t[5 * RW + x] = TL.FLOOR;
      for (let y = 1; y < RH - 1; y++) if (!walk(y * RW + 7)) t[y * RW + 7] = TL.FLOOR;
    }
    // Hazard pools and springs need room to step around, and none right inside a door.
    for (const d in DOOR_TILE) { const [x, y] = DOOR_TILE[d]; const ix = clamp(x + (d === 'w' ? 1 : d === 'e' ? -1 : 0), 1, RW - 2), iy = clamp(y + (d === 'n' ? 1 : d === 's' ? -1 : 0), 1, RH - 2); if (t[iy * RW + ix] !== TL.FLOOR) t[iy * RW + ix] = TL.FLOOR; }
    room.tiles = t;
    room.springLeft = 0.45; // a spring can heal this share of your max health
    room.torches = pickTorches(room);
    placeProps(room);
  }
  /* ---- Pots and crates: smash them for a few coins, sometimes a heart ----
     They sit along walls and blocks, never in a doorway lane, and never where they'd cut off a path. */
  function placeProps(room) {
    room.props = [];
    const want = { fight: 1 + rint(4), start: 2 + rint(2), treasure: 1 + rint(2), boss: rint(3), forge: rint(2) }[room.type] || 0;
    if (!want) return;
    const t = room.tiles, special = room.type !== 'fight';
    const free = (x, y) => t[y * RW + x] === TL.FLOOR && !room.props.some((p) => p.tx === x && p.ty === y);
    const reachable = () => { // floor tiles reachable from the middle, treating props as solid
      const seen = new Uint8Array(RW * RH), q = [5 * RW + 7]; seen[q[0]] = 1; let n = 0;
      while (q.length) { const k = q.pop(), x = k % RW, y = (k / RW) | 0; n++;
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const nx = x + dx, ny = y + dy; if (nx < 1 || ny < 1 || nx > RW - 2 || ny > RH - 2) continue; const nk = ny * RW + nx; if (seen[nk]) continue; const tt = t[nk]; if ((tt === TL.FLOOR || tt === TL.HAZ || tt === TL.SPRING) && !room.props.some((p) => p.tx === nx && p.ty === ny)) { seen[nk] = 1; q.push(nk); } } }
      return n;
    };
    const cands = [];
    for (let y = 1; y < RH - 1; y++) for (let x = 1; x < RW - 1; x++) {
      if (!free(x, y) || x === 7 || y === 5) continue; // keep the door lanes clear
      if (special && x >= 4 && x <= 10 && y >= 2 && y <= 8) continue; // keep the middle of special rooms clear
      if ((x <= 2 && Math.abs(y - 5) <= 1) || (x >= RW - 3 && Math.abs(y - 5) <= 1) || (y <= 2 && Math.abs(x - 7) <= 1) || (y >= RH - 3 && Math.abs(x - 7) <= 1)) continue; // or just inside a door
      const walls = [[1, 0], [-1, 0], [0, 1], [0, -1]].filter(([dx, dy]) => { const tt = t[(y + dy) * RW + x + dx]; return tt === TL.WALL || tt === TL.BLOCK; }).length;
      if (walls) cands.push([x, y, walls]);
    }
    let base = reachable(), tries = 0;
    while (room.props.length < want && cands.length && tries++ < 60) {
      // Corners first: they look most natural there.
      cands.sort((a, b) => b[2] - a[2] + (rnd() - 0.5) * 1.5);
      const [x, y] = cands.shift();
      if (!free(x, y)) continue;
      const kind = rnd() < 0.6 ? 'pot' : 'crate';
      room.props.push({ tx: x, ty: y, kind, v: rint(3) });
      const now = reachable();
      if (now !== base - 1) { room.props.pop(); continue; } // it would cut something off: put it somewhere else
      base = now;
      // Pots like company: sometimes a second one right next to it.
      if (room.props.length < want && rnd() < 0.5) {
        const nb = [[1, 0], [-1, 0], [0, 1], [0, -1]].map(([dx, dy]) => [x + dx, y + dy]).find(([nx, ny]) => cands.some((c) => c[0] === nx && c[1] === ny) && free(nx, ny));
        if (nb) { room.props.push({ tx: nb[0], ty: nb[1], kind: rnd() < 0.7 ? kind : (kind === 'pot' ? 'crate' : 'pot'), v: rint(3) }); const n2 = reachable(); if (n2 !== base - 1) room.props.pop(); else base = n2; }
      }
    }
  }
  const propAt = (tx, ty) => room && room.props && room.props.find((p) => !p.broken && p.tx === tx && p.ty === ty);
  function breakProp(p) {
    if (p.broken) return;
    p.broken = true; bump('pots');
    const x = p.tx * T + T / 2, y = p.ty * T + T / 2;
    const cols = p.kind === 'pot' ? ['#b0603a', '#d88a5a', '#6a3420'] : ['#8a6034', '#b08050', '#4a3018'];
    for (let i = 0; i < 14; i++) fx.particles.push({ x: x + (rnd() - 0.5) * 4, y: y - 2 + (rnd() - 0.5) * 4, vx: (rnd() - 0.5) * 70, vy: -20 - rnd() * 40, life: 0.5, max: 0.5, color: cols[i % 3], size: 1, glow: false, g: 160 });
    SND.smash ? SND.smash(x / LW, p.kind) : SND.hit(x / LW);
    const coins = 1 + rint(3), mult = run.content.theme.rule === 'rich veins' ? 2 : 1;
    for (let i = 0; i < coins; i++) room.pickups.push({ kind: 'gold', value: mult, x: x + (rnd() - 0.5) * 6, y: y + 2 + (rnd() - 0.5) * 4, vy: -25 - rnd() * 20, z: 0 });
    const low = P.hp / stats().maxHp < 0.4; // running low? hearts turn up far more often
    if (rnd() < (low ? 0.4 : 0.15)) room.pickups.push({ kind: 'heart', x: x + (rnd() - 0.5) * 4, y: y + 3, vy: -30, z: 0 });
  }
  // Break any pot or crate within reach of a point (a swing, a bash, a blast).
  function breakPropsNear(x, y, reach, test) {
    if (!room || !room.props) return;
    for (const p of room.props) { if (p.broken) continue; const px = p.tx * T + T / 2, py = p.ty * T + T / 2; if (Math.hypot(px - x, py - y) <= reach + 3 && (!test || test(px, py))) breakProp(p); }
  }
  function pickTorches(room) {
    const spots = [[3, 0], [11, 0], [0, 2], [RW - 1, 8], [0, 8], [RW - 1, 2], [3, RH - 1], [11, RH - 1]];
    const r = DF.seeded(room.gx + ':' + room.gy + ':' + (run ? run.content.theme.name : ''));
    const n = run && run.content.theme.rule === 'darkness' ? 2 : 3 + r(2);
    const out = [];
    while (out.length < n) { const s = spots[r(spots.length)]; if (!out.includes(s)) out.push(s); }
    return out;
  }

  /* ================= Game state ================= */
  let run = null, floor = null, room = null;
  const P = { x: 60, y: 44, vx: 0, vy: 0, r: 2.5, fx: 1, fy: 0, dir: 1, hp: 30, inv: 0, cd: 0, bashCd: 0, swing: null, bash: null, poison: 0, poisonTick: 0,
    walkT: 0, hazT: 0, springT: 0, slowT: 0, flash: 0, dead: false, spellCd: 0, ward: 0, roll: null, turrets: [], burnT: 0, burnTick: 0, rootT: 0, curseT: 0 };
  const fx = { particles: [], texts: [], projectiles: [], shake: 0, fade: 0, fadeDir: 0, fadeCb: null, hitstop: 0, slowmo: 0 };
  const hold = new Set(); // reasons the game is paused (menus, cards, the forge)
  let action = null; // the context button: open a chest, forge, descend
  const input = { mx: 0, my: 0, attack: false, bash: false, spell: false, spell2: false, act: false, keys: new Set() };

  // How many bag slots you have: 8, and 4 more for each Bigger Pack upgrade (up to 20).
  const bagSize = () => 8 + 4 * Math.min(3, meta.up.pack || 0);
  // The first empty bag slot (-1 when full). Treats any empty value as empty, and keeps the bag at its size
  // (it only grows: a smaller bag never throws items away).
  function freeSlot() {
    if (!run) return -1;
    const n = Math.max(bagSize(), run.bag.filter(Boolean).length);
    if (run.bag.length !== n) { const items = run.bag.filter(Boolean); run.bag = Array.from({ length: n }, (_, i) => (run.bag.length > n ? items[i] : run.bag[i]) || null); }
    return run.bag.findIndex((x) => !x);
  }
  const bagFullMsg = () => `Your bag is full (${run.bag.length} of ${run.bag.length}).`;
  /* ---- What you wear: weapon, off-hand, head, body, hands, feet and two trinkets ---- */
  const itemScore = (x) => { const st = itemStats(x); return (st.attack || 0) + (st.defence || 0) + (st.health || 0) / 3 + (st.speed || 0) / 4 + (st.luck || 0) / 3; };
  function slotKind(it) { return !it ? '' : it.type === 'weapon' ? 'weapon' : it.type === 'trinket' ? 'trinket' : DF.ARMOUR_SLOT[it.icon] || 'body'; }
  // Where an item goes when you put it on (a trinket takes an empty trinket slot, or replaces the weaker one).
  function slotFor(it) {
    const k = slotKind(it); if (k !== 'trinket') return k;
    if (!run.eq.trinket1) return 'trinket1'; if (!run.eq.trinket2) return 'trinket2';
    return itemScore(run.eq.trinket1) <= itemScore(run.eq.trinket2) ? 'trinket1' : 'trinket2';
  }
  // Older saves wore one armour and one trinket: put them where they belong now.
  function fixEq(eq) {
    const out = {}; DF.EQ_SLOTS.forEach((s) => { out[s] = null; });
    if (!eq) return out;
    DF.EQ_SLOTS.forEach((s) => { if (eq[s]) out[s] = eq[s]; });
    if (eq.armour) { const s = DF.ARMOUR_SLOT[eq.armour.icon] || 'body'; if (!out[s]) out[s] = eq.armour; }
    if (eq.trinket && !out.trinket1) out.trinket1 = eq.trinket;
    return out;
  }
  function stats() {
    const u = meta.up, base = DF.CLASSES[(run && run.cls) || 'knight'] || DF.CLASSES.knight;
    const s = { maxHp: base.hp + u.vit * 6, attack: base.atk + u.str, defence: u.tough, speed: base.spd, luck: 5 + u.fort * 4, maxMana: base.mana };
    if (run) for (const k of DF.EQ_SLOTS) {
      const st = itemStats(run.eq[k]);
      if (st.health) s.maxHp += st.health; if (st.attack) s.attack += st.attack; if (st.defence) s.defence += st.defence;
      if (st.speed) s.speed += st.speed; if (st.luck) s.luck += st.luck;
    }
    if (run && run.bless) { s.attack += run.bless.atk || 0; s.defence += run.bless.def || 0; s.luck += run.bless.luck || 0; }
    s.speed = Math.min(s.speed, 70);
    s.luckF = Math.min(0.6, s.luck / 100);
    if (P.curseT > 0) s.attack = Math.max(1, Math.round(s.attack * 0.7)); // a mummy's curse
    return s;
  }

  /* ================= Starting, saving and ending a run ================= */
  let prepared = null; // floor 1 of the next run, dreamed up while you're at camp
  function prepareNextRun() {
    if (prepared && !prepared.dead) return;
    prepared = newContent(1); prepared.prio = 3; dream(prepared);
  }
  async function startRun(resume, cls) {
    SND.wake();
    if (resume && meta.run) {
      const s = meta.run;
      run = { floorN: s.floorN, content: s.content, next: newContent(s.floorN + 1), eq: fixEq(s.eq), bag: (s.bag || []).slice(), potions: s.potions, kills: s.kills || 0, gold: s.gold || 0,
        forged: s.forged || 0, usedFallbacks: s.usedFallbacks || [], startedAt: s.startedAt || Date.now(), floorKills: s.floorKills || 0, rerolled: s.rerolled || 0, playSecs: s.playSecs || 0,
        cls: DF.CLASSES[s.cls] ? s.cls : 'knight', spell2: s.spell2 && DF.SPELLS[s.spell2.id] ? s.spell2 : null, bless: s.bless || { atk: 0, def: 0, luck: 0 }, lastEvent: s.lastEvent || '' };
      freeSlot(); // an older, smaller bag grows to today's size
      run.next.prio = 2; dream(run.next);
      enterFloor(s.hp, s.floor);
      return;
    }
    meta.stats.runs++;
    const st0 = meta.up;
    let c = prepared || newContent(1); prepared = null;
    c.prio = 6; if (!c.dreaming || (c.failed && AI.ready())) { c.failed = false; dream(c); }
    cls = DF.CLASSES[cls] ? cls : 'knight'; meta.lastCls = cls;
    const kit = DF.STARTERS[cls];
    run = { floorN: 1, content: null, next: null, cls, eq: fixEq({ weapon: makeItem(kit.weapon, 0, 0, cls), armour: makeItem(kit.armour, 0, 0, cls) }),
      bag: Array(bagSize()).fill(null), potions: 1 + st0.satchel, kills: 0, gold: 0, forged: 0, usedFallbacks: [], startedAt: Date.now(), bless: { atk: 0, def: 0, luck: 0 }, lastEvent: '' };
    // Give the AI a few seconds to finish floor 1, but never make you wait long.
    if (AI.ready() && !contentReady(c) && (AI.settings.mode === 'cloud' || AI.local.engine)) {
      const ok = await DF.UI.waitForDream(() => contentReady(c), 9000);
      if (!ok) { /* skipped or timed out: use what's ready */ }
    }
    run.content = materialize(c, run.usedFallbacks);
    if (run.content.fallback) run.usedFallbacks.push(run.content.fallback);
    run.live = c;
    run.next = newContent(2); dream(run.next);
    enterFloor(stats().maxHp);
  }
  // The run as it stands, including the floor itself: which rooms are cleared, what's lying about,
  // and any monsters still alive. Continuing puts you back on this exact floor.
  function snapFloor() {
    if (!floor || !room) return null;
    return {
      cur: [room.gx, room.gy], px: P.x, py: P.y,
      rooms: floor.rooms.map((r) => ({
        gx: r.gx, gy: r.gy, type: r.type, doors: r.doors, visited: r.visited, seen: r.seen, cleared: r.cleared, dist: r.dist,
        tiles: r.tiles ? Array.from(r.tiles) : null, torches: r.torches, springLeft: r.springLeft,
        chest: r.chest || null, altar: r.altar || null, stairs: r.stairs || null, shop: r.shop || null, fire: r.fire || null, event: r.event || null, props: r.props || [],
        pickups: r.pickups.map((p) => ({ kind: p.kind, x: p.x, y: p.y, value: p.value, item: p.item, spell: p.spell, charges: p.charges })),
        enemies: r.enemies.filter((e) => !e.dead).map((e) => ({ spec: e.spec, x: e.x, y: e.y, hp: e.hp, elite: e.elite, boss: e.boss, child: e.child, minion: e.minion, hidden: e.hidden, mimicItem: e.mimicItem || null })),
      })),
    };
  }
  function snapshotRun() {
    if (!run || P.dead || !floor || G.mode !== 'play') return;
    meta.run = { floorN: run.floorN, content: run.content, eq: run.eq, bag: run.bag, potions: run.potions, hp: Math.max(1, Math.round(P.hp)), kills: run.kills,
      gold: run.gold, forged: run.forged, usedFallbacks: run.usedFallbacks, startedAt: run.startedAt, floorKills: run.floorKills || 0, rerolled: run.rerolled || 0, playSecs: run.playSecs || 0, cls: run.cls, spell2: run.spell2 || null, bless: run.bless, lastEvent: run.lastEvent || '', floor: snapFloor() };
  }
  function saveRun() {
    if (!run || P.dead) return;
    saveMeta(true);
  }
  function restoreFloor(sf) {
    const cells = new Map(), key = (x, y) => x + ',' + y;
    const rooms = sf.rooms.map((d) => {
      const r = Object.assign({}, d, { tiles: Uint8Array.from(d.tiles), bg: null, effects: [], enemies: [], locked: false,
        pickups: d.pickups.map((p) => Object.assign({}, p, { t: 1 })) });
      cells.set(key(r.gx, r.gy), r); return r;
    });
    const f = { rooms, start: rooms.find((r) => r.type === 'start') || rooms[0], cells, get: (x, y) => cells.get(key(x, y)) };
    rooms.forEach((r, i) => {
      r.enemies = sf.rooms[i].enemies.map((d) => {
        const e = makeEnemy(d.spec, d.x, d.y, { elite: d.elite, boss: d.boss, child: d.child, minion: d.minion });
        e.hp = Math.min(e.maxHp, d.hp); e.hidden = !!d.hidden; e.spawnT = 0.6; if (d.mimicItem) e.mimicItem = d.mimicItem;
        return e;
      });
    });
    return f;
  }
  function enterFloor(hp, saved) {
    floor = null; room = null;
    if (saved && saved.rooms) {
      try { floor = restoreFloor(saved); } catch (e) { floor = null; }
    }
    if (!floor) {
      saved = null;
      floor = buildFloor(run.floorN);
      floor.rooms.forEach((r) => buildTiles(r, run.content.theme));
      floor.rooms.forEach((r) => { r.bg = null; });
    }
    P.dead = false; P.hp = Math.min(hp, stats().maxHp); P.mana = stats().maxMana; P.novaCd = 0; P.castT = 0; P.inv = 1; P.poison = 0; P.swing = null; P.bash = null; P.vx = P.vy = 0; P.cd = 0; P.bashCd = 0; P.spellCd = 0; P.ward = 0; P.roll = null; P.turrets = []; P.burnT = 0; P.rootT = 0; P.curseT = 0;
    fx.projectiles.length = 0; fx.particles.length = 0; fx.texts.length = 0;
    meta.stats.deepest = Math.max(meta.stats.deepest, run.floorN);
    if (!saved) bump(run.content.fromAI && run.content.fromAI.theme ? 'floorsAI' : 'floorsHand');
    G.mode = 'play';
    if (saved) {
      const r = floor.get(saved.cur[0], saved.cur[1]) || floor.start;
      enterRoom(r, null);
      P.x = saved.px; P.y = saved.py; P.inv = 1.5;
      const boss = r.enemies.find((e) => e.boss); if (boss) DF.UI.bossBar(boss);
    } else enterRoom(floor.start, null);
    saveRun();
    const th = run.content.theme;
    DF.UI.banner(`Floor ${run.floorN}`, th.name, th.description + ' ' + DF.RULE_TEXT[th.rule]);
    SND.song({ seed: th.name, element: th.element, fast: th.rule === 'swift foes' });
    // Once at the bottom of a floor, ask the AI for the one after that.
    updateHUD(true);
    fx.fade = 1; fx.fadeDir = -1;
  }
  function descend() {
    if (!run) return;
    SND.stairs();
    fade(() => {
      run.floorN++;
      const c = run.next; c.prio = 6;
      run.content = materialize(c, run.usedFallbacks);
      if (run.content.fallback) run.usedFallbacks.push(run.content.fallback);
      if (run.live) run.live.dead = true;
      run.live = c; // treasure the AI finishes while you play this floor still turns up in chests
      run.next = newContent(run.floorN + 1); dream(run.next);
      run.floorKills = 0; bump('descents');
      enterFloor(P.hp + Math.round(stats().maxHp * 0.25)); // a short rest on the stairs
    });
  }
  function endRunRecords() {
    if (!run) return;
    const rec = meta.records, secs = run.playSecs || 0;
    const score = (r) => r.floorN * 1000 + r.kills;
    const mine = { floorN: run.floorN, kills: run.kills, gold: run.gold, forged: run.forged, secs, theme: run.content.theme.name };
    if (!rec.bestRun || score(mine) > score(rec.bestRun)) rec.bestRun = mine;
    if (secs > (rec.longestRun || 0)) rec.longestRun = secs;
  }
  /* ---- Rerolling a floor: swap a bad floor for a new one, for gold, before you've taken anything from it ---- */
  const roomTouched = (r) => r.cleared || (r.chest && r.chest.open) || (r.altar && r.altar.uses < 2) || r.stairs || (r.shop && r.shop.stalls.some((x) => x.sold)) || (r.fire && r.fire.used) || (r.event && r.event.touched);
  const rerollCost = () => (run ? 30 * run.floorN : 0);
  function rerollBlock() {
    if (!run || !floor) return 'There\u2019s no floor to reroll.';
    if (run.rerolled === run.floorN) return 'You\u2019ve already rerolled this floor.';
    const touched = (run.floorKills || 0) > 0 || floor.rooms.some(roomTouched);
    if (touched) return 'You can only reroll a floor before you\u2019ve defeated anything or opened anything on it.';
    if (meta.gold < rerollCost()) return `You need ${rerollCost() - meta.gold} more gold to reroll.`;
    return '';
  }
  function savedRerollBlock() {
    const s = meta.run; if (!s) return 'There\u2019s no run to reroll.';
    const cost = 30 * s.floorN;
    if (s.rerolled === s.floorN) return 'You\u2019ve already rerolled this floor.';
    const touched = (s.floorKills || 0) > 0 || (s.floor && s.floor.rooms.some(roomTouched));
    if (touched) return 'You can only reroll a floor before you\u2019ve defeated anything or opened anything on it.';
    if (meta.gold < cost) return `You need ${cost - meta.gold} more gold to reroll.`;
    return '';
  }
  async function rerollSaved() {
    const why = savedRerollBlock(); if (why) return why;
    await startRun(true);
    return rerollFloor();
  }
  async function rerollFloor() {
    const why = rerollBlock(); if (why) return why;
    meta.gold -= rerollCost(); run.rerolled = run.floorN; SND.coin(0.5); bump('rerolls');
    // Use the floor the AI already dreamed up for later if it's ready (instant); otherwise dream a new one.
    let c;
    if (run.next && run.next.theme && contentReady(run.next)) { c = run.next; c.n = run.floorN; run.next = newContent(run.floorN + 1); dream(run.next); }
    else {
      c = newContent(run.floorN); c.prio = 6; dream(c);
      if (AI.ready() && (AI.settings.mode === 'cloud' || AI.local.engine)) await DF.UI.waitForDream(() => contentReady(c), 9000);
    }
    if (run.live) run.live.dead = true;
    run.content = materialize(c, run.usedFallbacks);
    if (run.content.fallback) run.usedFallbacks.push(run.content.fallback);
    run.live = c; run.floorKills = 0;
    fade(() => enterFloor(P.hp));
    return '';
  }
  function die() {
    if (P.dead) return;
    P.dead = true; SND.die(); fx.shake = 0.6;
    for (let i = 0; i < 30; i++) burst(P.x, P.y, '#e2483f', 1);
    const summary = { floorN: run.floorN, kills: run.kills, gold: run.gold, forged: run.forged, theme: run.content.theme.name, mins: Math.max(1, Math.round((Date.now() - run.startedAt) / 60000)), by: P.lastHit || '' };
    bump('deaths');
    const rec = meta.records, by = P.lastHit || 'Something unseen';
    rec.killedBy[by] = (rec.killedBy[by] || 0) + 1;
    endRunRecords();
    meta.run = null; saveMeta(true);
    if (run.next) run.next.dead = true;
    if (run.live) run.live.dead = true;
    AI.clearQueue(3);
    setTimeout(() => { G.mode = 'dead'; SND.song(null); DF.UI.showDeath(summary); run = null; prepareNextRun(); }, 1300);
  }
  function stopDreams() { if (run) { if (run.next) run.next.dead = true; if (run.live) run.live.dead = true; } }
  function quitRun() { // from the pause menu: back to camp, keeping the run saved
    saveRun(); stopDreams(); G.mode = 'camp'; run = null; AI.clearQueue(3); prepareNextRun(); DF.UI.showCamp();
  }
  function abandonRun() {
    stopDreams(); endRunRecords();
    run = null; meta.run = null; saveMeta(true); G.mode = 'camp'; AI.clearQueue(3); prepareNextRun(); DF.UI.showCamp();
  }

  /* ================= Rooms ================= */
  function enterRoom(r, from) {
    room = r;
    if (!r.bg) r.bg = renderRoomBg(r);
    if (from) { // arrive just inside the door you came through (from = the side of this room)
      const [tx, ty] = DOOR_TILE[from];
      P.x = tx * T + T / 2 + (from === 'w' ? T : from === 'e' ? -T : 0);
      P.y = ty * T + T / 2 + (from === 'n' ? T : from === 's' ? -T : 0);
    } else { P.x = 7 * T + T / 2; P.y = 6 * T + T / 2 + 4; }
    r.seen = true;
    for (const d in r.doors) { const o = floor.get(r.gx + DIRS[d][0], r.gy + DIRS[d][1]); if (o) o.seen = true; }
    fx.projectiles.length = 0; P.turrets = []; P.roll = null;
    if (!r.visited) {
      r.visited = true;
      if (r.type === 'fight') spawnFight(r, from);
      if (r.type === 'boss') spawnBoss(r);
      if (r.type === 'treasure') r.chest = { x: 7 * T + 4, y: 5 * T + 4, open: false, mimic: rnd() < 0.12 + run.floorN * 0.01 };
      if (r.type === 'forge') r.altar = { x: 7 * T + 4, y: 5 * T + 4, uses: 2 };
      if (r.type === 'shop') { r.shop = makeShop(); if (!meta.tips.shop) { meta.tips.shop = 1; saveMeta(); DF.UI.toast('A merchant! Walk up to a stall to buy. Gold spent here is gold you won\u2019t have for camp upgrades.', 5000); } }
      if (r.type === 'camp') { r.fire = { x: 7 * T + 4, y: 5 * T + 4, used: false }; if (!meta.tips.camp) { meta.tips.camp = 1; saveMeta(); DF.UI.toast('A campfire. Rest here once to heal half your health and shake off poison.', 4500); } }
      if (r.type === 'event') r.event = makeEvent();
      if (r.type === 'start' && run.floorN === 1 && !meta.tips.move) { meta.tips.move = 1; saveMeta(); DF.UI.toast(DF.UI.isTouch() ? 'Left thumb moves, right thumb swings. Clear rooms, find the forge, beat the boss.' : 'WASD or arrows to move, J or Space to swing, K or Shift to shield-bash.', 6000); }
    }
    r.locked = r.enemies.length > 0;
    if (r.locked) SND.door();
    // Old foes: say how many times you've beaten each (new ones get their own Monster Book note).
    const seen = new Set(), known = [];
    r.enemies.forEach((e) => {
      const k = norm(e.spec.name); if (seen.has(k)) return; seen.add(k);
      const b = meta.books.mon[k];
      if (b && b.kills > 0 && !e.boss) known.push(`<b>${DF.UI.esc(e.spec.name)}</b> <span class="rec">defeated ${b.kills}</span>`);
      recordMonster(e.spec);
    });
    if (known.length) DF.UI.toast(`<span><small>Old foes</small>${known.slice(0, 3).join('<br>')}</span>`, 2600, true);
    drawMinimap();
  }
  function freeSpots(r, from, minDist) {
    const out = [], ex = from ? DOOR_TILE[from] : [7, 5];
    for (let y = 2; y < RH - 2; y++) for (let x = 2; x < RW - 2; x++) {
      if (r.tiles[y * RW + x] !== TL.FLOOR) continue;
      if (r.props && r.props.some((p) => !p.broken && p.tx === x && p.ty === y)) continue;
      if (Math.hypot(x - ex[0], y - ex[1]) < minDist) continue;
      out.push([x * T + T / 2, y * T + T / 2]);
    }
    return out;
  }
  function spawnFight(r, from) {
    const n = run.floorN, mons = run.content.monsters;
    const spots = freeSpots(r, from, 5);
    // One or two kinds per room, the weaker kinds more often.
    const weights = mons.map((m) => (m.tier === 1 ? 3 : m.tier === 2 ? 2 : 1));
    const choose = () => { let t = rnd() * weights.reduce((a, b) => a + b, 0); for (let i = 0; i < mons.length; i++) { t -= weights[i]; if (t <= 0) return mons[i]; } return mons[0]; };
    const kinds = [choose()]; if (rnd() < 0.55) kinds.push(choose());
    // Deeper floors pack in more monsters (up to 14 a room) and more elites.
    const deep = Math.max(0, n - 8);
    let budget = 3 + Math.min(5, Math.floor(n * 0.7)) + (r.dist > 3 ? 1 : 0) + Math.floor(deep / 2);
    const maxMade = Math.min(14, 9 + Math.floor(deep / 3));
    const eliteRoom = n >= 2 && rnd() < Math.min(0.55, 0.14 + Math.max(0, n - 5) * 0.025);
    const elites = eliteRoom ? 1 + Math.floor(Math.max(0, n - 10) / 5) : 0;
    let made = 0, eliteMade = 0;
    while (budget > 0 && spots.length && made < maxMade) {
      const spec = pick(kinds), cost = spec.tier;
      if (spec.behaviour === 'swarm') {
        const [x, y] = spots.splice(rint(spots.length), 1)[0];
        for (let k = 0; k < 3; k++) r.enemies.push(makeEnemy(spec, x + (rnd() - 0.5) * 6, y + (rnd() - 0.5) * 6, {}));
        made += 3; budget -= 2;
      } else {
        const [x, y] = spots.splice(rint(spots.length), 1)[0];
        const elite = eliteMade < elites; if (elite) eliteMade++;
        r.enemies.push(makeEnemy(spec, x, y, { elite })); made++; budget -= cost;
      }
    }
  }
  function spawnBoss(r) {
    const b = run.content.boss;
    r.enemies.push(makeEnemy(b, 7 * T + 4, 3 * T + 4, { boss: true }));
    DF.UI.bossBar(r.enemies[0]);
    SND.bossRoar(); fx.shake = 0.5;
  }
  function makeEnemy(spec, x, y, o) {
    const n = run.floorN, tier = spec.tier || 2;
    const sprite = DF.monsterSprite(spec, o.elite ? 'elite' : '');
    const scale = o.boss ? 3 : 1;
    const body = DF.bodyType(spec);
    const e = { spec, x, y, vx: 0, vy: 0, beh: spec.behaviour, abil: new Set(spec.abilities || []), boss: !!o.boss, elite: !!o.elite, child: !!o.child, minion: !!o.minion,
      scale, flying: FLYERS.has(body), w: sprite.w * scale, h: sprite.h * scale, dir: x > P.x ? -1 : 1, t: rnd() * 2, t2: rnd() * 3, t3: rnd() * 4, state: 'move',
      hidden: false, shield: 0, burn: 0, burnTick: 0, slow: 0, stun: 0, flash: 0, trailT: 0, spawnT: 0.5, wob: rnd() * 6 };
    e.r = Math.max(2.5, Math.min(sprite.w, sprite.h) * scale / 2 - 0.5);
    // A creature from the bestiary keeps its signature ability, even when the AI invented it ("Cinder Skeleton" still gets back up).
    const prof = DF.bestiaryFor(spec.name);
    if (prof && !o.minion) prof.a.forEach((x) => { if (e.abil.size < 3 && DF.ABILITIES.includes(x)) e.abil.add(x); });
    if (e.abil.has('mutates')) { // Chaos Spawn: two random powers, different every floor
      e.abil.delete('mutates'); const r = DF.seeded(spec.name + '#' + run.floorN), pool = DF.ABILITIES.filter((x) => !['mutates', 'splits when hit'].includes(x));
      for (let k = 0; k < 2; k++) e.abil.add(pool[r(pool.length)]);
    }
    const hpBase = [10, 18, 30][tier - 1] * (1 + 0.42 * (n - 1));
    let hp = hpBase, dmg = [3, 4, 6][tier - 1] * (1 + 0.2 * (n - 1)), spd = [27, 24, 20][tier - 1];
    if (e.beh === 'swarm') { hp *= 0.45; dmg *= 0.7; spd = 32; }
    if (e.beh === 'tank') { hp *= 2; spd = 13; }
    if (e.beh === 'shooter' || e.beh === 'summoner') spd = 20;
    if (e.beh === 'ambusher') { e.hidden = true; }
    if (o.elite) { hp *= 2.5; dmg *= 1.3; const extra = DF.ABILITIES.filter((a) => !e.abil.has(a) && !['splits when hit', 'mutates'].includes(a)); e.abil.add(pick(extra)); }
    if (o.boss) { hp = 90 * (1 + 0.48 * (n - 1)) * (spec.named ? 1.3 : 1); dmg = 6 * (1 + 0.2 * (n - 1)); spd = e.beh === 'tank' ? 15 : 19; e.r = Math.max(e.r, 5); }
    // Past floor 10 monsters toughen faster: +6% health and +9% damage per floor, compounding.
    const past = Math.max(0, n - 10);
    if (past) { hp *= Math.pow(1.06, past); dmg *= Math.pow(1.09, past); }
    // Every 5 floors down, monsters learn one more ability (the same ones for a kind on a given floor).
    const bonus = Math.min(2, Math.floor((n - 1) / 5));
    if (bonus && !o.minion) {
      const r = DF.seeded(spec.name + '#' + n);
      const pool = DF.ABILITIES.filter((a) => !e.abil.has(a) && a !== 'mutates' && !(o.boss && a === 'burrows') && !(a === 'splits when hit' && (o.boss || o.child)));
      for (let k = 0; k < bonus && pool.length && e.abil.size < 4; k++) e.abil.add(pool.splice(r(pool.length), 1)[0]);
    }
    if (o.child) { hp *= 0.35; e.splitDone = true; }
    if (o.minion) { hp *= 0.4; dmg *= 0.6; e.minion = true; spd = 30; }
    if (run.content.theme.rule === 'swift foes') spd *= 1.3;
    e.hp = e.maxHp = Math.round(hp); e.dmg = Math.max(1, Math.round(dmg)); e.spd = spd;
    e.gold = Math.max(1, Math.round((tier + rint(3)) * (1 + n * 0.15) * (o.elite ? 3 : 1) * (o.boss ? 8 : 1) * (o.minion || o.child ? 0.3 : 1)));
    return e;
  }

  /* ================= Collision ================= */
  const tileAt = (tx, ty) => (tx < 0 || ty < 0 || tx >= RW || ty >= RH ? TL.WALL : room.tiles[ty * RW + tx]);
  function solidFor(e, tx, ty) {
    const t = tileAt(tx, ty);
    if (t === TL.WALL || t === TL.BLOCK || t === TL.BRAZIER) return true;
    if (t === TL.PIT) return !e.flying;
    if (isDoorTile(tx, ty)) return e !== P || room.locked;
    if (propAt(tx, ty)) return true;
    return false;
  }
  function hits(e, x, y) {
    const r = e.r, x0 = Math.floor((x - r) / T), x1 = Math.floor((x + r - 0.01) / T), y0 = Math.floor((y - r) / T), y1 = Math.floor((y + r - 0.01) / T);
    for (let ty = y0; ty <= y1; ty++) for (let tx = x0; tx <= x1; tx++) if (solidFor(e, tx, ty)) return true;
    return false;
  }
  function move(e, dx, dy) {
    let hitX = false, hitY = false;
    const steps = Math.max(1, Math.ceil(Math.max(Math.abs(dx), Math.abs(dy)) / 2));
    for (let s = 0; s < steps; s++) {
      const sx = dx / steps, sy = dy / steps;
      if (sx && !hitX) { if (!hits(e, e.x + sx, e.y)) e.x += sx; else hitX = true; }
      if (sy && !hitY) { if (!hits(e, e.x, e.y + sy)) e.y += sy; else hitY = true; }
    }
    // Slide round corners: a nudge along the wall helps you through doors.
    if (e === P && (hitX || hitY)) {
      // Clipped a corner by a pixel or two? Slip round it instead of stopping dead.
      const tryNudge = (blockedX) => {
        for (let k = 1; k <= 3; k++) for (const n of [1, -1]) {
          const ox = blockedX ? Math.sign(dx) * 0.6 : n * k, oy = blockedX ? n * k : Math.sign(dy) * 0.6;
          if (!hits(e, e.x + ox, e.y + oy)) { if (blockedX) { if (!hits(e, e.x, e.y + n * 0.7)) e.y += n * 0.7; } else if (!hits(e, e.x + n * 0.7, e.y)) e.x += n * 0.7; return; }
        }
      };
      if (hitX && Math.abs(dx) >= Math.abs(dy) * 0.5) tryNudge(true);
      if (hitY && Math.abs(dy) >= Math.abs(dx) * 0.5) tryNudge(false);
    }
    return hitX || hitY;
  }
  function lineClear(a, b) {
    const n = Math.ceil(dist(a, b) / 3);
    for (let i = 1; i < n; i++) { const x = a.x + (b.x - a.x) * i / n, y = a.y + (b.y - a.y) * i / n, t = tileAt(Math.floor(x / T), Math.floor(y / T)); if (t === TL.WALL || t === TL.BLOCK || t === TL.BRAZIER) return false; }
    return true;
  }
  // Somewhere a dropped thing can lie: plain floor (not a wall, pillar, pit, pool, crate or doorway).
  const restTile = (tx, ty) => tx >= 1 && ty >= 1 && tx <= RW - 2 && ty <= RH - 2 && room.tiles[ty * RW + tx] === TL.FLOOR && !propAt(tx, ty) && !isDoorTile(tx, ty);
  // Move a dropped item, coin or heart off walls and holes onto the nearest open floor.
  function settlePickup(p) {
    p.settled = true;
    const tx = Math.floor(p.x / T), ty = Math.floor(p.y / T);
    // Item icons stand taller than a tile, so keep them off the top row where they'd poke into the wall.
    const ok = (x, y) => restTile(x, y) && !(p.kind === 'item' && y < 2);
    if (ok(tx, ty)) { const cx = tx * T + T / 2, cy = ty * T + T / 2; p.x = cx + clamp(p.x - cx, -3, 3); p.y = cy + clamp(p.y - cy, -3, 3); return; }
    let best = null, bd = Infinity;
    for (let r = 1; r <= 7 && !best; r++) for (let y = ty - r; y <= ty + r; y++) for (let x = tx - r; x <= tx + r; x++) {
      if (Math.max(Math.abs(x - tx), Math.abs(y - ty)) !== r || !ok(x, y)) continue;
      const d = Math.hypot(x * T + T / 2 - p.x, y * T + T / 2 - p.y); if (d < bd) { bd = d; best = { x, y }; }
    }
    if (best) { p.x = best.x * T + T / 2 + (rnd() - 0.5) * 3; p.y = best.y * T + T / 2 + (rnd() - 0.5) * 3; }
  }
  function randomFloorNear(cx, cy, minD, maxD) {
    for (let k = 0; k < 40; k++) {
      const a = rnd() * Math.PI * 2, d = minD + rnd() * (maxD - minD), x = cx + Math.cos(a) * d, y = cy + Math.sin(a) * d;
      const tx = Math.floor(x / T), ty = Math.floor(y / T);
      if (tx < 1 || ty < 1 || tx > RW - 2 || ty > RH - 2) continue;
      if (room.tiles[ty * RW + tx] === TL.FLOOR && !propAt(tx, ty)) return { x: tx * T + T / 2, y: ty * T + T / 2 };
    }
    return null;
  }

  /* ================= Effects ================= */
  function burst(x, y, color, n, speed, glow) {
    for (let i = 0; i < (n || 6); i++) {
      const a = rnd() * Math.PI * 2, s = (speed || 30) * (0.3 + rnd());
      fx.particles.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 6, life: 0.3 + rnd() * 0.4, max: 0.7, color, size: rnd() < 0.3 ? 2 : 1, glow: !!glow, g: 40 });
    }
  }
  function floatText(x, y, text, color, big) { fx.texts.push({ x, y, text: String(text), color, life: big ? 1.1 : 0.8, max: big ? 1.1 : 0.8, big: !!big }); }
  function fade(cb) { fx.fadeDir = 1; fx.fadeCb = cb; }

  /* ================= The Knight ================= */
  function hurtPlayer(dmg, src, kind) {
    if (P.dead || P.inv > 0 || (P.bash && P.bash.t > 0)) return;
    const s = stats();
    const foe = src && (src.abil ? src : src.owner && src.owner.abil ? src.owner : null);
    if (foe && foe.abil.has('pack hunter')) { const pack = room.enemies.filter((x) => x !== foe && !x.dead && x.spec.name === foe.spec.name && dist(x, foe) < 50).length; dmg *= 1 + 0.25 * pack; }
    // Defence softens hits with diminishing returns, so a full set of 8 armour pieces helps without making you untouchable.
    const d = Math.max(1, Math.round(dmg * 18 / (18 + s.defence * 0.55)));
    P.hp -= d; P.inv = 0.8; P.flash = 0.15; fx.shake = Math.max(fx.shake, 0.25); fx.hitstop = 0.05;
    bump('dmgTaken', d);
    P.lastHit = (src && src.spec && src.spec.name) || (src && src.from) || (kind === 'hazard' ? 'Hazard pools' : 'The floor itself');
    if (kind === 'poison') P.poisonFrom = P.lastHit;
    floatText(P.x, P.y - 8, '-' + d, '#ff5a5a');
    SND.hurt();
    if (src && src.x != null) { const a = Math.atan2(P.y - src.y, P.x - src.x); P.vx += Math.cos(a) * 90; P.vy += Math.sin(a) * 90; P.knockT = 0.12; }
    if (kind === 'poison') P.poison = 3;
    if (foe && P.hp > 0) onHitBy(foe, d);
    if (P.hp <= 0) { P.hp = 0; die(); }
    updateHUD();
  }
  // What a monster's hit does besides damage: its abilities, then a touch of its element.
  function onHitBy(e, d) {
    const a = e.abil, by = e.spec.name;
    if (a.has('drains life') && !e.dead) { const got = Math.min(e.maxHp - e.hp, Math.max(1, Math.round(d * 1.5))); if (got > 0) { e.hp += got; floatText(e.x, e.y - e.h - 4, '+' + got, '#72e07e'); if (e.boss) DF.UI.bossBar(e); } burst(P.x, P.y - 3, '#c83a5a', 6, 25, true); }
    if (a.has('slows you')) { P.slowT = Math.max(P.slowT, 1.6); burst(P.x, P.y - 2, '#bfefff', 5, 15, true); }
    if (a.has('stuns') && rnd() < 0.55 && !(P.rootT > 0)) { P.rootT = 0.7; floatText(P.x, P.y - 12, 'Held!', '#ffe14a'); }
    if (a.has('curses')) { if (!(P.curseT > 0)) floatText(P.x, P.y - 12, 'Cursed!', '#b48bff'); P.curseT = 5; updateHUD(true); }
    if (a.has('steals gold') && meta.gold > 0) { const take = Math.min(meta.gold, 2 + run.floorN); meta.gold -= take; e.stolen = (e.stolen || 0) + take; floatText(P.x, P.y - 14, '-' + take + 'g', '#ffcf4a', true); SND.coin(P.x / LW); updateHUD(); }
    // The element adds a little something, now and then.
    if (rnd() < 0.3) {
      const el = e.spec.element;
      if (el === 'fire') { P.burnT = Math.max(P.burnT, 2); P.burnFrom = by; }
      else if (el === 'ice') P.slowT = Math.max(P.slowT, 1);
      else if (el === 'lightning') P.rootT = Math.max(P.rootT, 0.3);
      else if (el === 'poison' && !a.has('poisons')) { P.poison = Math.max(P.poison, 1.5); P.poisonFrom = by; }
      else if (el === 'shadow' && !e.dead && e.hp < e.maxHp) e.hp = Math.min(e.maxHp, e.hp + Math.max(1, Math.round(d * 0.5)));
    }
  }
  function healPlayer(n, quiet) {
    const s = stats(), before = P.hp;
    P.hp = Math.min(s.maxHp, P.hp + n);
    const got = Math.round(P.hp - before);
    if (got > 0 && !quiet) floatText(P.x, P.y - 8, '+' + got, '#72e07e');
    updateHUD();
    return got;
  }
  function usePotion() {
    if (!run || P.dead || run.potions <= 0) return;
    const s = stats(); if (P.hp >= s.maxHp) { DF.UI.toast('You’re already at full health.'); return; }
    bump('potions'); run.potions--; healPlayer(Math.round(s.maxHp * 0.45)); P.poison = 0; SND.heart();
    for (let i = 0; i < 14; i++) burst(P.x, P.y, '#ff6a8a', 1, 20, true);
    updateHUD(true);
  }
  function weaponFeel() { const w = run && run.eq.weapon; return WEAPON_FEEL[(w && w.icon) || 'sword'] || WEAPON_FEEL.sword; }
  function nearestEnemy(range) {
    let best = null, bd = range;
    for (const e of room.enemies) { if (e.hidden || e.spawnT > 0) continue; const d = dist(P, e) - e.r; if (d < bd && lineClear(P, e)) { bd = d; best = e; } }
    return best;
  }
  function startSwing() {
    bump('swings');
    const feel = weaponFeel(), w = run.eq.weapon;
    const target = nearestEnemy(feel.range + 16);
    if (target) { const a = Math.atan2(target.y - P.y, target.x - P.x); P.fx = Math.cos(a); P.fy = Math.sin(a); if (Math.abs(P.fx) > 0.15) P.dir = Math.sign(P.fx); }
    const ang = Math.atan2(P.fy, P.fx);
    P.swing = { t: 0, dur: 0.16, ang, hit: new Set(), range: feel.range, arc: feel.arc, side: (P.swingSide = -(P.swingSide || 1)) };
    P.cd = feel.cd;
    SND.swing(P.x / LW);
    // Weapons with wave powers throw blade waves.
    if (w && (w.powers.includes('pierce') || w.powers.includes('bounce') || w.powers.includes('multishot'))) {
      const angles = w.powers.includes('multishot') ? [ang - 0.32, ang, ang + 0.32] : [ang];
      const col = DF.EL_COLOR[w.element] || '#e8f0ff';
      angles.forEach((a) => fx.projectiles.push({ x: P.x + Math.cos(a) * 5, y: P.y - 2 + Math.sin(a) * 5, vx: Math.cos(a) * 115, vy: Math.sin(a) * 115, life: 0.42, mine: true,
        pierce: w.powers.includes('pierce'), bounce: w.powers.includes('bounce') ? 2 : 0, hit: new Set(), color: col, dmg: 0.55, r: 2.5, wave: true }));
      SND.wave(P.x / LW);
    }
  }
  /* ---- The Mage ---- */
  const boltColor = () => { const w = run.eq.weapon; return (w && w.element !== 'none' && DF.EL_COLOR[w.element]) || '#c9a8ff'; };
  function castBolt() {
    const w = run.eq.weapon, pw = (w && w.powers) || [];
    const t = nearestEnemy(110);
    const ang = t ? Math.atan2(t.y - 2 - (P.y - 4), t.x - P.x) : Math.atan2(P.fy, P.fx);
    if (t) { P.fx = Math.cos(ang); P.fy = Math.sin(ang); if (Math.abs(P.fx) > 0.15) P.dir = Math.sign(P.fx); }
    const multi = pw.includes('multishot'), angles = multi ? [ang - 0.22, ang, ang + 0.22] : [ang], col = boltColor();
    angles.forEach((a) => fx.projectiles.push({ x: P.x + Math.cos(a) * 4, y: P.y - 4 + Math.sin(a) * 4, vx: Math.cos(a) * 130, vy: Math.sin(a) * 130, life: 0.85, mine: true, bolt: true,
      pierce: pw.includes('pierce'), bounce: pw.includes('bounce') ? 2 : 0, hit: new Set(), color: col, dmg: multi ? 0.6 : 0.85, r: 2 }));
    P.cd = 0.34; P.castT = 0.12; bump('swings'); SND.wave(P.x / LW);
  }
  function blink(mx, my) {
    let dx = mx, dy = my, l = Math.hypot(dx, dy);
    if (l < 0.2) { dx = P.fx; dy = P.fy; l = Math.hypot(dx, dy) || 1; }
    dx /= l; dy /= l;
    const ox = P.x, oy = P.y;
    for (let d = 34; d >= 6; d -= 2) {
      const x = P.x + dx * d, y = P.y + dy * d;
      if (x < T + 3 || x > LW - T - 3 || y < T + 3 || y > LH - T - 3) continue;
      if (!hits(P, x, y)) { P.x = x; P.y = y; break; }
    }
    if (P.x === ox && P.y === oy) return;
    P.inv = Math.max(P.inv, 0.35); P.bashCd = 1.6; bump('bashes');
    for (let i = 0; i < 12; i++) { burst(ox, oy - 3, '#c9a8ff', 1, 30, true); burst(P.x, P.y - 3, '#ffffff', 1, 25, true); }
    SND.blink(P.x / LW);
  }
  function nova() {
    if (P.mana < 25) { if (!P.noManaT || time > P.noManaT) { floatText(P.x, P.y - 10, 'No mana', '#8fb8ff'); P.noManaT = time + 0.8; } return; }
    P.mana -= 25; P.novaCd = 0.6; P.castT = 0.25;
    const col = boltColor(), n = 12;
    for (let k = 0; k < n; k++) {
      const a = k / n * Math.PI * 2;
      fx.projectiles.push({ x: P.x + Math.cos(a) * 4, y: P.y - 3 + Math.sin(a) * 4, vx: Math.cos(a) * 95, vy: Math.sin(a) * 95, life: 0.45, mine: true, bolt: true, pierce: true, bounce: 0, hit: new Set(), color: col, dmg: 1.0, r: 2.5 });
    }
    fx.shake = Math.max(fx.shake, 0.15); bump('swings'); SND.zap(P.x / LW);
  }
  /* ---- The Ranger ---- */
  // What each hero's three buttons are called, and how long the second and third take to come back.
  const CLASS_UI = {
    knight: { atk: 'Swing', alt: 'Bash', altLong: 'Shield bash', altCd: 2.2, keys: '<kbd>J</kbd> swing <kbd>K</kbd> bash' },
    mage: { atk: 'Cast', alt: 'Blink', altCd: 1.6, skill: 'Nova', keys: '<kbd>J</kbd> cast <kbd>K</kbd> blink <kbd>L</kbd> nova' },
    ranger: { atk: 'Shoot', alt: 'Roll', altLong: 'Dodge roll', altCd: 1.1, skill: 'Volley', skillCd: 4, keys: '<kbd>J</kbd> shoot <kbd>K</kbd> roll <kbd>L</kbd> volley' },
    tinkerer: { atk: 'Whack', alt: 'Turret', altLong: 'Build a turret', altCd: 6, skill: 'Bomb', skillCd: 3.5, keys: '<kbd>J</kbd> whack <kbd>K</kbd> turret <kbd>L</kbd> bomb' },
  };
  const classUI = () => CLASS_UI[(run && run.cls) || 'knight'] || CLASS_UI.knight;
  const arrowColor = () => { const w = run.eq.weapon; return (w && w.element !== 'none' && DF.EL_COLOR[w.element]) || '#e8e0c8'; };
  function shootArrows(angles, dmg, speed) {
    const w = run.eq.weapon, pw = (w && w.powers) || [], col = arrowColor();
    angles.forEach((a) => fx.projectiles.push({ x: P.x + Math.cos(a) * 4, y: P.y - 4 + Math.sin(a) * 4, vx: Math.cos(a) * speed, vy: Math.sin(a) * speed, life: 0.9, mine: true, arrow: true,
      pierce: pw.includes('pierce'), bounce: pw.includes('bounce') ? 2 : 0, hit: new Set(), color: col, dmg, r: 2 }));
  }
  function aimAt(range) {
    const t = nearestEnemy(range);
    const ang = t ? Math.atan2(t.y - 2 - (P.y - 4), t.x - P.x) : Math.atan2(P.fy, P.fx);
    if (t) { P.fx = Math.cos(ang); P.fy = Math.sin(ang); if (Math.abs(P.fx) > 0.15) P.dir = Math.sign(P.fx); }
    return ang;
  }
  function shoot() {
    const w = run.eq.weapon, multi = w && w.powers.includes('multishot'), ang = aimAt(130);
    shootArrows(multi ? [ang - 0.18, ang, ang + 0.18] : [ang], multi ? 0.6 : 0.9, 175);
    P.cd = 0.38; P.castT = 0.12; bump('swings'); SND.swing(P.x / LW);
  }
  function roll(mx, my) {
    let dx = mx, dy = my, l = Math.hypot(dx, dy);
    if (l < 0.2) { dx = P.fx; dy = P.fy; l = Math.hypot(dx, dy) || 1; }
    P.roll = { t: 0.24, dx: dx / l, dy: dy / l }; P.bashCd = 1.1; P.inv = Math.max(P.inv, 0.3); bump('bashes');
    SND.blink(P.x / LW);
  }
  function volley() {
    const ang = aimAt(130), n = 7;
    shootArrows(Array.from({ length: n }, (_, k) => ang + (k - (n - 1) / 2) * 0.16), 0.7, 165);
    P.novaCd = 4; P.castT = 0.25; bump('swings'); SND.wave(P.x / LW); fx.shake = Math.max(fx.shake, 0.1);
  }
  /* ---- The Tinkerer ---- */
  function buildTurret() {
    const x = clamp(P.x + P.dir * 6, T + 4, LW - T - 4), y = clamp(P.y, T + 4, LH - T - 4);
    P.turrets.push({ x, y, life: 10, t: 0.4, dir: P.dir });
    if (P.turrets.length > 2) P.turrets.shift();
    P.bashCd = 6; bump('bashes'); SND.chest ? SND.chest() : SND.pickup();
    for (let k = 0; k < 10; k++) burst(x, y - 3, '#ffcf4a', 1, 25, true);
  }
  function updateTurrets(dt) {
    for (const tu of P.turrets) {
      tu.life -= dt; tu.t -= dt;
      if (tu.t > 0) continue;
      let best = null, bd = 100;
      for (const e of room.enemies) { if (e.hidden || e.spawnT > 0) continue; const d = dist(tu, e); if (d < bd && lineClear(tu, e)) { bd = d; best = e; } }
      if (!best) { tu.t = 0.2; continue; }
      tu.t = 0.6; const a = Math.atan2(best.y - 2 - (tu.y - 5), best.x - tu.x); tu.dir = Math.cos(a) < 0 ? -1 : 1;
      fx.projectiles.push({ x: tu.x + Math.cos(a) * 3, y: tu.y - 5 + Math.sin(a) * 3, vx: Math.cos(a) * 140, vy: Math.sin(a) * 140, life: 0.8, mine: true, bolt: true, pierce: false, bounce: 0, hit: new Set(), color: '#ffcf4a', dmg: 0.45, r: 1.5, spellEl: (run.eq.weapon && run.eq.weapon.element) || 'none' });
      SND.clink(tu.x / LW);
    }
    P.turrets = P.turrets.filter((tu) => tu.life > 0);
  }
  function bomb() {
    const t = nearestEnemy(110), x = t ? t.x : clamp(P.x + P.fx * 28, 12, LW - 12), y = t ? t.y : clamp(P.y + P.fy * 28, 12, LH - 12);
    room.effects.push({ type: 'boom', x, y, r: 18, life: 0.7, dmg: Math.round(stats().attack * 1.9), mine: true, bomb: true, sx: P.x, sy: P.y - 4, from: 'Bomb' });
    P.novaCd = 3.5; P.castT = 0.2; bump('swings'); SND.swing(P.x / LW);
  }
  /* ---- Spell scrolls ---- */
  const randomSpell = () => pick(Object.keys(DF.SPELLS));
  const spellColor = (id) => DF.EL_COLOR[(DF.SPELLS[id] || {}).el] || '#c9a8ff';
  function dropScroll(x, y, id, charges) { room.pickups.push({ kind: 'scroll', spell: id || randomSpell(), charges: charges || DF.SCROLL_CHARGES, x, y, vy: -30, z: 0 }); }
  function learnScroll(p) {
    const old = run.spell2, def = DF.SPELLS[p.spell]; if (!def) return;
    const i = room.pickups.indexOf(p); if (i >= 0) room.pickups.splice(i, 1);
    run.spell2 = { id: p.spell, charges: p.charges || DF.SCROLL_CHARGES };
    if (old) room.pickups.push({ kind: 'scroll', spell: old.id, charges: old.charges, x: P.x - P.dir * 8, y: P.y + 2, t: -1.5 });
    bump('scrolls'); SND.forged ? SND.forged() : SND.pickup();
    for (let k = 0; k < 16; k++) burst(P.x, P.y - 4, spellColor(p.spell), 1, 35, true);
    const how = run.cls === 'mage' ? `costs ${def.cost} mana` : `${run.spell2.charges} charges`;
    DF.UI.toast(`<span><small>Spell learned \u00b7 ${how}</small><b style="color:${spellColor(p.spell)}">${def.name}</b> ${DF.UI.isTouch() ? 'on the new button' : 'on <kbd>' + (classUI().skill ? 'I' : 'L') + '</kbd>'}</span>`, 3200, true);
    updateHUD(true); saveRun();
  }
  function castSpell() {
    const sp = run.spell2; if (!sp || P.spellCd > 0) return;
    const def = DF.SPELLS[sp.id]; if (!def) { run.spell2 = null; return; }
    if (run.cls === 'mage') {
      if (P.mana < def.cost) { if (!P.noManaT || time > P.noManaT) { floatText(P.x, P.y - 10, 'No mana', '#8fb8ff'); P.noManaT = time + 0.8; } return; }
      P.mana -= def.cost;
    } else { if (sp.charges <= 0) return; sp.charges--; }
    P.spellCd = def.cd; P.castT = 0.25; bump('spells');
    const atk = stats().attack, col = spellColor(sp.id);
    if (sp.id === 'frost') {
      for (let k = 0; k < 24; k++) { const a = k / 24 * Math.PI * 2; fx.particles.push({ x: P.x, y: P.y - 3, vx: Math.cos(a) * 80, vy: Math.sin(a) * 80, life: 0.4, max: 0.4, color: k % 2 ? '#ffffff' : col, size: 1, glow: true, g: 0 }); }
      room.enemies.slice().forEach((e) => { if (!e.hidden && dist(P, e) < 32 + e.r) damageEnemy(e, atk * 1.1, { from: P, knock: 70, element: 'ice', powers: ['freeze'] }); });
      breakPropsNear(P.x, P.y, 30);
      SND.shield ? SND.shield(P.x / LW) : SND.zap(P.x / LW); fx.shake = Math.max(fx.shake, 0.15);
    } else if (sp.id === 'chain') {
      let from = { x: P.x, y: P.y - 4 }, t = nearestEnemy(120); const hit = new Set();
      for (let n = 0; n < 5 && t; n++) {
        hit.add(t);
        fx.particles.push({ bolt: true, x: from.x, y: from.y, x2: t.x, y2: t.y - 2, life: 0.22, max: 0.22, color: col });
        damageEnemy(t, atk * (n ? 0.8 : 1.2), { from, knock: 20, element: 'lightning', chained: true });
        from = { x: t.x, y: t.y - 2 };
        t = room.enemies.filter((x) => !hit.has(x) && !x.dead && !x.hidden && dist(x, from) < 52).sort((a, b) => dist(a, from) - dist(b, from))[0];
      }
      if (!hit.size) floatText(P.x, P.y - 10, 'No target', col);
      SND.zap(P.x / LW);
    } else if (sp.id === 'meteor') {
      const t = nearestEnemy(150), x = t ? t.x : clamp(P.x + P.fx * 30, 12, LW - 12), y = t ? t.y : clamp(P.y + P.fy * 30, 12, LH - 12);
      room.effects.push({ type: 'boom', x, y, r: 20, life: 0.55, dmg: Math.round(atk * 2.2), mine: true, from: 'Meteor' });
      SND.wave(x / LW);
    } else if (sp.id === 'seekers') {
      for (let k = 0; k < 5; k++) { const a = Math.atan2(P.fy, P.fx) + (k - 2) * 0.5; fx.projectiles.push({ x: P.x, y: P.y - 4, vx: Math.cos(a) * 70, vy: Math.sin(a) * 70, life: 1.8, mine: true, bolt: true, seek: true, pierce: false, bounce: 0, hit: new Set(), color: col, dmg: 0.75, r: 2, spellEl: 'shadow' }); }
      SND.wave(P.x / LW);
    } else if (sp.id === 'mend') {
      healPlayer(Math.round(stats().maxHp * 0.25)); P.poison = 0; SND.heal(P.x / LW);
      for (let k = 0; k < 18; k++) burst(P.x, P.y - 3, k % 2 ? col : '#ffffff', 1, 25, true);
    } else if (sp.id === 'ward') {
      P.ward = 2; P.inv = Math.max(P.inv, 2); SND.shield ? SND.shield(P.x / LW) : SND.zap(P.x / LW);
    }
    if (run.cls !== 'mage' && sp.charges <= 0) { run.spell2 = null; DF.UI.toast(`The ${def.name} scroll crumbles to dust.`); }
    updateHUD(true);
  }
  /* ---- The merchant ---- */
  const RAR_PRICE = [1, 1.5, 2.3, 3.5, 5];
  // What the merchant pays for something from your bag: about a third of what he'd sell it for.
  function sellPrice(it) { if (!it) return 0; const lvl = Math.max(1, it.lvl || run.floorN); return Math.max(3, Math.round((18 + 10 * lvl) * RAR_PRICE[it.rarity || 0] * 0.35 * (it.forged ? 1.2 : 1))); }
  function sellItem(i) {
    const it = run.bag[i]; if (!it) return 0;
    const g = sellPrice(it);
    run.bag[i] = null; meta.gold += g; bump('sold'); SND.coin(P.x / LW);
    floatText(P.x, P.y - 10, '+' + g + 'g', '#ffcf4a');
    updateHUD(true); saveMeta(true); saveRun();
    return g;
  }
  function makeShop() {
    const n = run.floorN, luck = stats().luckF, xs = [5 * T + 4, 7 * T + 4, 9 * T + 4], y = 6 * T + 2;
    const priceFor = (it) => Math.round((18 + 10 * n) * RAR_PRICE[it.rarity]);
    const stalls = [];
    const it = makeItem(lootSpec(), rollRarity(n, luck, 1), n);
    stalls.push({ kind: 'item', item: it, price: priceFor(it) });
    if (rnd() < 0.6) stalls.push({ kind: 'potion', price: 12 + 4 * n });
    else { const it2 = makeItem(lootSpec(), rollRarity(n, luck, 0), n); stalls.push({ kind: 'item', item: it2, price: priceFor(it2) }); }
    stalls.push({ kind: 'scroll', spell: randomSpell(), price: 20 + 6 * n });
    stalls.forEach((st, i) => { st.x = xs[i]; st.y = y; st.sold = false; });
    return { stalls, mx: 7 * T + 4, my: 3 * T + 6 };
  }
  function buyStall(st) {
    if (!st || st.sold) return 'Sold out.';
    if (meta.gold < st.price) return `You need ${st.price - meta.gold} more gold.`;
    meta.gold -= st.price; st.sold = true; bump('bought'); SND.coin(st.x / LW);
    if (st.kind === 'item') {
      const slot = freeSlot();
      if (slot >= 0) { run.bag[slot] = st.item; recordItem(st.item); }
      else { room.pickups.push({ kind: 'item', item: st.item, x: st.x, y: st.y + 8 }); DF.UI.toast('Your bag is full, so it\u2019s on the floor by the stall.'); }
    } else if (st.kind === 'potion') run.potions++;
    else if (st.kind === 'scroll') room.pickups.push({ kind: 'scroll', spell: st.spell, charges: DF.SCROLL_CHARGES, x: st.x, y: st.y + 8, t: 0.3 });
    burst(st.x, st.y - 3, '#ffcf4a', 12, 30, true);
    updateHUD(true); saveMeta(true);
    return '';
  }
  /* ---- The campfire ---- */
  function restAtFire(f) {
    if (!f || f.used) return;
    const s = stats();
    if (P.hp >= s.maxHp && !(P.poison > 0)) { DF.UI.toast('You\u2019re already rested. The fire will keep until you need it.'); return; }
    f.used = true; bump('rests');
    healPlayer(Math.round(s.maxHp * 0.5)); P.poison = 0; P.mana = s.maxMana; SND.heal(P.x / LW); SND.heart();
    for (let k = 0; k < 24; k++) burst(f.x, f.y - 4, k % 2 ? '#ffb070' : '#ffe9a8', 1, 30, true);
    DF.UI.toast('You rest by the fire for a while. The flames burn down to embers.');
    updateHUD(true); saveRun(); drawMinimap();
  }

  /* ---- Room events: a shrine, a cursed chest, a traveller, a wishing well, a forgotten armoury ---- */
  const EVENT_INFO = {
    shrine: { name: 'Blood Shrine', verb: 'Pray' },
    cursed: { name: 'Cursed Chest', verb: 'Open' },
    traveller: { name: 'Wounded Traveller', verb: 'Talk' },
    well: { name: 'Wishing Well', verb: 'Make a wish' },
    armoury: { name: 'Forgotten Armoury', verb: 'Look' },
  };
  const BLESS = { atk: { add: 2, word: 'attack' }, def: { add: 2, word: 'defence' }, luck: { add: 6, word: 'luck' } };
  function makeEvent() {
    const n = run.floorN, kinds = Object.keys(EVENT_INFO).filter((k) => k !== run.lastEvent);
    const kind = pick(kinds); run.lastEvent = kind;
    const ev = { kind, x: 7 * T + 4, y: 5 * T + 4, used: false };
    if (kind === 'shrine') ev.cost = 0.25;
    if (kind === 'traveller') ev.reward = 15 + n * 6;
    if (kind === 'well') { ev.cost = 8 + n * 3; ev.wishes = 3; }
    if (kind === 'armoury') { // three different kinds of thing, at least uncommon
      const luck = stats().luckF, seen = new Set(); ev.items = [];
      for (let tries = 0; ev.items.length < 3 && tries < 30; tries++) {
        const sp = lootSpec(), k = sp.type === 'weapon' ? 'weapon' : sp.type === 'trinket' ? 'trinket' : (DF.ARMOUR_SLOT[sp.icon] || 'body');
        if (seen.has(k) && tries < 24) continue; seen.add(k);
        ev.items.push(makeItem(sp, rollRarity(n, luck, 1), n));
      }
    }
    return ev;
  }
  function giveItem(it, x, y) {
    const slot = freeSlot();
    if (slot >= 0) { run.bag[slot] = it; recordItem(it); return true; }
    room.pickups.push({ kind: 'item', item: it, x, y, t: -1 }); return false;
  }
  // Does what you chose. Returns { ok, text } for the sheet to show.
  function eventDo(ev, choice) {
    if (!ev || ev.used) return { ok: false, text: 'Nothing more happens here.' };
    const n = run.floorN, s = stats();
    if (ev.kind === 'shrine') {
      const b = BLESS[choice]; if (!b) return { ok: false };
      const cost = Math.round(s.maxHp * ev.cost);
      if (P.hp <= cost) return { ok: false, text: 'You’re too hurt. The shrine would take more than you have.' };
      P.hp -= cost; ev.used = ev.touched = true; bump('blessings');
      run.bless[choice] = (run.bless[choice] || 0) + b.add;
      floatText(P.x, P.y - 8, '-' + cost, '#ff4a5a'); fx.shake = Math.max(fx.shake, 0.2);
      for (let k = 0; k < 20; k++) burst(ev.x, ev.y - 6, k % 2 ? '#ff4a5a' : '#ffe9a8', 1, 34, true);
      SND.heart(); updateHUD(true); saveRun(); drawMinimap();
      return { ok: true, text: `The blood runs into the stone. <b>+${b.add} ${b.word}</b> for the rest of this run.` };
    }
    if (ev.kind === 'cursed') {
      if (choice !== 'open') return { ok: false };
      ev.used = ev.touched = true;
      ev.pending = makeItem(lootSpec(), rollRarity(n, s.luckF, 2), n);
      const mons = run.content.monsters.filter((m) => m.behaviour !== 'swarm');
      const pool = (mons.length ? mons : run.content.monsters).slice().sort((a, b) => (b.tier || 2) - (a.tier || 2));
      const spots = freeSpots(room, null, 0).filter(([x, y]) => Math.hypot(x - P.x, y - P.y) > 28 && Math.hypot(x - ev.x, y - ev.y) > 12);
      for (let k = 0; k < 2; k++) {
        const [x, y] = spots.length ? spots.splice(rint(spots.length), 1)[0] : [ev.x + (k ? 20 : -20), ev.y];
        const e = makeEnemy(pool[Math.min(k, pool.length - 1)] || pool[0], x, y, { elite: true }); e.spawnT = 0.7;
        room.enemies.push(e); recordMonster(e.spec);
        for (let j = 0; j < 10; j++) burst(x, y - 3, '#b48bff', 1, 30, true);
      }
      room.locked = true; room.cleared = false;
      SND.door(); SND.bossRoar(); fx.shake = Math.max(fx.shake, 0.35);
      floatText(ev.x, ev.y - 14, 'Ambush!', '#ff5a5a', true);
      saveRun(); drawMinimap();
      return { ok: true, text: 'The lock clicks open and the shadows stand up. Beat them and the treasure is yours.' };
    }
    if (ev.kind === 'traveller') {
      if (choice !== 'give') return { ok: false };
      if (run.potions < 1) return { ok: false, text: 'You have no potion to give.' };
      run.potions--; ev.used = ev.touched = true; bump('helped');
      meta.gold += ev.reward; SND.coin(ev.x / LW);
      const it = makeItem(lootSpec(), rollRarity(n, s.luckF, 1), n);
      const inBag = giveItem(it, ev.x, ev.y + 10);
      burst(ev.x, ev.y - 4, '#72e07e', 14, 30, true);
      updateHUD(true); saveMeta(true); drawMinimap();
      return { ok: true, item: it, text: `“Bless you.” He presses <b style="color:#ffcf4a">${ev.reward} gold</b> and <b style="color:${DF.RAR_COLOR[it.rarity]}">${DF.UI.esc(it.name)}</b> into your hands${inBag ? '' : ', but your bag is full, so it’s on the floor'}.` };
    }
    if (ev.kind === 'well') {
      if (choice !== 'wish') return { ok: false };
      if (meta.gold < ev.cost) return { ok: false, text: `You need ${ev.cost - meta.gold} more gold.` };
      meta.gold -= ev.cost; ev.touched = true; ev.wishes--; SND.coin(ev.x / LW);
      ev.cost = Math.round(ev.cost * 1.6);
      if (ev.wishes <= 0) ev.used = true;
      for (let k = 0; k < 12; k++) burst(ev.x, ev.y - 4, k % 2 ? '#9ad8ff' : '#3a6ab8', 1, 28, true);
      const r = rnd(); let text;
      if (r < 0.28 && P.hp < s.maxHp) { healPlayer(s.maxHp); P.poison = 0; SND.heal(P.x / LW); text = 'The water glows. Every wound closes. <b>Fully healed.</b>'; }
      else if (r < 0.5) { run.potions++; SND.heart(); text = 'Something bobs up: <b style="color:#ff6a8a">a healing potion</b>.'; }
      else if (r < 0.7) {
        const sp = run.content.loot.filter((x) => x.type === 'trinket'), it = makeItem(sp.length ? pick(sp) : lootSpec(), rollRarity(n, s.luckF, 1), n);
        const inBag = giveItem(it, ev.x, ev.y + 10); SND.chest();
        text = `A glint at the bottom. You fish out <b style="color:${DF.RAR_COLOR[it.rarity]}">${DF.UI.esc(it.name)}</b>${inBag ? '' : ' (it’s on the floor, your bag is full)'}.`;
      } else if (r < 0.8) { const back = ev.cost * 2; meta.gold += back; text = `The well coughs your coin back up, and friends with it. <b style="color:#ffcf4a">+${back} gold</b>.`; }
      else text = 'Plip. A splash, and nothing more.';
      updateHUD(true); saveMeta(true); drawMinimap();
      return { ok: true, text: text + (ev.used ? ' The water goes still for good.' : '') };
    }
    if (ev.kind === 'armoury') {
      const it = ev.items && ev.items[+choice]; if (!it) return { ok: false };
      ev.used = ev.touched = true; ev.taken = +choice;
      const inBag = giveItem(it, ev.x, ev.y + 10); SND.pickup();
      for (let k = 0; k < 16; k++) burst(ev.x + (rnd() - 0.5) * 14, ev.y - 6, '#8a7a6a', 1, 20);
      saveRun(); updateHUD(true); drawMinimap();
      return { ok: true, text: `You take <b style="color:${DF.RAR_COLOR[it.rarity]}">${DF.UI.esc(it.name)}</b>${inBag ? '' : ' (on the floor, your bag is full)'}. The rest crumbles to rust and dust.` };
    }
    return { ok: false };
  }
  // The event props, drawn from small letter grids and kept as canvases.
  const EV_SPR = {"shrine":{"rows":["...y......y...","...o......o...","...w..rr..w...","...w.rRRr.w...",".ssssrRRrssss.",".sSSSSSSSSSSs.","..sddddddddS..","..sdSSSSSSdS..","..sdSrrrrSdS..","..sdSSSSSSdS..","..sddddddddS..",".ssssssssssss.",".dddddddddddd."],"pal":{"y":"#ffe9a8","o":"#ff9a3a","w":"#e8dcc0","r":"#c42a3a","R":"#ff4a5a","s":"#6a6478","S":"#8a849a","d":"#3a3446"}},"chest":{"rows":["..............","...pppppppp...","..pPPPPPPPPp..",".pPPgPPPPgPPp.",".pkkkkkkkkkkp.",".pPPPPyyPPPPp.",".pPPPPyYPPPPp.",".pPPPPPPPPPPp.",".pkkkkkkkkkkp.",".pPPPPPPPPPPp.",".pppppppppppp.","..g........g.."],"pal":{"p":"#3a1e4a","P":"#6a3a8a","k":"#9a8aa8","y":"#c8a040","Y":"#ffe14a","g":"#b48bff"}},"traveller":{"rows":["..............","....hhhh......","...hhhhhh.....","...hFFFFh.....","...hFeFeh.....","...hFFFFh..b..","..cccccccc.b..",".ccCCwwCCcc...",".cCCCwrCCCc...",".cCCCCCCCCcL..","..cccccccLLL..",".LLLLLLLLLLL.."],"pal":{"h":"#5a4a3a","F":"#e8c8a0","e":"#3a2a2a","c":"#4a5a3a","C":"#6a7a4a","w":"#f0e8e0","r":"#c42a3a","b":"#8a6a3a","L":"#7a5a3a"}},"well":{"rows":["..rrrrrrrrrr..",".rRRRRRRRRRRr.","..b........b..","..b...cc...b..","..b...c....b..",".ssssssssssss.",".sSSSSSSSSSSs.",".sbBBBWBBBBbs.",".sSBBBBBWBBSs.",".sSSSSSSSSSSs.",".sdSdSdSdSdSs.",".ssssssssssss."],"pal":{"r":"#6a2a2a","R":"#9a3a3a","b":"#7a5a3a","c":"#9a9aa8","s":"#5a5468","S":"#7a7488","d":"#3a3446","B":"#3a6ab8","W":"#9ad8ff"}},"armoury":{"rows":[".bbbbbbbbbbbb.",".b..........b.",".b.k...k...kb.",".b.k..kkk..kb.",".b.k...k..kkb.",".b.k...k...kb.",".b.k...k...kb.",".bbbbbbbbbbbb.",".b..........b.",".bBBBBBBBBBBb.",".b..........b.",".b..........b."],"pal":{"b":"#7a5a3a","B":"#5a3e28","k":"#c8ccd8"}}};
  const evCache = {};
  function evSprite(kind, dim) {
    const k = kind + (dim ? '_d' : ''); if (evCache[k]) return evCache[k];
    const d = EV_SPR[kind], h = d.rows.length, w = d.rows[0].length;
    const c = document.createElement('canvas'); c.width = w; c.height = h; const g = c.getContext('2d');
    d.rows.forEach((row, y) => [...row].forEach((ch, x) => {
      let col = d.pal[ch]; if (!col) return;
      if (dim) { if (kind === 'shrine' && 'yoR'.includes(ch)) col = ch === 'R' ? '#7a2a34' : '#3a3446'; else if (kind === 'chest' && 'gY'.includes(ch)) col = '#4a3a58'; else if (kind === 'well' && 'BW'.includes(ch)) col = '#1a2438'; else if (kind === 'armoury' && ch === 'k') return; }
      g.fillStyle = col; g.fillRect(x, y, 1, 1);
    }));
    return (evCache[k] = c);
  }
  const evPics = {};
  function eventPicture(kind) {
    if (evPics[kind]) return evPics[kind];
    const spr = evSprite(kind === 'cursed' ? 'chest' : kind), k = 4, c = document.createElement('canvas');
    c.width = spr.width * k; c.height = spr.height * k; const g = c.getContext('2d'); g.imageSmoothingEnabled = false; g.drawImage(spr, 0, 0, c.width, c.height);
    return (evPics[kind] = c.toDataURL());
  }
  function drawEvent(g, ev, lights) {
    const x = Math.round(ev.x), y = Math.round(ev.y);
    if (ev.kind === 'traveller' && ev.used) { // he's gone; his walking stick is left by the wall
      return;
    }
    const kind = ev.kind === 'cursed' ? 'chest' : ev.kind, spr = evSprite(kind, ev.used && ev.kind !== 'traveller');
    shadow(g, x, y + 2, 12);
    g.drawImage(spr, x - 7, y + 3 - spr.height);
    const flick = 0.85 + Math.sin(time * 9 + x) * 0.1;
    if (ev.kind === 'shrine' && !ev.used) { lights.push({ x: x - 4, y: y - 10, r: 12, a: 0.7 * flick, c: '#ffb070' }); lights.push({ x: x + 4, y: y - 10, r: 12, a: 0.7 * flick, c: '#ffb070' }); lights.push({ x, y: y - 5, r: 18, a: 0.5, c: '#ff4a5a' }); }
    if (ev.kind === 'cursed' && !ev.used) { lights.push({ x, y: y - 4, r: 20, a: 0.6 + Math.sin(time * 3) * 0.15, c: '#b48bff' }); if (rnd() < 0.08) burst(x + (rnd() - 0.5) * 12, y - 2, '#b48bff', 1, 8, true); }
    if (ev.kind === 'traveller') lights.push({ x, y: y - 5, r: 14, a: 0.35, c: '#ffd88a' });
    if (ev.kind === 'well' && !ev.used) lights.push({ x, y: y - 4, r: 16, a: 0.55 + Math.sin(time * 2) * 0.1, c: '#9ad8ff' });
    if (ev.kind === 'armoury' && ev.items) ev.items.forEach((it, i) => { // three old plinths in front of the rack
      const ix = x - 11 + i * 11, iy = y + 11;
      g.fillStyle = '#4a4458'; g.fillRect(ix - 4, iy - 1, 8, 3); g.fillStyle = '#6e6880'; g.fillRect(ix - 4, iy - 2, 8, 1);
      if (ev.used) { if (ev.taken !== i) { g.fillStyle = '#6a4a32'; g.fillRect(ix - 2, iy - 3, 1, 1); g.fillRect(ix + 1, iy - 3, 2, 1); g.fillRect(ix - 1, iy - 4, 1, 1); } return; }
      const bob = Math.round(Math.sin(time * 3 + i) * 0.6);
      g.drawImage(DF.iconSprite(it.icon, it.colors, it.element), ix - 4, iy - 11 + bob);
      lights.push({ x: ix, y: iy - 7, r: 11, a: 0.5, c: DF.RAR_COLOR[it.rarity] });
    });
  }
  function startBash() {
    bump('bashes');
    P.bash = { t: 0.16, hit: new Set() }; P.bashCd = 2.2; P.inv = Math.max(P.inv, 0.3);
    const target = nearestEnemy(34);
    if (target) { const a = Math.atan2(target.y - P.y, target.x - P.x); P.fx = Math.cos(a); P.fy = Math.sin(a); if (Math.abs(P.fx) > 0.15) P.dir = Math.sign(P.fx); }
    SND.bash(P.x / LW); fx.shake = Math.max(fx.shake, 0.1);
  }
  function updatePlayer(dt) {
    const s = stats();
    if (P.dead) return;
    P.inv = Math.max(0, P.inv - dt); P.cd = Math.max(0, P.cd - dt); P.bashCd = Math.max(0, P.bashCd - dt); P.flash = Math.max(0, P.flash - dt);
    P.spellCd = Math.max(0, (P.spellCd || 0) - dt); P.ward = Math.max(0, (P.ward || 0) - dt); P.castT = Math.max(0, (P.castT || 0) - dt);
    let mx = input.mx, my = input.my;
    const ml = Math.hypot(mx, my); if (ml > 1) { mx /= ml; my /= ml; }
    let spd = s.speed * (P.slowT > 0 ? 0.55 : 1) * (P.rootT > 0 ? 0 : 1);
    P.rootT = Math.max(0, P.rootT - dt); P.curseT = Math.max(0, P.curseT - dt);
    P.slowT = Math.max(0, P.slowT - dt);
    if (P.swing) spd *= 0.6;
    const slippery = run.content.theme.rule === 'slippery floors';
    if (P.roll) {
      P.roll.t -= dt; P.vx = P.roll.dx * 150; P.vy = P.roll.dy * 150; P.inv = Math.max(P.inv, 0.05);
      if (rnd() < 0.5) fx.particles.push({ x: P.x, y: P.y + 1, vx: 0, vy: -5, life: 0.3, max: 0.3, color: '#8a7a6a', size: 1, glow: false, g: 0 });
      if (P.roll.t <= 0) { P.roll = null; P.vx *= 0.3; P.vy *= 0.3; }
    } else if (P.bash && P.bash.t > 0) {
      P.bash.t -= dt; P.vx = P.fx * 175; P.vy = P.fy * 175;
      breakPropsNear(P.x + P.fx * 4, P.y + P.fy * 4, P.r + 4);
      for (const e of room.enemies) {
        if (P.bash.hit.has(e) || e.hidden || dist(P, e) > P.r + e.r + 3) continue;
        P.bash.hit.add(e);
        damageEnemy(e, s.attack * 0.8, { knock: 140, stun: 0.8, from: P, bash: true });
      }
      if (P.bash.t <= 0) { P.bash = null; P.vx *= 0.2; P.vy *= 0.2; }
    } else if (P.knockT > 0) {
      P.knockT -= dt; P.vx *= Math.pow(0.002, dt); P.vy *= Math.pow(0.002, dt);
    } else if (slippery) {
      const k = Math.min(1, dt * 3.2); P.vx += (mx * spd - P.vx) * k; P.vy += (my * spd - P.vy) * k;
    } else { P.vx = mx * spd; P.vy = my * spd; }
    if (P.pull && P.pull.t > 0) { P.pull.t -= dt; const a = Math.atan2(P.pull.y - P.y, P.pull.x - P.x); P.vx += Math.cos(a) * 34; P.vy += Math.sin(a) * 34; }
    // Door assist: near an open door and pushing roughly towards it? Line up with the gap and go through.
    if (!room.locked && !P.bash && ml > 0.3) {
      const cx = 7 * T + T / 2, cy = 5 * T + T / 2, zone = 2 * T + 6, s2 = Math.max(spd, 30);
      const lane = (along, toward) => along && toward > 0.25;
      const ux = mx / ml, uy = my / ml;
      if (room.doors.n && P.y < zone && Math.abs(P.x - cx) < 14 && lane(true, -uy)) { P.vx = clamp((cx - P.x) * 12, -s2, s2); P.vy = -s2; }
      else if (room.doors.s && P.y > LH - zone && Math.abs(P.x - cx) < 14 && lane(true, uy)) { P.vx = clamp((cx - P.x) * 12, -s2, s2); P.vy = s2; }
      else if (room.doors.w && P.x < zone && Math.abs(P.y - cy) < 14 && lane(true, -ux)) { P.vy = clamp((cy - P.y) * 12, -s2, s2); P.vx = -s2; }
      else if (room.doors.e && P.x > LW - zone && Math.abs(P.y - cy) < 14 && lane(true, ux)) { P.vy = clamp((cy - P.y) * 12, -s2, s2); P.vx = s2; }
    }
    const before = { x: P.x, y: P.y };
    move(P, P.vx * dt, P.vy * dt);
    if (P.pull && P.pull.t > 0) { P.vx -= Math.cos(Math.atan2(P.pull.y - P.y, P.pull.x - P.x)) * 34; P.vy -= Math.sin(Math.atan2(P.pull.y - P.y, P.pull.x - P.x)) * 34; }
    const moved = Math.hypot(P.x - before.x, P.y - before.y);
    if (ml > 0.2 && !P.bash && !P.swing) { const l = Math.hypot(mx, my); P.fx = mx / l; P.fy = my / l; if (Math.abs(mx) > 0.15) P.dir = Math.sign(mx); }
    P.walkT += moved > 0.05 ? dt : 0;
    if (!P.bash && !(P.knockT > 0)) meta.stats.walked += moved / T; // in tiles (about a metre each)
    if (P.swing) { P.swing.t += dt; if (P.swing.t < 0.11) swingHits(s); if (P.swing.t >= P.swing.dur) P.swing = null; }
    if (run.cls === 'mage') {
      P.mana = Math.min(s.maxMana, P.mana + dt * 7); P.novaCd = Math.max(0, P.novaCd - dt);
      if (input.attack && P.cd <= 0) castBolt();
      if (input.bash && P.bashCd <= 0) blink(mx, my);
      if (input.spell && P.novaCd <= 0) nova();
      if (input.spell2) castSpell();
    } else if (run.cls === 'ranger') {
      P.novaCd = Math.max(0, (P.novaCd || 0) - dt);
      if (input.attack && P.cd <= 0) shoot();
      if (input.bash && P.bashCd <= 0 && !P.roll) roll(mx, my);
      if (input.spell && P.novaCd <= 0) volley();
      if (input.spell2) castSpell();
    } else if (run.cls === 'tinkerer') {
      P.novaCd = Math.max(0, (P.novaCd || 0) - dt);
      if (input.attack && P.cd <= 0) startSwing();
      if (input.bash && P.bashCd <= 0) buildTurret();
      if (input.spell && P.novaCd <= 0) bomb();
      if (input.spell2) castSpell();
      updateTurrets(dt);
    } else {
      if (input.attack && P.cd <= 0 && !P.bash) startSwing();
      if (input.bash && P.bashCd <= 0 && !P.bash) startBash();
      if (input.spell || input.spell2) castSpell();
    }
    input.attack = false; input.bash = false; input.spell = false; input.spell2 = false;
    // What you're standing on.
    const tx = Math.floor(P.x / T), ty = Math.floor(P.y / T), under = tileAt(tx, ty);
    P.hazT -= dt; P.springT -= dt;
    if (under === TL.HAZ && P.hazT <= 0) { P.hazT = 0.6; hurtPlayer(Math.max(2, 1 + run.floorN), null, 'hazard'); if (run.content.theme.element === 'poison') P.poison = 2; }
    if (under === TL.SPRING && P.springT <= 0 && room.springLeft > 0 && P.hp < s.maxHp) {
      P.springT = 0.4; const amt = Math.max(1, Math.round(s.maxHp * 0.04)); room.springLeft -= amt / s.maxHp; healPlayer(amt); SND.heal(P.x / LW);
      burst(P.x, P.y, run.content.theme.colors.light, 3, 15, true);
    }
    for (const ef of room.effects) {
      if (dist(P, ef) > ef.r + 1) continue;
      if (ef.type === 'fire' && P.hazT <= 0) { P.hazT = 0.6; hurtPlayer(ef.dmg, { from: ef.from }); }
      if (ef.type === 'ice') P.slowT = 0.2;
      if (ef.type === 'ooze') { if (!(P.poison > 0)) P.poisonFrom = ef.from; P.poison = Math.max(P.poison, 1.5); }
    }
    if (P.burnT > 0) { P.burnT -= dt; P.burnTick -= dt; if (rnd() < 0.3) fx.particles.push({ x: P.x + (rnd() - 0.5) * 5, y: P.y - 5, vx: 0, vy: -14, life: 0.3, max: 0.3, color: '#ff8a3a', size: 1, glow: true, g: 0 });
      if (P.burnTick <= 0) { P.burnTick = 0.6; P.hp -= 1; bump('dmgTaken'); P.lastHit = P.burnFrom || 'Fire'; floatText(P.x, P.y - 8, '-1', '#ff9a3a'); if (P.hp <= 0) { P.hp = 0; die(); } updateHUD(); } }
    if (P.rootT > 0 && rnd() < 0.3) fx.particles.push({ x: P.x + (rnd() - 0.5) * 8, y: P.y - 9, vx: 0, vy: -4, life: 0.3, max: 0.3, color: '#ffe14a', size: 1, glow: true, g: 0 });
    if (P.poison > 0) { P.poison -= dt; P.poisonTick -= dt; if (P.poisonTick <= 0) { P.poisonTick = 0.7; P.hp -= 1; bump('dmgTaken'); P.lastHit = P.poisonFrom || 'Poison'; floatText(P.x, P.y - 8, '-1', '#a6ff4a'); if (P.hp <= 0) { P.hp = 0; die(); } updateHUD(); } }
    // Leaving through an open door.
    if (!room.locked) {
      let go = null;
      if (P.x < 5 && room.doors.w) go = 'w'; else if (P.x > LW - 5 && room.doors.e) go = 'e'; else if (P.y < 5 && room.doors.n) go = 'n'; else if (P.y > LH - 5 && room.doors.s) go = 's';
      if (go && !fx.fadeDir) {
        const next = floor.get(room.gx + DIRS[go][0], room.gy + DIRS[go][1]);
        fade(() => enterRoom(next, OPP[go]));
      }
    }
    // Pickups.
    let swapWith = null, scrollHere = null;
    for (let i = room.pickups.length - 1; i >= 0; i--) {
      const p = room.pickups[i]; p.t = (p.t || 0) + dt;
      const d = dist(P, p);
      if ((p.kind === 'gold' || p.kind === 'heart') && d < 16 && p.t > 0.3) { const a = Math.atan2(P.y - p.y, P.x - p.x); p.x += Math.cos(a) * 90 * dt; p.y += Math.sin(a) * 90 * dt; }
      if (d > 5 || p.t < 0.3) continue;
      if (p.kind === 'gold') { const g = p.value; meta.gold += g; meta.stats.goldTotal += g; run.gold += g; SND.coin(p.x / LW); floatText(p.x, p.y - 4, '+' + g, '#ffcf4a'); room.pickups.splice(i, 1); saveMeta(); updateHUD(); }
      else if (p.kind === 'heart') { if (healPlayer(Math.max(3, Math.round(s.maxHp * 0.12))) > 0 || true) { SND.heart(); room.pickups.splice(i, 1); } }
      else if (p.kind === 'scroll') {
        const sp = run.spell2;
        if (!sp) learnScroll(p);
        else if (sp.id === p.spell && run.cls !== 'mage') { sp.charges += p.charges || DF.SCROLL_CHARGES; room.pickups.splice(i, 1); SND.pickup(); DF.UI.toast(`${DF.SPELLS[sp.id].name}: ${sp.charges} charges.`); updateHUD(true); saveRun(); }
        else if (sp.id === p.spell) { room.pickups.splice(i, 1); P.mana = s.maxMana; SND.pickup(); DF.UI.toast(`You already know ${DF.SPELLS[sp.id].name}. The scroll fills your mana instead.`); updateHUD(true); }
        else { scrollHere = p; if (!p.warned) { p.warned = true; DF.UI.toast(`A ${DF.SPELLS[p.spell].name} scroll. Tap Read to swap it for ${DF.SPELLS[sp.id].name}.`); } }
      }
      else if (p.kind === 'potion') { run.potions++; SND.pickup(); DF.UI.toast('Found a potion.'); room.pickups.splice(i, 1); updateHUD(true); }
      else if (p.kind === 'item') {
        const slot = freeSlot();
        if (slot < 0) { swapWith = p; if (!p.warned) { p.warned = true; DF.UI.toast(bagFullMsg() + ' Tap Swap to leave something here instead.'); } continue; }
        run.bag[slot] = p.item; room.pickups.splice(i, 1); SND.pickup();
        recordItem(p.item);
        { const v = DF.itemVerdict ? DF.itemVerdict(p.item) : null; const tag = v === 'up' ? ' <b class="t-up">\u25b2 upgrade</b>' : v === 'down' ? ' <b class="t-down">\u25bc weaker</b>' : '';
          DF.UI.toast(`<b style="color:${DF.RAR_COLOR[p.item.rarity]}">${DF.UI.esc(p.item.name)}</b> ${DF.RARITY[p.item.rarity].toLowerCase()} ${p.item.type}${tag}`, 2600, true); }
        updateHUD(true); saveRun();
      }
    }
    // The chest, the forge altar and the stairs.
    action = null;
    if (room.chest && !room.chest.open && dist(P, room.chest) < 9) openChest(room.chest);
    if (room.altar && dist(P, room.altar) < 13) action = room.altar.uses > 0 ? { label: 'Forge', fn: () => DF.UI.openForge(room.altar) } : { label: 'Cold altar', fn: () => DF.UI.toast('This altar has gone cold. Find another on the next floor.') };
    if (room.stairs && dist(P, room.stairs) < 11) action = { label: 'Descend', fn: () => DF.UI.confirmStairs() };
    if (room.fire && !room.fire.used && dist(P, room.fire) < 14) { const f = room.fire; action = { label: 'Rest', fn: () => restAtFire(f) }; }
    if (room.event && !room.event.used && !room.locked && dist(P, room.event) < 15) { const ev = room.event; action = { label: EVENT_INFO[ev.kind].verb, fn: () => DF.UI.openEvent(ev) }; }
    if (room.shop && !scrollHere && !swapWith) {
      let best = null, bd = 10;
      for (const st of room.shop.stalls) { const d = Math.hypot(P.x - st.x, P.y - st.y); if (!st.sold && d < bd) { bd = d; best = st; } }
      if (best) { const st = best; action = { label: `Buy \u00b7 ${st.price}g`, fn: () => DF.UI.openStall(st) }; }
      else if (Math.hypot(P.x - room.shop.mx, P.y - room.shop.my) < 16) { const sh = room.shop; action = { label: 'Trade', fn: () => DF.UI.openTrade(sh) }; }
    }
    if (!action && scrollHere) { const p = scrollHere; action = { label: 'Read scroll', fn: () => DF.UI.openScroll(p) }; }
    if (!action && swapWith) { const p = swapWith; action = { label: 'Swap', fn: () => DF.UI.openSwap(p) }; }
    if (input.act) { input.act = false; if (action) action.fn(); }
    DF.UI.setAction(action);
  }
  function swingHits(s) {
    const sw = P.swing, w = run.eq.weapon, feel = weaponFeel();
    for (const e of room.enemies) {
      if (sw.hit.has(e) || e.spawnT > 0) continue;
      const dx = e.x - P.x, dy = (e.y - 2) - (P.y - 2), d = Math.hypot(dx, dy);
      if (d > sw.range + e.r) continue;
      let da = Math.atan2(dy, dx) - sw.ang; while (da > Math.PI) da -= Math.PI * 2; while (da < -Math.PI) da += Math.PI * 2;
      if (Math.abs(da) > sw.arc / 2 && d > e.r + 2) continue;
      sw.hit.add(e);
      damageEnemy(e, s.attack * feel.mult, { from: P, knock: 55, powers: w ? w.powers : [], element: w ? w.element : 'none', luck: s.luckF });
    }
    breakPropsNear(P.x, P.y - 2, sw.range, (px, py) => { let da = Math.atan2(py - (P.y - 2), px - P.x) - sw.ang; while (da > Math.PI) da -= Math.PI * 2; while (da < -Math.PI) da += Math.PI * 2; return Math.abs(da) <= sw.arc / 2 + 0.3; });
    // Swings knock enemy shots out of the air.
    for (const p of fx.projectiles) {
      if (p.mine || p.dead) continue;
      const dx = p.x - P.x, dy = p.y - P.y; if (Math.hypot(dx, dy) > sw.range + 2) continue;
      let da = Math.atan2(dy, dx) - sw.ang; while (da > Math.PI) da -= Math.PI * 2; while (da < -Math.PI) da += Math.PI * 2;
      if (Math.abs(da) < sw.arc / 2) { p.dead = true; burst(p.x, p.y, p.color, 4, 30, true); SND.clink(p.x / LW); }
    }
  }

  /* ================= Monsters ================= */
  function damageEnemy(e, amount, o) {
    if (e.dead) return;
    if (e.hidden) reveal(e);
    if (e.shield > 0 && !o.dot) { e.shield = 0; floatText(e.x, e.y - e.h / 2 - 2, 'Blocked', '#9ad8ff'); SND.shield(e.x / LW); burst(e.x, e.y - 2, '#9ad8ff', 6, 30, true); return; }
    let mult = 1, tag = '';
    const el = o.element;
    if (el && el !== 'none') { if (el === e.spec.weakness) { mult = 1.6; tag = 'Weak!'; } else if (el === e.spec.element) mult = 0.6; }
    let crit = false;
    if (o.luck && rnd() < o.luck * 0.6) { crit = true; mult *= 1.8; }
    if (e.abil.has('armoured') && !o.dot) mult *= 0.6;
    const d = Math.max(1, Math.round(amount * mult));
    bump('dmgDealt', d);
    if (!o.dot) {
      bump('hits'); if (crit) bump('crits'); if (tag) bump('weakHits');
      const big = meta.records.bigHit;
      if (!big || d > big.n) meta.records.bigHit = { n: d, weapon: run.eq.weapon ? run.eq.weapon.name : 'bare hands', monster: e.spec.name, floor: run.floorN };
    }
    e.hp -= d; e.flash = 0.1;
    floatText(e.x + (rnd() - 0.5) * 4, e.y - e.h / 2 - 2, crit ? d + '!' : d, o.dot ? '#ffb070' : crit ? '#ffcf4a' : tag ? '#ffe14a' : '#ffffff', crit || !!tag);
    if (tag) { floatText(e.x, e.y - e.h / 2 - 9, tag, '#ffe14a'); SND.weak(e.x / LW); }
    if (!o.dot) {
      SND.hit(e.x / LW, d > 12);
      fx.hitstop = Math.max(fx.hitstop, crit ? 0.07 : 0.035);
      if (crit) { fx.shake = Math.max(fx.shake, 0.22); burst(e.x, e.y - 3, '#ffcf4a', 6, 45, true); } // crits land with a little kick
      burst(e.x, e.y - 2, (e.spec.colors && e.spec.colors[0]) || '#fff', 4, 35);
    }
    const powers = o.powers || [];
    let knock = o.knock || 0;
    if (powers.includes('knockback')) knock *= 1.9;
    if (knock && o.from) {
      const a = Math.atan2(e.y - o.from.y, e.x - o.from.x), res = e.boss ? 0.15 : e.beh === 'tank' ? 0.4 : 1;
      e.vx += Math.cos(a) * knock * res; e.vy += Math.sin(a) * knock * res;
    }
    if (o.stun) e.stun = Math.max(e.stun, e.boss ? o.stun * 0.3 : o.stun);
    if (powers.includes('burn')) { e.burn = 3; e.burnDmg = Math.max(1, amount * 0.22); }
    if (powers.includes('freeze')) e.slow = 2.5;
    if (powers.includes('lifesteal') && rnd() < 0.5) healPlayer(Math.max(1, Math.round(d * 0.12)));
    if (powers.includes('chain') && !o.chained) {
      const near = room.enemies.filter((x) => x !== e && !x.dead && !x.hidden && dist(x, e) < 42).sort((a, b) => dist(a, e) - dist(b, e)).slice(0, 2);
      near.forEach((x) => { fx.particles.push({ bolt: true, x: e.x, y: e.y - 2, x2: x.x, y2: x.y - 2, life: 0.15, max: 0.15, color: '#ffe14a' }); damageEnemy(x, amount * 0.45, { chained: true, from: e, element: 'lightning' }); });
      if (near.length) SND.zap(e.x / LW);
    }
    if (e.hp > 0 && !o.dot) afterHit(e, o);
    if (e.hp <= 0) killEnemy(e);
    if (e.boss) DF.UI.bossBar(e);
  }
  const chaseCap = () => ((DF.CLASSES[(run && run.cls) || 'knight'] || DF.CLASSES.knight).spd) * 0.82;
  function afterHit(e, o) {
    const a = e.abil; e.lastHitT = time;
    if (a.has('reflects') && o.from === P && rnd() < 0.5) hurtPlayer(Math.max(1, Math.round(e.dmg * 0.35)), e);
    if (a.has('enrages') && !e.enraged && e.hp < e.maxHp * 0.5) {
      e.enraged = true; e.dmg = Math.round(e.dmg * 1.4); e.spd *= 1.3; floatText(e.x, e.y - e.h - 6, 'Enraged!', '#ff5a3a', true);
      for (let k = 0; k < 10; k++) burst(e.x, e.y - 3, '#ff3a2a', 1, 35, true);
    }
    if (a.has('calls help') && !e.called && e.hp < e.maxHp * 0.5) { e.called = true; floatText(e.x, e.y - e.h - 6, 'Help!', '#ffcf4a', true); summonHelp(e, 2); }
    if (a.has('blinks') && !(e.blinkT > time) && rnd() < 0.45) {
      const s = randomFloorNear(P.x - P.fx * 18, P.y - P.fy * 18, 6, 22) || randomFloorNear(P.x, P.y, 16, 34);
      if (s) { burst(e.x, e.y - 2, '#ffffff', 8, 25, true); e.x = s.x; e.y = s.y; e.vx = e.vy = 0; e.spawnT = 0.15; e.blinkT = time + 2.2; burst(e.x, e.y - 2, '#ffffff', 8, 25, true); SND.blink(e.x / LW); }
    }
  }
  function summonHelp(e, n) {
    const base = run.content.monsters.slice().sort((a, b) => a.tier - b.tier)[0];
    for (let k = 0; k < n; k++) { const s = randomFloorNear(e.x, e.y, 8, 20); if (!s) continue; const m = makeEnemy(base, s.x, s.y, { minion: true }); m.owner = e; m.spawnT = 0.5; m.beh = 'chaser'; m.hidden = false; room.enemies.push(m); burst(s.x, s.y, '#b48bff', 8, 25, true); }
    SND.summon(e.x / LW);
  }
  function reveal(e) { if (!e.hidden) return; e.hidden = false; if (e.burrowing > 0) { e.burrowing = 0; burst(e.x, e.y, '#8a6a4a', 8, 25); return; } e.spd *= 1.35; burst(e.x, e.y, '#ffffff', 8, 25); floatText(e.x, e.y - 8, '!', '#ff5a5a', true); }
  function dropGold(x, y, amount) {
    if (run.content.theme.rule === 'rich veins') amount *= 2;
    const coins = Math.min(6, Math.max(1, Math.round(amount / 3)));
    for (let i = 0; i < coins; i++) room.pickups.push({ kind: 'gold', value: Math.max(1, Math.round(amount / coins)), x: x + (rnd() - 0.5) * 8, y: y + (rnd() - 0.5) * 6, vy: -20 - rnd() * 20, z: 0 });
  }
  // Loot for this floor: the AI's own treasure when it's ready, the floor's list otherwise.
  function lootSpec() {
    const live = run.live && run.live.theme && run.live.theme.name === run.content.theme.name ? run.live.loot.filter(Boolean) : [];
    return pickLoot(live.length && rnd() < 0.8 ? live : run.content.loot);
  }
  // Finds lean toward what you're missing: armour for an empty slot is about 3x as likely, and trinkets are
  // likelier while a trinket slot is empty. Weapons come up a little less often.
  function pickLoot(list) {
    if (!list || !list.length) return pick(run.content.loot);
    const w = list.map((x) => {
      if (x.type === 'weapon') return 0.8;
      if (x.type === 'trinket') return run.eq.trinket1 && run.eq.trinket2 ? 0.8 : 1.4;
      return run.eq[DF.ARMOUR_SLOT[x.icon] || 'body'] ? 1 : 3;
    });
    let t = rnd() * w.reduce((a, b) => a + b, 0);
    for (let i = 0; i < list.length; i++) { t -= w[i]; if (t <= 0) return list[i]; }
    return list[list.length - 1];
  }
  function dropItem(x, y, spec, minRar) {
    const it = makeItem(spec, rollRarity(run.floorN, stats().luckF, minRar), run.floorN);
    room.pickups.push({ kind: 'item', item: it, x, y });
  }
  function killEnemy(e) {
    if (e.dead) return;
    if (e.abil.has('revives') && !e.revived && !e.minion && !e.child) { // Bone Revival: it pulls itself back together, once
      e.revived = true; e.hp = Math.round(e.maxHp * 0.5); e.spawnT = 1.1; e.flash = 0.2;
      for (let k = 0; k < 14; k++) burst(e.x, e.y - 3, k % 2 ? '#e8dcc0' : '#ffffff', 1, 40);
      floatText(e.x, e.y - e.h - 6, 'It rises!', '#e8dcc0', true); SND.bash(e.x / LW); if (e.boss) DF.UI.bossBar(e);
      return;
    }
    e.dead = true;
    if (e.stolen) { for (let i = 0; i < Math.min(8, e.stolen); i++) room.pickups.push({ kind: 'gold', value: Math.max(1, Math.round(e.stolen / Math.min(8, e.stolen))), x: e.x + (rnd() - 0.5) * 8, y: e.y + (rnd() - 0.5) * 6, vy: -25, z: 0 }); floatText(e.x, e.y - e.h - 6, 'Your gold!', '#ffcf4a'); }
    const col = (e.spec.colors && e.spec.colors[0]) || '#ffffff';
    burst(e.x, e.y - 2, col, e.boss ? 40 : 12, e.boss ? 60 : 40);
    burst(e.x, e.y - 2, '#ffffff', 4, 20);
    SND.kill(e.x / LW);
    if (!e.minion) {
      run.kills++; run.floorKills = (run.floorKills || 0) + 1; meta.stats.kills++;
      if (e.elite) bump('elites');
      const el = e.spec.element || 'earth'; meta.records.elemKills[el] = (meta.records.elemKills[el] || 0) + 1;
      const b = meta.books.mon[norm(e.spec.name)];
      if (b) { b.kills++; floatText(e.x, e.y - e.h - 8, '\u00d7' + b.kills, '#e9c46a'); }
    }
    dropGold(e.x, e.y, e.gold);
    if (!e.minion && rnd() < 0.09) room.pickups.push({ kind: 'heart', x: e.x, y: e.y });
    if (!e.minion && !e.child && rnd() < 0.025 + stats().luckF * 0.03) room.pickups.push({ kind: 'potion', x: e.x + 3, y: e.y });
    if (e.elite) dropItem(e.x, e.y, lootSpec(), 1);
    if (e.mimicItem) room.pickups.push({ kind: 'item', item: e.mimicItem, x: e.x, y: e.y });
    if (e.abil.has('splits when hit') && !e.splitDone && !e.child) {
      for (let k = 0; k < 2; k++) { const c = makeEnemy(e.spec, e.x + (k ? 4 : -4), e.y, { child: true }); c.spawnT = 0.25; c.vx = (k ? 60 : -60); room.enemies.push(c); }
    }
    if (e.abil.has('explodes on death')) room.effects.push({ type: 'boom', x: e.x, y: e.y, r: e.boss ? 26 : 15, life: 0.55, max: 0.55, dmg: Math.round(e.dmg * 1.5), from: e.spec.name });
    room.enemies = room.enemies.filter((x) => x !== e);
    if (e.boss) bossDefeated(e);
    else if (!room.enemies.length) roomCleared();
  }
  function roomCleared() {
    if (room.cleared) return;
    room.cleared = true; room.locked = false; bump('rooms'); saveMeta();
    if (room.event && room.event.pending) { const ev = room.event; room.pickups.push({ kind: 'item', item: ev.pending, x: ev.x, y: ev.y + 8 }); burst(ev.x, ev.y - 3, '#b48bff', 18, 40, true); floatText(ev.x, ev.y - 14, 'The curse lifts', '#b48bff', true); ev.pending = null; }
    SND.clear();
    if (room.type === 'fight' && rnd() < 0.22) room.pickups.push(rnd() < 0.5 ? { kind: 'heart', x: P.x + 10, y: P.y } : { kind: 'gold', value: 3 + run.floorN, x: P.x + 10, y: P.y });
    if (room.type === 'fight' && rnd() < 0.12) dropItem(7 * T + 4, 5 * T + 4, lootSpec(), 0);
    else if (room.type === 'fight' && rnd() < 0.05) dropScroll(7 * T + 4, 5 * T + 4);
    drawMinimap();
  }
  function bossDefeated(e) {
    meta.stats.bosses++;
    room.enemies.forEach((x) => { x.minion = true; killEnemy(x); });
    room.enemies = []; room.cleared = true; room.locked = false;
    fx.shake = 0.7; fx.slowmo = 0.8;
    SND.boom(3, e.x / LW); setTimeout(() => SND.clear(), 400); setTimeout(() => SND.victory(), 700);
    room.stairs = { x: 7 * T + 4, y: 5 * T + 4 };
    dropItem(e.x - 8, e.y + 4, lootSpec(), 2);
    room.pickups.push({ kind: 'heart', x: e.x + 8, y: e.y + 4 });
    if (rnd() < 0.3) dropScroll(e.x, e.y + 10);
    DF.UI.bossBar(null);
    DF.UI.toast(`<b>${DF.UI.esc(e.spec.name)}</b> is defeated. Stairs lead deeper.`, 3500, true);
    saveMeta(true); drawMinimap();
  }
  function openChest(ch) {
    ch.open = true;
    if (ch.mimic) {
      const th = run.content.theme;
      const spec = { name: 'Mimic Chest', description: 'A treasure chest with teeth.', colors: ['#8a5a32', th.colors.accent, '#3a2010', '#ffffff'], element: th.element,
        weakness: DF.NATURAL_WEAKNESS[th.element], tier: 2, behaviour: 'chaser', abilities: [] };
      bump('chests'); bump('mimics');
      const e = makeEnemy(spec, ch.x, ch.y, { elite: true });
      e.mimicItem = makeItem(lootSpec(), rollRarity(run.floorN, stats().luckF, 2), run.floorN);
      e.spawnT = 0.4;
      room.enemies.push(e); room.locked = true; room.cleared = false; room.chest = null;
      recordMonster(spec);
      SND.bossRoar(); fx.shake = 0.3; floatText(ch.x, ch.y - 10, 'Mimic!', '#ff5a5a', true);
      return;
    }
    SND.chest(); bump('chests');
    burst(ch.x, ch.y - 3, '#ffcf4a', 16, 40, true);
    dropItem(ch.x, ch.y + 7, lootSpec(), 1);
    dropGold(ch.x, ch.y + 3, 6 + run.floorN * 2);
    if (rnd() < 0.3) dropScroll(ch.x + 8, ch.y + 6);
  }
  function enemyShoot(e, ang, speed, o) {
    const col = DF.EL_COLOR[e.spec.element] || '#ff8a5a';
    fx.projectiles.push({ x: e.x + Math.cos(ang) * 3, y: e.y - 2 + Math.sin(ang) * 3, vx: Math.cos(ang) * speed, vy: Math.sin(ang) * speed, life: 2.6, dmg: e.dmg * ((o && o.mult) || 0.9),
      color: col, r: e.boss ? 2.5 : 2, poison: e.abil.has('poisons'), el: e.spec.element, from: e.spec.name, owner: e });
  }
  function updateEnemy(e, dt) {
    if (e.spawnT > 0) { e.spawnT -= dt; return; }
    e.flash = Math.max(0, e.flash - dt);
    e.wob += dt * 8;
    // Burning and slowing.
    if (e.burn > 0) { e.burn -= dt; e.burnTick -= dt; if (e.burnTick <= 0) { e.burnTick = 0.6; burst(e.x, e.y - 3, '#ff7a2a', 2, 15, true); damageEnemy(e, e.burnDmg || 1, { dot: true }); if (e.dead) return; } }
    e.slow = Math.max(0, e.slow - dt);
    // No monster ever outruns you: walking and chasing tops out a little below your hero's own speed
    // (charges and teleports are their own, telegraphed thing).
    const cap = chaseCap(), sp = Math.min(e.spd, cap) * (e.slow > 0 ? 0.45 : 1);
    // Knockback slides.
    const kv = Math.hypot(e.vx, e.vy);
    if (kv > 1) { move(e, e.vx * dt, e.vy * dt); const f = Math.pow(0.003, dt); e.vx *= f; e.vy *= f; } else { e.vx = e.vy = 0; }
    if (e.stun > 0) { e.stun -= dt; return; }
    const dx = P.x - e.x, dy = P.y - e.y, d = Math.hypot(dx, dy) || 1, ux = dx / d, uy = dy / d;
    if (!P.dead && Math.abs(dx) > 1) e.dir = Math.sign(dx);
    e.t -= dt; e.t2 -= dt; e.t3 -= dt;
    const step = (vx, vy) => { const hit = move(e, vx * dt, vy * dt); if (hit && e.state === 'move') { e.side = (e.side || 1) * -1; } return hit; };
    const chase = (k) => { const s = Math.min(sp * (k || 1), cap); const side = e.side || 1; step(ux * s + (-uy) * s * 0.25 * Math.sin(e.wob * 0.3) * side, uy * s + ux * s * 0.25 * Math.sin(e.wob * 0.3) * side); };
    const keepAway = (want) => {
      const tang = (e.side || 1);
      if (d < want - 8) step(-ux * sp, -uy * sp); else if (d > want + 10) step(ux * sp, uy * sp); else step(-uy * sp * 0.6 * tang, ux * sp * 0.6 * tang);
      if (rnd() < dt * 0.4) e.side = -(e.side || 1);
    };
    if (P.dead) { step(Math.cos(e.wob * 0.2) * 5, Math.sin(e.wob * 0.2) * 5); return; }
    // Charges: wind up, then lunge (any monster with the ability, not just tanks).
    const chargeStep = () => {
      if (!e.abil.has('charges') || e.beh === 'tank' || e.hidden) return false;
      if (e.cs === 'wind') { e.csT -= dt; e.wob += dt * 40; if (e.csT <= 0) { e.cs = 'dash'; e.csT = 0.35; } return true; }
      if (e.cs === 'dash') { e.csT -= dt; if (rnd() < 0.5) burst(e.x, e.y, '#ffffff', 1, 10); if (step(e.cx * 105, e.cy * 105) || e.csT <= 0) { e.cs = ''; e.chgT = 2.8 + rnd() * 1.6; } return true; }
      e.chgT = (e.chgT == null ? 1.5 + rnd() * 2 : e.chgT) - dt;
      if (e.chgT <= 0 && d < 70 && d > 12 && lineClear(e, P)) { e.cs = 'wind'; e.csT = 0.45; e.cx = ux; e.cy = uy; return true; }
      return false;
    };
    if (!chargeStep()) switch (e.beh) {
      case 'ambusher':
        if (e.hidden) { if (d < 26) reveal(e); break; }
        chase(1); break;
      case 'shooter':
        keepAway(46);
        if (e.t <= 0 && lineClear(e, P)) { e.t = ((e.boss ? 1.3 : 2) + rnd() * 0.6) * (e.abil.has('rapid fire') ? 0.45 : 1); enemyShoot(e, Math.atan2(dy, dx), e.boss ? 58 : 50); if (e.boss) { enemyShoot(e, Math.atan2(dy, dx) - 0.3, 58); enemyShoot(e, Math.atan2(dy, dx) + 0.3, 58); } SND.shoot(e.x / LW); }
        break;
      case 'summoner': {
        keepAway(50);
        if (e.t <= 0 && lineClear(e, P)) { e.t = 2.8 + rnd(); enemyShoot(e, Math.atan2(dy, dx), 46); SND.shoot(e.x / LW); }
        const mine = room.enemies.filter((x) => x.owner === e).length;
        if (e.t2 <= 0 && mine < (e.boss ? 4 : 3)) {
          e.t2 = e.boss ? 5 : 6.5;
          const base = run.content.monsters.slice().sort((a, b) => a.tier - b.tier)[0];
          for (let k = 0; k < 2; k++) { const s = randomFloorNear(e.x, e.y, 8, 18); if (!s) continue; const m = makeEnemy(base, s.x, s.y, { minion: true }); m.owner = e; m.spawnT = 0.5; m.beh = 'chaser'; m.hidden = false; room.enemies.push(m); burst(s.x, s.y, '#b48bff', 8, 25, true); }
          SND.summon(e.x / LW);
        }
        break;
      }
      case 'tank':
        if (e.state === 'move') { chase(1); if (e.t <= 0 && d < 70 && lineClear(e, P)) { e.state = 'wind'; e.t = 0.6; e.cx = ux; e.cy = uy; } }
        else if (e.state === 'wind') { e.wob += dt * 40; if (e.t <= 0) { e.state = 'charge'; e.t = 0.55; } }
        else if (e.state === 'charge') { if (step(e.cx * 85, e.cy * 85) || e.t <= 0) { e.state = 'move'; e.t = 3.5 + rnd() * 1.5; if (e.t <= 0.5) fx.shake = Math.max(fx.shake, 0.15); } }
        break;
      case 'trickster':
        chase(1.05);
        if (e.t <= 0) {
          e.t = 2.4 + rnd() * 1.4;
          const s = randomFloorNear(P.x, P.y, 18, 36);
          if (s) { burst(e.x, e.y, '#ffffff', 8, 25, true); e.x = s.x; e.y = s.y; e.spawnT = 0.15; burst(e.x, e.y, '#ffffff', 8, 25, true); SND.blink(e.x / LW); }
        }
        break;
      default: chase(e.beh === 'swarm' ? 1.1 : 1);
    }
    // Bosses add a ring of shots now and then, whatever they are.
    if (e.boss && e.t3 <= 0) { e.t3 = 6 + rnd() * 2; const n = 8 + Math.min(6, run.floorN); for (let k = 0; k < n; k++) enemyShoot(e, k / n * Math.PI * 2 + rnd() * 0.2, 42, { mult: 0.7 }); SND.shoot(e.x / LW); fx.shake = Math.max(fx.shake, 0.15); }
    // Abilities.
    const a = e.abil;
    // Ring shot: a burst of shots in every direction now and then.
    if (a.has('ring shot') && !e.hidden && d < 120) {
      e.ringT = (e.ringT == null ? 2 + rnd() * 2 : e.ringT) - dt;
      if (e.ringT <= 0) { e.ringT = e.boss ? 3.5 : 4.5; const n = e.boss ? 12 : 8, off = rnd(); for (let k = 0; k < n; k++) enemyShoot(e, (k + off) / n * Math.PI * 2, 38, { mult: 0.6 }); SND.shoot(e.x / LW); }
    }
    // Regenerates: heals when you leave it alone for a moment.
    if (a.has('regenerates') && e.hp < e.maxHp && time - (e.lastHitT || 0) > 1.8) {
      e.hp = Math.min(e.maxHp, e.hp + e.maxHp * 0.05 * dt); if (rnd() < dt * 4) burst(e.x, e.y - 4, '#72e07e', 1, 12, true); if (e.boss) DF.UI.bossBar(e);
    }
    // Slams: winds up when you're close, then a shockwave all around it.
    if (a.has('slams') && !e.hidden) {
      if (e.slamWind > 0) {
        e.slamWind -= dt;
        if (e.slamWind <= 0) {
          fx.shake = Math.max(fx.shake, 0.25); SND.bash(e.x / LW); breakPropsNear(e.x, e.y, 24);
          for (let k = 0; k < 20; k++) { const ang = k / 20 * Math.PI * 2; fx.particles.push({ x: e.x + Math.cos(ang) * 6, y: e.y + Math.sin(ang) * 4, vx: Math.cos(ang) * 70, vy: Math.sin(ang) * 50, life: 0.3, max: 0.3, color: '#d8c8a0', size: 1, glow: false, g: 0 }); }
          if (dist(P, e) < 25 + P.r) { hurtPlayer(Math.round(e.dmg * 1.2), e); const k2 = Math.atan2(P.y - e.y, P.x - e.x); P.vx += Math.cos(k2) * 140; P.vy += Math.sin(k2) * 140; P.knockT = 0.15; }
        }
      } else {
        e.slamT = (e.slamT == null ? 1.5 : e.slamT) - dt;
        if (e.slamT <= 0 && d < 22) { e.slamWind = 0.55; e.slamT = 3.2 + rnd(); }
      }
    }
    // Burrows: dives underground, travels unseen, and pops up beside you.
    if (a.has('burrows')) {
      if (e.burrowing > 0) {
        e.burrowing -= dt;
        if (rnd() < dt * 10) burst(e.x, e.y + 1, '#6a5a4a', 1, 10);
        if (e.burrowing <= 0) { const s = randomFloorNear(P.x, P.y, 12, 26); if (s) { e.x = s.x; e.y = s.y; } e.hidden = false; e.spawnT = 0.2; for (let k = 0; k < 10; k++) burst(e.x, e.y, '#8a6a4a', 1, 35); SND.bash(e.x / LW); }
      } else if (!e.hidden) {
        e.burT = (e.burT == null ? 2.5 + rnd() * 2 : e.burT) - dt;
        if (e.burT <= 0 && d < 110) { e.burT = 5 + rnd() * 2; e.burrowing = 1.1; e.hidden = true; for (let k = 0; k < 10; k++) burst(e.x, e.y, '#8a6a4a', 1, 30); }
      }
    }
    if ((a.has('fire trail') || a.has('freezes floor') || a.has('poison trail')) && !e.hidden) {
      e.trailT -= dt;
      // A trail only leaves a new patch where there isn't one already, and a room holds at most 30 of them.
      const isPatch = (ef) => ef.type === 'fire' || ef.type === 'ice' || ef.type === 'ooze';
      const near = e.trailT <= 0 && room.effects.some((ef) => isPatch(ef) && Math.abs(ef.x - e.x) < 4 && Math.abs(ef.y - e.y - 1) < 4);
      if (near) { e.trailT = 0.15; const ef = room.effects.find((f) => isPatch(f) && Math.abs(f.x - e.x) < 4 && Math.abs(f.y - e.y - 1) < 4); if (ef) ef.life = Math.max(ef.life, ef.max * 0.8); }
      if (e.trailT <= 0) {
        const patches = room.effects.filter(isPatch);
        if (patches.length >= 30) room.effects.splice(room.effects.indexOf(patches[0]), 1);
        const kinds = [a.has('fire trail') && 'fire', a.has('freezes floor') && 'ice', a.has('poison trail') && 'ooze'].filter(Boolean), kind = pick(kinds), ice = kind === 'ice';
        e.trailT = e.boss ? 0.25 : 0.4; room.effects.push({ type: kind, x: e.x, y: e.y + 1, r: e.boss ? 6 : 4, life: ice ? 4 : 2.6, max: ice ? 4 : 2.6, dmg: Math.max(1, Math.round(e.dmg * 0.5)), from: e.spec.name }); }
    }
    if (a.has('heals friends')) {
      e.healT = (e.healT == null ? 3 : e.healT) - dt;
      if (e.healT <= 0) { e.healT = 4; let any = false; room.enemies.forEach((x) => { if (x !== e && x.hp < x.maxHp && dist(x, e) < 45) { x.hp = Math.min(x.maxHp, x.hp + Math.ceil(x.maxHp * 0.2)); burst(x.x, x.y - 3, '#72e07e', 6, 20, true); floatText(x.x, x.y - 8, '+', '#72e07e'); any = true; if (x.boss) DF.UI.bossBar(x); } }); if (any) SND.heal(e.x / LW); }
    }
    if (a.has('shields')) { e.shT = (e.shT == null ? 1 : e.shT) - dt; if (e.shT <= 0 && !e.shield) { e.shT = 6; e.shield = 1; SND.shield(e.x / LW); } }
    if (a.has('pulls you in') && !e.hidden) {
      e.pullT = (e.pullT == null ? 2.5 : e.pullT) - dt;
      if (e.pullT <= 0 && d < 75) { e.pullT = 5; P.pull = { x: e.x, y: e.y, t: 0.9 }; for (let k = 0; k < 10; k++) fx.particles.push({ x: P.x + (rnd() - 0.5) * 20, y: P.y + (rnd() - 0.5) * 20, vx: ux * -40, vy: uy * -40, life: 0.5, max: 0.5, color: '#b48bff', size: 1, glow: true, g: 0 }); }
    }
    // Touching you hurts.
    if (!e.hidden && d < e.r + P.r + 0.5) hurtPlayer(e.dmg, e, a.has('poisons') ? 'poison' : '');
  }
  function separate() {
    const es = room.enemies;
    for (let i = 0; i < es.length; i++) for (let j = i + 1; j < es.length; j++) {
      const a = es[i], b = es[j], dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy), m = a.r + b.r;
      if (d > 0.01 && d < m) { const push = (m - d) / 2, ux = dx / d, uy = dy / d; move(a, -ux * push, -uy * push); move(b, ux * push, uy * push); }
    }
  }
  function updateProjectiles(dt) {
    for (const p of fx.projectiles) {
      if (p.dead) continue;
      p.life -= dt; if (p.life <= 0) { p.dead = true; continue; }
      const nx = p.x + p.vx * dt, ny = p.y + p.vy * dt;
      const t = tileAt(Math.floor(nx / T), Math.floor(ny / T));
      const pr = propAt(Math.floor(nx / T), Math.floor(ny / T));
      if (pr) { breakProp(pr); if (!p.pierce || !p.mine) { p.dead = true; continue; } }
      if (t === TL.WALL || t === TL.BLOCK || t === TL.BRAZIER) {
        if (p.bounce > 0) {
          p.bounce--;
          if (tileAt(Math.floor(nx / T), Math.floor(p.y / T)) !== TL.FLOOR && tileAt(Math.floor(nx / T), Math.floor(p.y / T)) !== TL.HAZ) p.vx = -p.vx; else p.vy = -p.vy;
          p.hit && p.hit.clear(); SND.clink(p.x / LW); continue;
        }
        p.dead = true; burst(p.x, p.y, p.color, 3, 20, true); continue;
      }
      p.x = nx; p.y = ny;
      if (p.seek) {
        let tg = null, bd = 90; for (const e of room.enemies) { if (e.hidden || e.dead || p.hit.has(e)) continue; const d = Math.hypot(e.x - p.x, e.y - p.y); if (d < bd) { bd = d; tg = e; } }
        const sp = Math.min(150, Math.hypot(p.vx, p.vy) + dt * 160);
        if (tg) { const want = Math.atan2(tg.y - 2 - p.y, tg.x - p.x); let a = Math.atan2(p.vy, p.vx), da = want - a; while (da > Math.PI) da -= Math.PI * 2; while (da < -Math.PI) da += Math.PI * 2; a += clamp(da, -dt * 7, dt * 7); p.vx = Math.cos(a) * sp; p.vy = Math.sin(a) * sp; }
      }
      if (p.mine) {
        for (const e of room.enemies) {
          if (p.hit.has(e) || e.hidden || e.spawnT > 0 || Math.hypot(e.x - p.x, e.y - 2 - p.y) > e.r + p.r) continue;
          p.hit.add(e);
          const w = run.eq.weapon;
          damageEnemy(e, stats().attack * p.dmg, p.spellEl ? { from: p, knock: 30, element: p.spellEl, luck: stats().luckF } : { from: p, knock: 30, powers: (w ? w.powers : []).filter((x) => x !== 'multishot'), element: w ? w.element : 'none', luck: stats().luckF });
          if (!p.pierce) { p.dead = true; break; }
        }
      } else if (Math.hypot(P.x - p.x, P.y - 2 - p.y) < P.r + p.r) {
        if (P.bash && P.bash.t > 0) { p.dead = true; burst(p.x, p.y, p.color, 4, 30, true); SND.clink(p.x / LW); continue; }
        if (P.inv <= 0) { hurtPlayer(p.dmg, p, p.poison ? 'poison' : ''); if (p.el === 'ice') P.slowT = 1.2; }
        p.dead = true;
      }
    }
    fx.projectiles = fx.projectiles.filter((p) => !p.dead);
  }
  function updateEffects(dt) {
    for (const ef of room.effects) {
      ef.life -= dt;
      if (ef.type === 'boom' && ef.life <= 0 && !ef.done) {
        ef.done = true; SND.boom(1.5, ef.x / LW); fx.shake = Math.max(fx.shake, 0.35);
        for (let i = 0; i < 24; i++) burst(ef.x, ef.y, i % 2 ? '#ffcf4a' : '#ff6a2a', 1, 70, true);
        if (!ef.mine && dist(P, ef) < ef.r + P.r) hurtPlayer(ef.dmg, ef);
        breakPropsNear(ef.x, ef.y, ef.r);
        room.enemies.slice().forEach((e) => { if (dist(e, ef) < ef.r + (ef.mine ? e.r : 0)) damageEnemy(e, ef.dmg, ef.mine ? { from: ef, knock: ef.bomb ? 110 : 80, element: ef.bomb ? 'none' : 'fire', powers: ef.bomb ? [] : ['burn'] } : { from: ef, knock: 80 }); });
      }
      if (ef.type === 'fire' && rnd() < dt * 1.5) burst(ef.x + (rnd() - 0.5) * ef.r, ef.y, '#ff9a3a', 1, 8, true);
    }
    room.effects = room.effects.filter((ef) => ef.life > 0);
    for (const p of fx.particles) { p.life -= dt; if (p.bolt) continue; p.x += p.vx * dt; p.y += p.vy * dt; p.vy += (p.g || 0) * dt; p.vx *= 0.96; }
    fx.particles = fx.particles.filter((p) => p.life > 0);
    if (fx.particles.length > 500) fx.particles.splice(0, fx.particles.length - 500);
    for (const t of fx.texts) { t.life -= dt; t.y -= dt * (t.big ? 10 : 14); }
    fx.texts = fx.texts.filter((t) => t.life > 0);
    for (const p of room.pickups) if (!p.settled) settlePickup(p);
    for (const p of room.pickups) if (p.vy != null) { p.z = (p.z || 0) + p.vy * dt; p.vy += 120 * dt; if (p.z > 0) { p.z = 0; p.vy = null; } }
  }

  /* ================= The main loop ================= */
  const G = { mode: 'camp', hold, input };
  let lastT = performance.now(), time = 0;
  function frame(now) {
    let dt = Math.min(0.05, (now - lastT) / 1000); lastT = now;
    time += dt;
    if (G.mode === 'play') {
      readKeys();
      const paused = hold.size > 0;
      if (!paused && run && !P.dead) { meta.stats.playSecs += dt; run.playSecs = (run.playSecs || 0) + dt; }
      if (fx.hitstop > 0) { fx.hitstop -= dt; dt = 0; }
      if (fx.slowmo > 0) { fx.slowmo -= dt; dt *= 0.35; }
      if (!paused && !fx.fadeDir && dt > 0) {
        updatePlayer(dt);
        if (room) {
          room.enemies.slice().forEach((e) => { if (!e.dead) updateEnemy(e, dt); });
          // Only hidden ambushers left? They give themselves away, so the doors never stay shut on an empty-looking room.
          if (room.locked && room.enemies.length && room.enemies.every((e) => e.hidden)) {
            room.hideT = (room.hideT || 0) + dt;
            if (room.hideT > 1.5) { room.enemies.forEach(reveal); room.hideT = 0; DF.UI.toast('Something was hiding in here!'); }
          } else room.hideT = 0;
          separate();
          updateProjectiles(dt);
          updateEffects(dt);
        }
      } else if (!paused) updateEffects(dt * 0.5);
      if (fx.fadeDir) {
        fx.fade = clamp(fx.fade + fx.fadeDir * dt / 0.16, 0, 1);
        if (fx.fadeDir > 0 && fx.fade >= 1) { const cb = fx.fadeCb; fx.fadeCb = null; fx.fadeDir = -1; if (cb) cb(); }
        else if (fx.fadeDir < 0 && fx.fade <= 0) fx.fadeDir = 0;
      }
      fx.shake = Math.max(0, fx.shake - dt * 1.8);
      if (room && run) render();
      if (room) SND.mood(room.locked ? (room.enemies.some((e) => e.boss) ? 2 : 1) : 0);
      updateHUD();
    }
    requestAnimationFrame(frame);
  }

  /* ================= Drawing ================= */
  const cv = $('#cv'), ctx = cv.getContext('2d');
  const lo = document.createElement('canvas'); lo.width = LW; lo.height = LH; const lg = lo.getContext('2d');
  const lit = document.createElement('canvas'); lit.width = LW * 2; lit.height = LH * 2; const litg = lit.getContext('2d');
  let S = 4, dpr = 1;
  function resize() {
    const st = $('#stage');
    dpr = Math.min(3, window.devicePixelRatio || 1);
    // Phones held upright: the room sits snug under the top bar and the thumbs get the rest.
    const upright = document.body.classList.contains('touch') && innerHeight > innerWidth * 1.15;
    st.style.flex = ''; st.style.height = '';
    if (upright) {
      const w = st.getBoundingClientRect().width, h = Math.min(w * LH / LW, innerHeight * 0.52);
      st.style.flex = 'none'; st.style.height = Math.floor(h) + 'px';
    }
    const r = st.getBoundingClientRect();
    S = Math.max(1, Math.floor(Math.min(r.width * dpr / LW, r.height * dpr / LH)));
    // On big screens, allow a fractional scale in steps of whole device pixels so the room fills the space.
    cv.width = LW * S; cv.height = LH * S;
    cv.style.width = (LW * S / dpr) + 'px'; cv.style.height = (LH * S / dpr) + 'px';
    if (room && run && G.mode === 'play') render();
  }
  window.addEventListener('resize', () => { clearTimeout(resize.t); resize.t = setTimeout(resize, 60); });
  function noise2(x, y, s) { let h = (x * 374761393 + y * 668265263 + s * 2147483647) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; }
  function renderRoomBg(r) {
    const c = document.createElement('canvas'); c.width = LW; c.height = LH; const g = c.getContext('2d');
    const th = run.content.theme, col = th.colors, seed = r.gx * 31 + r.gy * 7;
    const f1 = col.floor, f2 = C.lighten(col.floor, 0.06), f3 = C.darken(col.floor, 0.25), fspeck = C.mix(col.floor, col.accent, 0.18);
    const w1 = col.wall, wTop = C.lighten(col.wall, 0.22), wDark = C.darken(col.wall, 0.4), wLine = C.darken(col.wall, 0.25);
    for (let ty = 0; ty < RH; ty++) for (let tx = 0; tx < RW; tx++) {
      const t = r.tiles[ty * RW + tx], X = tx * T, Y = ty * T;
      const isDoor = isDoorTile(tx, ty) && r.doors[doorDirAt(tx, ty)];
      if (t === TL.WALL && !isDoor) {
        g.fillStyle = w1; g.fillRect(X, Y, T, T);
        // bricks
        g.fillStyle = wLine;
        for (let by = 0; by < T; by += 4) { g.fillRect(X, Y + by + 3, T, 1); const off = ((ty * 2 + by / 4) % 2) * 4; g.fillRect(X + off, Y + by, 1, 3); }
        if (noise2(tx, ty, seed) < 0.15) { g.fillStyle = wTop; g.fillRect(X + 2 + Math.floor(noise2(ty, tx, 3) * 4), Y + 1, 2, 1); }
        continue;
      }
      // floor (and the floor under everything else)
      g.fillStyle = (tx + ty) % 2 ? f1 : f2; g.fillRect(X, Y, T, T);
      g.fillStyle = f3; g.fillRect(X, Y + T - 1, T, 1); g.fillRect(X + T - 1, Y, 1, T);
      for (let k = 0; k < 3; k++) { const n = noise2(tx * 3 + k, ty * 5 - k, seed); if (n < 0.45) { g.fillStyle = n < 0.12 ? fspeck : f3; g.fillRect(X + Math.floor(noise2(tx, k, seed + 1) * 7), Y + Math.floor(noise2(k, ty, seed + 2) * 7), 1, 1); } }
      if (isDoor) { g.fillStyle = C.darken(col.floor, 0.55); g.fillRect(X, Y, T, T); }
      if (t === TL.BLOCK) {
        g.fillStyle = wDark; g.fillRect(X, Y + 2, T, T - 2);
        g.fillStyle = wTop; g.fillRect(X, Y, T, T - 3);
        g.fillStyle = C.lighten(col.wall, 0.4); g.fillRect(X + 1, Y + 1, T - 3, 1);
        g.fillStyle = 'rgba(0,0,0,0.35)'; g.fillRect(X, Y + T, T, 2);
      } else if (t === TL.PIT) {
        g.fillStyle = '#050407'; g.fillRect(X, Y, T, T);
        if (tileAt2(r, tx, ty - 1) !== TL.PIT) { g.fillStyle = f3; g.fillRect(X, Y, T, 2); g.fillStyle = C.darken(col.wall, 0.6); g.fillRect(X, Y + 2, T, 2); }
      } else if (t === TL.HAZ) {
        const hc = hazardColor(th);
        g.fillStyle = C.darken(hc, 0.35); g.fillRect(X, Y, T, T);
        g.fillStyle = C.darken(hc, 0.1); g.fillRect(X + 1, Y + 1, T - 2, T - 2);
      } else if (t === TL.SPRING) {
        g.fillStyle = C.darken(col.wall, 0.3); g.fillRect(X, Y, T, T);
        g.fillStyle = C.mix(col.light, '#5affd0', 0.4); g.fillRect(X + 1, Y + 1, T - 2, T - 2);
      } else if (t === TL.BRAZIER) {
        g.fillStyle = wDark; g.fillRect(X + 1, Y + 3, T - 2, T - 3);
        g.fillStyle = wTop; g.fillRect(X, Y + 2, T, 2);
      }
    }
    decorateRoom(g, r, th);
    // Wall shading where the wall meets the floor (a soft shadow along the top wall).
    g.fillStyle = 'rgba(0,0,0,0.28)'; g.fillRect(T, T, LW - 2 * T, 2);
    g.fillStyle = C.lighten(col.wall, 0.12); g.fillRect(T, T - 1, LW - 2 * T, 1);
    // Door frames.
    for (const d in r.doors) {
      const [tx, ty] = DOOR_TILE[d], X = tx * T, Y = ty * T;
      g.fillStyle = wTop;
      if (d === 'n' || d === 's') { g.fillRect(X - 1, Y, 1, T); g.fillRect(X + T, Y, 1, T); } else { g.fillRect(X, Y - 1, T, 1); g.fillRect(X, Y + T, T, 1); }
    }
    return c;
  }
  /* ---- Floor decorations: carved circles, mosaics, runners, cracks, bones, moss and banners ----
     Painted once into the room's background, in the floor's own colours, and the same every visit. */
  function decorateRoom(g, r, th) {
    const col = th.colors, el = th.element, R = DF.seeded(th.name + '|' + r.gx + ',' + r.gy), rf = () => R(10000) / 10000;
    const carve = C.darken(col.floor, 0.38), carve2 = C.darken(col.floor, 0.2), inlay = C.mix(col.floor, col.accent, 0.32), inlayHi = C.mix(col.floor, col.accent, 0.55);
    const floorAt = (x, y) => { const tx = Math.floor(x / T), ty = Math.floor(y / T); if (tx < 1 || ty < 1 || tx >= RW - 1 || ty >= RH - 1) return false; const t = r.tiles[ty * RW + tx]; return t === TL.FLOOR; };
    const px = (x, y, c) => { x = Math.round(x); y = Math.round(y); if (!floorAt(x, y)) return; g.fillStyle = c; g.fillRect(x, y, 1, 1); };
    const ring = (cx, cy, rad, c, dash) => { const n = Math.ceil(rad * 7); for (let i = 0; i < n; i++) { if (dash && (i % dash) < dash / 2) continue; const a = i / n * Math.PI * 2; px(cx + Math.cos(a) * rad, cy + Math.sin(a) * rad, c); } };
    const line = (x0, y0, x1, y1, c) => { const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0)); for (let i = 0; i <= n; i++) px(x0 + (x1 - x0) * i / n, y0 + (y1 - y0) * i / n, c); };
    const cx = LW / 2, cy = LH / 2 + 0.5;
    // A rune circle: rings, spokes and little glyphs, the inner bits picked out in the floor's accent.
    function runeCircle(rad, glow) {
      // Solid carved bands: a dark groove, a raised stone ring, another groove; then an inner ring and spokes.
      const stone = C.lighten(col.floor, 0.07), stoneHi = C.lighten(col.floor, 0.14);
      const inner = rad * 0.56, rot = rf() * Math.PI, spokes = 6 + R(3) * 2;
      for (let y = -rad - 1; y <= rad + 1; y++) for (let x = -rad - 1; x <= rad + 1; x++) {
        const d = Math.hypot(x, y), X = cx + x, Y = cy + y;
        if (d <= rad && d > rad - 1.2) px(X, Y, carve);
        else if (d <= rad - 1.2 && d > rad - 4.2) px(X, Y, y < 0 && d > rad - 2.2 ? stoneHi : stone);
        else if (d <= rad - 4.2 && d > rad - 5.4) px(X, Y, carve);
        else if (d <= inner && d > inner - 1.2) px(X, Y, carve);
        else if (d <= inner - 1.2 && d > inner - 3) px(X, Y, stone);
        else if (d <= inner - 3 && d > inner - 4) px(X, Y, carve2);
      }
      // Glyphs set into the stone ring, glowing in the floor's accent.
      const glyphs = spokes * 2;
      for (let k = 0; k < glyphs; k++) {
        const a = rot + k / glyphs * Math.PI * 2, gx = Math.round(cx + Math.cos(a) * (rad - 2.7)), gy = Math.round(cy + Math.sin(a) * (rad - 2.7));
        const c = glow ? (k % 2 ? inlayHi : inlay) : (k % 2 ? inlay : carve2);
        if (k % 2) { px(gx, gy, c); px(gx + 1, gy, c); px(gx, gy - 1, c); } else { px(gx, gy, c); px(gx - 1, gy + 1, c); px(gx + 1, gy + 1, c); }
      }
      for (let k = 0; k < spokes; k++) { const a = rot + k / spokes * Math.PI * 2; line(cx + Math.cos(a) * inner, cy + Math.sin(a) * inner, cx + Math.cos(a) * (rad - 5.4), cy + Math.sin(a) * (rad - 5.4), carve2); }
      if (glow) { ring(cx, cy, inner - 2, inlay, 3); px(cx, cy, inlayHi); px(cx - 1, cy, inlay); px(cx + 1, cy, inlay); px(cx, cy - 1, inlay); px(cx, cy + 1, inlay); }
    }
    // A diamond mosaic in the middle of the room.
    function mosaic(w, h) {
      const stone = C.lighten(col.floor, 0.07), stoneHi = C.lighten(col.floor, 0.13);
      for (let y = -h - 1; y <= h + 1; y++) for (let x = -w - 1; x <= w + 1; x++) {
        const d = Math.abs(x) / w + Math.abs(y) / h, X = cx + x, Y = cy + y, edge = 1.6 / Math.min(w, h);
        if (d > 1) continue;
        if (d > 1 - edge) px(X, Y, carve); // outer groove
        else if (d > 1 - edge * 3) px(X, Y, y < 0 ? stoneHi : stone); // raised stone border
        else if (d > 1 - edge * 4) px(X, Y, carve);
        else if (d < 0.42 && d > 0.42 - edge * 1.6) px(X, Y, carve2); // inner diamond
        else if (d <= 0.42 - edge * 1.6) px(X, Y, (x + y) % 2 === 0 ? inlay : C.mix(col.floor, col.accent, 0.2)); // inlaid centre
        else if ((Math.abs(x) + Math.abs(y)) % 5 === 0) px(X, Y, carve2); // fine pattern
      }
    }
    // A worn runner rug between two doors.
    function runner(dir) {
      const rugA = C.mix(col.floor, th.colors.accent, 0.18), rugB = C.darken(C.mix(col.floor, th.colors.accent, 0.3), 0.2);
      const horiz = dir === 'h', len = horiz ? LW - 2 * T - 6 : LH - 2 * T - 6, wid = 9;
      for (let i = 0; i < len; i++) for (let j = 0; j < wid; j++) {
        const X = horiz ? T + 3 + i : cx - wid / 2 + j, Y = horiz ? cy - wid / 2 + j : T + 3 + i;
        const edge = j === 0 || j === wid - 1, trim = j === 2 || j === wid - 3;
        if (rf() < 0.06) continue; // worn patches
        px(X, Y, edge ? carve : trim ? (i % 4 < 2 ? inlay : rugB) : rugA);
      }
    }
    if (r.type === 'start') runeCircle(20, false);
    else if (r.type === 'boss') runeCircle(30, true);
    else if (r.type === 'forge') runeCircle(16, true);
    else if (r.type === 'treasure') mosaic(18, 13);
    else if (r.type === 'camp') { // a ring of soot round the fire, and a bedroll
      for (let i = 0; i < 90; i++) { const a = rf() * Math.PI * 2, d = 6 + rf() * 7; px(cx + Math.cos(a) * d, cy + 2 + Math.sin(a) * d * 0.7, C.darken(col.floor, 0.3)); }
      const bx = cx + 18, by = cy + 6; for (let y = 0; y < 4; y++) for (let x = 0; x < 12; x++) px(bx + x, by + y, x < 3 ? '#c8b89a' : y === 0 || y === 3 ? '#5a3a2a' : '#8a4a3a');
    } else if (r.type === 'fight') {
      const pickD = rf(), d = r.doors;
      if (pickD < 0.3) mosaic(14 + R(6), 10 + R(4));
      else if (pickD < 0.55 && d.w && d.e) runner('h');
      else if (pickD < 0.55 && d.n && d.s) runner('v');
      else if (pickD < 0.7) runeCircle(14 + R(6), false);
    }
    // Scattered details, by the floor's element.
    const nCracks = 2 + R(4);
    for (let k = 0; k < nCracks; k++) { // cracks: a little jagged line with a branch
      let x = T + 4 + rf() * (LW - 2 * T - 8), y = T + 4 + rf() * (LH - 2 * T - 8);
      const n = 4 + R(5); let a = rf() * Math.PI * 2;
      for (let i = 0; i < n; i++) { px(x, y, carve); a += (rf() - 0.5) * 1.2; x += Math.cos(a); y += Math.sin(a); if (i === 2 && rf() < 0.6) { px(x + 1, y + 1, carve2); px(x + 2, y + 2, carve2); } }
    }
    const spot = () => [T + 3 + rf() * (LW - 2 * T - 6), T + 3 + rf() * (LH - 2 * T - 6)];
    const bone = '#d8ccb4', boneD = '#9a8e78';
    const nBones = el === 'shadow' || el === 'poison' ? 3 + R(3) : R(3);
    for (let k = 0; k < nBones; k++) {
      const [x, y] = spot();
      if (rf() < 0.35) { px(x, y, bone); px(x + 1, y, bone); px(x + 2, y, bone); px(x, y + 1, bone); px(x + 1, y + 1, carve); px(x + 2, y + 1, bone); px(x + 1, y + 2, boneD); } // a little skull
      else { const len = 3 + R(3), dx = rf() < 0.5 ? 1 : 0, dy = 1 - dx; for (let i = 0; i < len; i++) px(x + dx * i, y + dy * i, i === 0 || i === len - 1 ? boneD : bone); } // a bone
    }
    // Pebbles and rubble from the walls.
    for (let k = 0; k < 6 + R(6); k++) { const [x, y] = spot(); px(x, y, C.lighten(col.wall, 0.1)); if (rf() < 0.4) px(x + 1, y, C.darken(col.wall, 0.2)); }
    // The element's own touch.
    const tuft = (x, y, c1, c2) => { px(x, y, c1); px(x - 1, y - 1, c2); px(x + 1, y - 1, c2); px(x, y - 2, c1); };
    if (el === 'nature' || el === 'poison' || el === 'earth') { // moss and grass, thickest along the walls
      const g1 = el === 'poison' ? '#4a8a2a' : el === 'earth' ? '#6a7a2a' : '#3a8a3a', g2 = el === 'poison' ? '#7ad83a' : el === 'earth' ? '#9aa840' : '#5ab84a';
      for (let k = 0; k < 14 + R(10); k++) { const edge = R(4), t = rf(); const x = edge < 2 ? T + 2 + t * (LW - 2 * T - 4) : edge === 2 ? T + 2 + rf() * 6 : LW - T - 3 - rf() * 6; const y = edge === 0 ? T + 3 + rf() * 5 : edge === 1 ? LH - T - 2 - rf() * 5 : T + 3 + t * (LH - 2 * T - 6); tuft(x, y, g1, g2); }
    } else if (el === 'ice') { // frost crystals
      for (let k = 0; k < 8 + R(6); k++) { const [x, y] = spot(); px(x, y, '#cdeeff'); px(x - 1, y, '#8fc8e0'); px(x + 1, y, '#8fc8e0'); px(x, y - 1, '#8fc8e0'); px(x, y + 1, '#8fc8e0'); }
    } else if (el === 'fire' || el === 'lightning') { // scorch marks
      for (let k = 0; k < 3 + R(3); k++) { const [x, y] = spot(); for (let i = 0; i < 18; i++) px(x + (rf() - 0.5) * 7, y + (rf() - 0.5) * 5, C.darken(col.floor, 0.45)); if (el === 'fire') px(x, y, '#c84a1a'); }
    } else if (el === 'shadow' || el === 'light') { // glowing glyphs set in the floor
      for (let k = 0; k < 4 + R(3); k++) { const [x, y] = spot(); const c = el === 'light' ? '#e8d8a0' : '#6a4aa8'; px(x, y, c); px(x + 2, y, c); px(x + 1, y + 1, c); px(x, y + 2, c); px(x + 2, y + 2, c); }
    }
    // Cobwebs in a corner or two.
    const web = 'rgba(220,214,230,0.35)';
    [[T, T, 1, 1], [LW - T - 1, T, -1, 1]].forEach(([x0, y0, sx, sy]) => {
      if (rf() < 0.5) return;
      for (let i = 0; i < 6; i++) { px(x0 + sx * i, y0 + sy * (5 - i), web); }
      for (let i = 0; i < 4; i++) px(x0 + sx * i, y0 + sy * i, web);
      px(x0 + sx * 2, y0 + sy, web); px(x0 + sx, y0 + sy * 2, web);
    });
    // Banners and skull niches on the top wall, between the torches and away from the door.
    const torchX = new Set((r.torches || []).filter(([, ty]) => ty === 0).map(([tx]) => tx));
    const bannerC = C.mix(col.accent, '#000000', 0.35), bannerT = C.mix(col.accent, '#ffffff', 0.15);
    for (const tx of [2, 5, 9, 12]) {
      if (torchX.has(tx) || torchX.has(tx - 1) || torchX.has(tx + 1) || rf() < 0.45) continue;
      const X = tx * T + 1, Y = 1;
      if (rf() < 0.6) { // a banner
        g.fillStyle = '#3a2a1a'; g.fillRect(X - 1, Y, 8, 1);
        g.fillStyle = bannerC; g.fillRect(X, Y + 1, 6, 5); g.fillRect(X, Y + 6, 2, 1); g.fillRect(X + 4, Y + 6, 2, 1);
        g.fillStyle = bannerT; g.fillRect(X + 2, Y + 2, 2, 2);
      } else { // a niche with a skull
        g.fillStyle = C.darken(col.wall, 0.55); g.fillRect(X, Y + 1, 6, 5);
        g.fillStyle = bone; g.fillRect(X + 1, Y + 2, 4, 2); g.fillRect(X + 2, Y + 4, 2, 1);
        g.fillStyle = '#1a1420'; g.fillRect(X + 1, Y + 3, 1, 1); g.fillRect(X + 4, Y + 3, 1, 1);
      }
    }
  }
  const tileAt2 = (r, tx, ty) => (tx < 0 || ty < 0 || tx >= RW || ty >= RH ? TL.WALL : r.tiles[ty * RW + tx]);
  function hazardColor(th) { return { fire: '#ff5a1a', ice: '#5ab8e0', lightning: '#ffd23a', poison: '#7ad83a', earth: '#c8803a', light: '#ffe9a8', shadow: '#7a4ad8', nature: '#3ab85a' }[th.element] || th.colors.accent; }

  function drawSprite(g, sp, x, y, dir, scale, alpha) {
    const img = dir < 0 ? sp.left : sp.right, w = sp.w * scale, h = sp.h * scale;
    if (alpha != null) g.globalAlpha = alpha;
    g.drawImage(img, Math.round(x - w / 2), Math.round(y - h), w, h);
    g.globalAlpha = 1;
  }
  function shadow(g, x, y, w) { g.fillStyle = 'rgba(0,0,0,0.35)'; g.fillRect(Math.round(x - w / 2), Math.round(y), Math.round(w), 1); g.fillRect(Math.round(x - w / 2 + 1), Math.round(y + 1), Math.max(1, Math.round(w - 2)), 1); }
  function render() {
    const th = run.content.theme, col = th.colors;
    lg.imageSmoothingEnabled = false;
    lg.drawImage(room.bg, 0, 0);
    const lights = [];
    const flick = (k) => 0.92 + Math.sin(time * 9 + k * 3.1) * 0.04 + Math.sin(time * 23 + k) * 0.03;
    // Hazard shimmer, springs and braziers.
    for (let ty = 1; ty < RH - 1; ty++) for (let tx = 1; tx < RW - 1; tx++) {
      const t = room.tiles[ty * RW + tx], X = tx * T, Y = ty * T;
      if (t === TL.HAZ) {
        const hc = hazardColor(th);
        lg.fillStyle = C.lighten(hc, 0.35);
        for (let k = 0; k < 2; k++) { const p = (time * 1.3 + k * 0.5 + noise2(tx, ty, k)) % 1; lg.globalAlpha = Math.sin(p * Math.PI); lg.fillRect(X + 1 + Math.floor(noise2(tx, ty, k + 5) * 5), Y + 1 + Math.floor(noise2(ty, tx, k + 9) * 5), 2, 1); }
        lg.globalAlpha = 1;
        lights.push({ x: X + 4, y: Y + 4, r: 12, a: 0.55, c: hc });
      } else if (t === TL.SPRING && room.springLeft > 0) {
        lg.fillStyle = '#ffffff'; lg.globalAlpha = 0.5 + Math.sin(time * 3 + tx) * 0.3; lg.fillRect(X + 3, Y + 3, 2, 2); lg.globalAlpha = 1;
        lights.push({ x: X + 4, y: Y + 4, r: 18, a: 0.8, c: '#7affd8' });
      } else if (t === TL.BRAZIER) {
        drawFlame(lg, X + 4, Y + 3, 3, col.accent, tx);
        lights.push({ x: X + 4, y: Y + 2, r: 34 * flick(tx), a: 1, c: col.light });
      }
    }
    // Wall torches.
    room.torches.forEach(([tx, ty], k) => {
      const X = tx * T + 4, Y = ty * T + (ty === 0 ? 5 : ty === RH - 1 ? 1 : 3);
      lg.fillStyle = '#3a2a1a'; lg.fillRect(X - 1, Y, 2, 3);
      drawFlame(lg, X, Y, 2, col.accent, k);
      lights.push({ x: X, y: Y + (ty === 0 ? 4 : 0), r: 30 * flick(k), a: 0.95, c: col.light });
    });
    // Doors: bars when locked.
    for (const d in room.doors) {
      const [tx, ty] = DOOR_TILE[d], X = tx * T, Y = ty * T;
      const bossDoor = floor.get(room.gx + DIRS[d][0], room.gy + DIRS[d][1]).type === 'boss';
      if (bossDoor) { lg.fillStyle = '#c83a3a'; if (d === 'n' || d === 's') { lg.fillRect(X - 1, Y, 1, T); lg.fillRect(X + T, Y, 1, T); } else { lg.fillRect(X, Y - 1, T, 1); lg.fillRect(X, Y + T, T, 1); } }
      if (room.locked) {
        lg.fillStyle = '#8a8698';
        if (d === 'n' || d === 's') for (let i = 1; i < T; i += 2) lg.fillRect(X + i, Y, 1, T); else for (let i = 1; i < T; i += 2) lg.fillRect(X, Y + i, T, 1);
      }
    }
    // Ground effects.
    for (const ef of room.effects) {
      const a = Math.min(1, ef.life / 0.6);
      if (ef.type === 'fire') { lg.globalAlpha = 0.75 * a; lg.fillStyle = '#ff6a1a'; lg.beginPath(); lg.arc(ef.x, ef.y, ef.r * (0.8 + Math.sin(time * 12 + ef.x) * 0.15), 0, 7); lg.fill(); lg.fillStyle = '#ffd23a'; lg.fillRect(Math.round(ef.x - 1), Math.round(ef.y - 1), 2, 2); lights.push({ x: ef.x, y: ef.y, r: 12, a: 0.6 * a, c: '#ff8a3a' }); }
      if (ef.type === 'ooze') { lg.globalAlpha = 0.6 * a; lg.fillStyle = '#5ab83a'; lg.beginPath(); lg.arc(ef.x, ef.y, ef.r, 0, 7); lg.fill(); lg.fillStyle = '#b8ff6a'; lg.fillRect(Math.round(ef.x + Math.sin(time * 3 + ef.x) * 1.5), Math.round(ef.y - 1), 1, 1); }
      if (ef.type === 'ice') { lg.globalAlpha = 0.55 * a; lg.fillStyle = '#bff0ff'; lg.beginPath(); lg.arc(ef.x, ef.y, ef.r, 0, 7); lg.fill(); lg.fillStyle = '#ffffff'; lg.fillRect(Math.round(ef.x), Math.round(ef.y - 1), 1, 1); }
      if (ef.type === 'boom' && !ef.done && ef.bomb) { // the Tinkerer's bomb: flies in an arc, then sits there fizzing
        const k = clamp(1 - (ef.life - 0.4) / 0.3, 0, 1), bx = ef.sx + (ef.x - ef.sx) * k, by = ef.sy + (ef.y - ef.sy) * k - Math.sin(k * Math.PI) * 14;
        if (k >= 1) { lg.globalAlpha = 0.3 + 0.3 * Math.sin(time * 30); lg.strokeStyle = '#ff5a3a'; lg.beginPath(); lg.arc(ef.x, ef.y, ef.r, 0, 7); lg.stroke(); lg.globalAlpha = 1; }
        lg.fillStyle = '#1a1820'; lg.fillRect(Math.round(bx - 2), Math.round(by - 2), 4, 4); lg.fillRect(Math.round(bx - 1), Math.round(by - 3), 2, 6); lg.fillRect(Math.round(bx - 3), Math.round(by - 1), 6, 2);
        lg.fillStyle = '#5a5464'; lg.fillRect(Math.round(bx - 1), Math.round(by - 2), 1, 1);
        lg.fillStyle = Math.floor(time * 20) % 2 ? '#ffd23a' : '#ff6a1a'; lg.fillRect(Math.round(bx + 1), Math.round(by - 4), 1, 1);
        lights.push({ x: bx, y: by - 4, r: 10, a: 0.7, c: '#ffb04a' }); continue;
      }
      if (ef.type === 'boom' && !ef.done && ef.mine) { // the Meteor: a target ring and a star falling onto it
        lg.globalAlpha = 0.5; lg.strokeStyle = '#ff9a3a'; lg.beginPath(); lg.arc(ef.x, ef.y, ef.r, 0, 7); lg.stroke(); lg.globalAlpha = 1;
        const k = Math.max(0, ef.life / 0.55), mx = ef.x + k * 26, my = ef.y - k * 60;
        lg.fillStyle = '#ffe9a8'; lg.fillRect(Math.round(mx - 1), Math.round(my - 1), 3, 3); lg.fillStyle = '#ff7a2a'; lg.fillRect(Math.round(mx + 1), Math.round(my - 3), 2, 2); lg.fillRect(Math.round(mx + 3), Math.round(my - 5), 1, 1);
        lights.push({ x: mx, y: my, r: 16, a: 0.9, c: '#ff9a3a' }); continue;
      }
      if (ef.type === 'boom' && !ef.done) { lg.globalAlpha = 0.25 + 0.25 * Math.sin(time * 30); lg.strokeStyle = '#ff5a3a'; lg.beginPath(); lg.arc(ef.x, ef.y, ef.r, 0, 7); lg.stroke(); lights.push({ x: ef.x, y: ef.y, r: 14, a: 0.6, c: '#ff5a3a' }); }
      lg.globalAlpha = 1;
    }
    // Things on the floor.
    if (room.altar) drawAltar(lg, room.altar, col, lights);
    if (room.stairs) {
      const s = room.stairs; lg.fillStyle = '#050407'; lg.fillRect(s.x - 6, s.y - 5, 12, 10);
      for (let i = 0; i < 4; i++) { lg.fillStyle = C.mix(col.wall, '#000000', 0.2 + i * 0.18); lg.fillRect(s.x - 6, s.y - 5 + i * 2.5, 12 - i * 2, 2); }
      lights.push({ x: s.x, y: s.y, r: 20, a: 0.7, c: col.light });
    }
    if (room.chest) drawChest(lg, room.chest, lights);
    if (room.fire) drawFire(lg, room.fire, lights);
    const objs = [];
    if (room.event) { const ev = room.event; objs.push({ y: ev.y + 2, draw: () => drawEvent(lg, ev, lights) }); }
    if (room.shop) { const sh = room.shop; drawRug(lg, sh); objs.push({ y: sh.my, draw: () => drawMerchant(lg, sh, lights) }); sh.stalls.forEach((st) => objs.push({ y: st.y, draw: () => drawStall(lg, st, lights) })); }
    for (const p of room.pickups) objs.push({ y: p.y, draw: () => drawPickup(lg, p, lights) });
    for (const e of room.enemies) objs.push({ y: e.y, draw: () => drawEnemy(lg, e, lights) });
    for (const tu of P.turrets) objs.push({ y: tu.y, draw: () => drawTurret(lg, tu, lights) });
    if (room.props) for (const pr of room.props) { if (pr.broken) drawShards(lg, pr); else objs.push({ y: pr.ty * T + T - 1, draw: () => drawProp(lg, pr, lights) }); }
    objs.push({ y: P.y, draw: () => drawPlayer(lg, lights) });
    objs.sort((a, b) => a.y - b.y).forEach((o) => o.draw());
    for (const p of fx.projectiles) {
      if (p.wave) {
        const a = Math.atan2(p.vy, p.vx); lg.strokeStyle = p.color; lg.lineWidth = 1.5; lg.beginPath(); lg.arc(p.x - Math.cos(a) * 3, p.y - Math.sin(a) * 3, 4, a - 1, a + 1); lg.stroke(); lg.lineWidth = 1;
        lg.fillStyle = '#ffffff'; lg.fillRect(Math.round(p.x), Math.round(p.y), 1, 1);
      } else if (p.arrow) { // the Ranger's arrows: a shaft along the flight, a bright tip
        const l = Math.hypot(p.vx, p.vy) || 1, ux = p.vx / l, uy = p.vy / l;
        lg.strokeStyle = '#a0703a'; lg.beginPath(); lg.moveTo(p.x - ux * 5, p.y - uy * 5); lg.lineTo(p.x, p.y); lg.stroke();
        lg.fillStyle = p.color; lg.fillRect(Math.round(p.x), Math.round(p.y), 1, 1); lg.fillStyle = '#ffffff'; lg.fillRect(Math.round(p.x - ux * 5), Math.round(p.y - uy * 5), 1, 1);
        lights.push({ x: p.x, y: p.y, r: 6, a: 0.4, c: p.color }); continue;
      } else if (p.bolt) { // the Mage's bolts: a bright plus-shaped spark with a trail
        const X = Math.round(p.x), Y = Math.round(p.y);
        lg.fillStyle = p.color; lg.fillRect(X - 2, Y, 5, 1); lg.fillRect(X, Y - 2, 1, 5); lg.fillStyle = '#ffffff'; lg.fillRect(X, Y, 1, 1);
        if (rnd() < 0.5) fx.particles.push({ x: p.x, y: p.y, vx: -p.vx * 0.05, vy: -p.vy * 0.05, life: 0.2, max: 0.2, color: p.color, size: 1, glow: true, g: 0 });
      } else {
        lg.fillStyle = p.color; lg.fillRect(Math.round(p.x - 1.5), Math.round(p.y - 1.5), 3, 3); lg.fillStyle = '#ffffff'; lg.fillRect(Math.round(p.x - 0.5), Math.round(p.y - 0.5), 1, 1);
      }
      lights.push({ x: p.x, y: p.y, r: 10, a: 0.7, c: p.color });
    }
    for (const p of fx.particles) {
      lg.globalAlpha = Math.min(1, p.life / (p.max * 0.5));
      if (p.bolt) { lg.strokeStyle = p.color; lg.beginPath(); lg.moveTo(p.x, p.y); const mx = (p.x + p.x2) / 2 + (rnd() - 0.5) * 6, my = (p.y + p.y2) / 2 + (rnd() - 0.5) * 6; lg.lineTo(mx, my); lg.lineTo(p.x2, p.y2); lg.stroke(); lights.push({ x: mx, y: my, r: 16, a: 0.7, c: p.color }); }
      else { lg.fillStyle = p.color; lg.fillRect(Math.round(p.x), Math.round(p.y), p.size, p.size); if (p.glow) lights.push({ x: p.x, y: p.y, r: 5, a: 0.4, c: p.color }); }
    }
    lg.globalAlpha = 1;
    // The Knight's own torchlight.
    const dark = th.rule === 'darkness';
    lights.push({ x: P.x, y: P.y - 3, r: (dark ? 36 : 58) * flick(99), a: 1, c: '#ffd9a0', player: true });
    // ---- Up to the screen ----
    const sx = fx.shake > 0 ? Math.round((rnd() - 0.5) * fx.shake * 6) * S / 2 : 0, sy = fx.shake > 0 ? Math.round((rnd() - 0.5) * fx.shake * 6) * S / 2 : 0;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = '#000'; ctx.fillRect(0, 0, cv.width, cv.height);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(lo, sx, sy, LW * S, LH * S);
    // Darkness with holes where the light is.
    litg.globalCompositeOperation = 'source-over';
    litg.fillStyle = dark ? 'rgba(3,2,8,0.86)' : 'rgba(5,3,10,0.64)';
    litg.clearRect(0, 0, lit.width, lit.height); litg.fillRect(0, 0, lit.width, lit.height);
    litg.globalCompositeOperation = 'destination-out';
    // Too many lights in a busy room? Keep the big ones (torches, you, shots) and drop the tiniest sparks.
    if (lights.length > 70) { lights.sort((a, b) => b.r - a.r); lights.length = 70; }
    const hole = holeSprite();
    for (const L of lights) {
      litg.globalAlpha = Math.min(1, L.a);
      litg.drawImage(hole, L.x * 2 - L.r * 2, L.y * 2 - L.r * 2, L.r * 4, L.r * 4);
    }
    // Coloured glow goes on the same small layer, so it costs nothing extra to show on the big screen.
    litg.globalCompositeOperation = 'lighter';
    for (const L of lights) {
      if (L.player || L.r < 7) continue; // tiny sparks don't need their own glow
      litg.globalAlpha = Math.min(1, 0.3 * L.a);
      const rr = L.r * 0.8 * 2;
      litg.drawImage(glowSprite(L.c), L.x * 2 - rr, L.y * 2 - rr, rr * 2, rr * 2);
    }
    litg.globalAlpha = 1; litg.globalCompositeOperation = 'source-over';
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(lit, sx, sy, LW * S, LH * S);
    // Numbers.
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    if (room.shop) {
      ctx.font = `${Math.round(S * 3.4)}px "Pixelify Sans", monospace`; ctx.lineWidth = Math.max(2, S * 0.8); ctx.strokeStyle = '#0c0a10';
      for (const st of room.shop.stalls) { if (st.sold) continue; const tx = sx + st.x * S, ty = sy + (st.y + 6) * S; ctx.strokeText(st.price + 'g', tx, ty); ctx.fillStyle = meta.gold >= st.price ? '#ffcf4a' : '#a89a80'; ctx.fillText(st.price + 'g', tx, ty); }
    }
    for (const t of fx.texts) {
      const a = Math.min(1, t.life / (t.max * 0.4)), size = Math.round(S * (t.big ? 5 : 4));
      ctx.font = `${size}px "Pixelify Sans", monospace`;
      ctx.globalAlpha = a; ctx.lineWidth = Math.max(2, S * 0.9); ctx.strokeStyle = '#0c0a10';
      ctx.strokeText(t.text, sx + t.x * S, sy + t.y * S); ctx.fillStyle = t.color; ctx.fillText(t.text, sx + t.x * S, sy + t.y * S);
    }
    ctx.globalAlpha = 1;
    // Hurt flash and low-health vignette.
    const s = stats();
    if (P.hp / s.maxHp < 0.3 && !P.dead) { const v = ctx.createRadialGradient(cv.width / 2, cv.height / 2, cv.height * 0.3, cv.width / 2, cv.height / 2, cv.width * 0.7); v.addColorStop(0, 'rgba(160,0,0,0)'); v.addColorStop(1, `rgba(160,0,0,${0.25 + Math.sin(time * 5) * 0.08})`); ctx.fillStyle = v; ctx.fillRect(0, 0, cv.width, cv.height); }
    if (fx.fade > 0) { ctx.fillStyle = `rgba(0,0,0,${fx.fade})`; ctx.fillRect(0, 0, cv.width, cv.height); }
  }
  // Lights are stamped from ready-made soft circles instead of building a new gradient for each one every frame.
  let holeCv = null; const glowCache = new Map();
  function holeSprite() {
    if (holeCv) return holeCv;
    holeCv = document.createElement('canvas'); holeCv.width = holeCv.height = 64;
    const g = holeCv.getContext('2d'), gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    gr.addColorStop(0, 'rgba(0,0,0,1)'); gr.addColorStop(0.55, 'rgba(0,0,0,0.6)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = gr; g.fillRect(0, 0, 64, 64); return holeCv;
  }
  function glowSprite(color) {
    const c = C.hexOk(color) ? color : '#ffffff';
    if (glowCache.has(c)) return glowCache.get(c);
    const cv = document.createElement('canvas'); cv.width = cv.height = 64;
    const g = cv.getContext('2d'), gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    gr.addColorStop(0, C.rgba(c, 1)); gr.addColorStop(1, C.rgba(c, 0));
    g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
    if (glowCache.size > 200) glowCache.clear();
    glowCache.set(c, cv); return cv;
  }
  function drawFlame(g, x, y, s, accent, k) {
    const h = s + Math.round(Math.sin(time * 14 + k * 2) + 1);
    g.fillStyle = accent; g.fillRect(x - 1, y - h, 2, h);
    g.fillStyle = '#fff3c0'; g.fillRect(x - (time * 10 + k) % 2 < 1 ? 1 : 0, y - h + 1, 1, Math.max(1, h - 2));
  }
  function drawAltar(g, a, col, lights) {
    const x = Math.round(a.x), y = Math.round(a.y);
    g.fillStyle = 'rgba(0,0,0,0.4)'; g.fillRect(x - 6, y + 3, 12, 2);
    g.fillStyle = '#4a4458'; g.fillRect(x - 5, y - 1, 10, 4); // the base
    g.fillStyle = '#6e6880'; g.fillRect(x - 3, y - 3, 6, 2);
    g.fillStyle = '#9a94ac'; g.fillRect(x - 6, y - 5, 12, 2); g.fillRect(x + 5, y - 4, 2, 1); // the anvil top and horn
    g.fillStyle = '#cfc8dc'; g.fillRect(x - 5, y - 5, 9, 1);
    if (a.uses > 0) {
      g.fillStyle = '#ff8a3a'; g.globalAlpha = 0.6 + Math.sin(time * 4) * 0.3; g.fillRect(x - 2, y - 1, 4, 1); g.globalAlpha = 1;
      if (rnd() < 0.08) fx.particles.push({ x: x + (rnd() - 0.5) * 8, y: y - 5, vx: (rnd() - 0.5) * 10, vy: -12 - rnd() * 10, life: 0.6, max: 0.6, color: '#ffb070', size: 1, glow: true, g: 0 });
      lights.push({ x, y: y - 3, r: 26, a: 0.9, c: '#ff9a4a' });
    }
  }
  function drawFire(g, f, lights) {
    const x = Math.round(f.x), y = Math.round(f.y);
    // Stones round the fire, two logs, and the flames (just embers once you've rested).
    g.fillStyle = '#5a5464'; [[-6, 1], [-4, 3], [0, 4], [4, 3], [6, 1], [-5, -2], [5, -2]].forEach(([dx, dy]) => g.fillRect(x + dx - 1, y + dy - 1, 2, 2));
    g.fillStyle = '#5a3a1e'; g.fillRect(x - 4, y, 8, 2); g.fillStyle = '#7a5030'; g.fillRect(x - 3, y - 1, 6, 1);
    if (!f.used) {
      for (let k = 0; k < 3; k++) { const h = 4 + Math.round(Math.sin(time * 12 + k * 2.1) * 1.5 + 1.5); g.fillStyle = k === 1 ? '#ffd23a' : '#ff6a1a'; g.fillRect(x - 3 + k * 2, y - h, 2, h); }
      g.fillStyle = '#fff3c0'; g.fillRect(x - 1 + (Math.floor(time * 8) % 2), y - 3, 1, 2);
      if (rnd() < 0.15) fx.particles.push({ x: x + (rnd() - 0.5) * 4, y: y - 6, vx: (rnd() - 0.5) * 6, vy: -16 - rnd() * 10, life: 0.8, max: 0.8, color: '#ffb070', size: 1, glow: true, g: 0 });
      lights.push({ x, y: y - 3, r: 46 * (0.93 + Math.sin(time * 9) * 0.05), a: 1, c: '#ff9a4a' });
    } else {
      g.fillStyle = '#c84a1a'; g.globalAlpha = 0.6 + Math.sin(time * 2) * 0.3; g.fillRect(x - 2, y - 1, 4, 1); g.globalAlpha = 1;
      lights.push({ x, y: y - 1, r: 14, a: 0.5, c: '#ff6a2a' });
    }
  }
  function drawRug(g, sh) {
    const x0 = sh.stalls[0].x - 7, x1 = sh.stalls[sh.stalls.length - 1].x + 7, y = sh.stalls[0].y - 4;
    g.fillStyle = '#4a2030'; g.fillRect(x0, y, x1 - x0, 9); g.fillStyle = '#8a3a4a'; g.fillRect(x0 + 1, y + 1, x1 - x0 - 2, 7);
    g.fillStyle = '#c8a040'; for (let x = x0 + 2; x < x1 - 2; x += 3) { g.fillRect(x, y + 1, 1, 1); g.fillRect(x + 1, y + 7, 1, 1); }
  }
  function drawMerchant(g, sh, lights) {
    const x = Math.round(sh.mx), y = Math.round(sh.my), bob = Math.round(Math.sin(time * 2) * 0.5);
    shadow(g, x, y + 1, 7);
    g.fillStyle = '#3a6a5a'; g.fillRect(x - 3, y - 6 + bob, 7, 7); // robe
    g.fillStyle = '#2a4a40'; g.fillRect(x - 3, y - 1 + bob, 7, 2);
    g.fillStyle = '#4a8a74'; g.fillRect(x - 3, y - 10 + bob, 7, 5); g.fillRect(x - 2, y - 11 + bob, 5, 1); // hood
    g.fillStyle = '#120e16'; g.fillRect(x - 1, y - 9 + bob, 3, 3);
    g.fillStyle = '#ffd23a'; g.fillRect(x - 1, y - 8 + bob, 1, 1); g.fillRect(x + 1, y - 8 + bob, 1, 1); // glinting eyes
    g.fillStyle = '#c8a040'; g.fillRect(x + 4, y - 5 + bob, 1, 6); g.fillStyle = '#ffe9a8'; g.fillRect(x + 3, y - 7 + bob, 3, 2); // a lantern on a staff
    lights.push({ x: x + 4, y: y - 6, r: 30, a: 0.9, c: '#ffd88a' });
  }
  function drawStall(g, st, lights) {
    const x = Math.round(st.x), y = Math.round(st.y);
    g.fillStyle = '#4a4458'; g.fillRect(x - 4, y - 1, 8, 3); g.fillStyle = '#6e6880'; g.fillRect(x - 4, y - 2, 8, 1);
    if (st.sold) return;
    const bob = Math.round(Math.sin(time * 3 + x) * 0.6);
    let ic, c;
    if (st.kind === 'item') { ic = DF.iconSprite(st.item.icon, st.item.colors, st.item.element); c = DF.RAR_COLOR[st.item.rarity]; }
    else if (st.kind === 'potion') { ic = DF.iconSprite('potion', ['#ff4a6a', '#cfc8dc'], 'none'); c = '#ff4a6a'; }
    else { c = spellColor(st.spell); ic = DF.iconSprite('scroll', ['#e8d8a8', c], 'none'); }
    g.drawImage(ic, x - 4, y - 11 + bob);
    lights.push({ x, y: y - 7, r: 13, a: 0.6, c });
  }
  function drawChest(g, c, lights) {
    const x = Math.round(c.x), y = Math.round(c.y);
    shadow(g, x, y + 3, 9);
    g.fillStyle = '#5a3a1e'; g.fillRect(x - 4, y - 4, 9, 7);
    g.fillStyle = '#8a5a32'; g.fillRect(x - 4, y - 5, 9, 3);
    g.fillStyle = '#ffcf4a'; g.fillRect(x, y - 2, 1, 2); g.fillRect(x - 4, y - 2, 9, 1);
    lights.push({ x, y: y - 2, r: 14, a: 0.6, c: '#ffcf4a' });
  }
  function drawPickup(g, p, lights) {
    const bob = Math.round(Math.sin(time * 4 + p.x) * 1) - Math.round(-(p.z || 0) * 0.15);
    const x = Math.round(p.x), y = Math.round(p.y);
    if (p.kind === 'gold') { g.fillStyle = '#ffcf4a'; g.fillRect(x - 1, y - 2 + bob, 2, 2); g.fillStyle = '#fff3a0'; g.fillRect(x - 1, y - 2 + bob, 1, 1); lights.push({ x, y, r: 5, a: 0.4, c: '#ffcf4a' }); return; }
    if (p.kind === 'heart') { g.fillStyle = '#ff4a6a'; g.fillRect(x - 2, y - 3 + bob, 2, 2); g.fillRect(x + 1, y - 3 + bob, 2, 2); g.fillRect(x - 2, y - 2 + bob, 5, 2); g.fillRect(x - 1, y + bob, 3, 1); g.fillRect(x, y + 1 + bob, 1, 1); lights.push({ x, y, r: 8, a: 0.5, c: '#ff4a6a' }); return; }
    if (p.kind === 'scroll') { const c = spellColor(p.spell), ic = DF.iconSprite('scroll', ['#e8d8a8', c], 'none'); shadow(g, x, y + 2, 6); g.drawImage(ic, x - 4, y - 8 + bob); lights.push({ x, y: y - 3, r: 11, a: 0.6, c }); if (rnd() < 0.06) fx.particles.push({ x: x + (rnd() - 0.5) * 8, y: y - 4, vx: 0, vy: -8, life: 0.6, max: 0.6, color: c, size: 1, glow: true, g: 0 }); return; }
    if (p.kind === 'potion') { const ic = DF.iconSprite('potion', ['#ff4a6a', '#cfc8dc'], 'none'); shadow(g, x, y + 2, 6); g.drawImage(ic, x - 5, y - 8 + bob); lights.push({ x, y: y - 3, r: 9, a: 0.5, c: '#ff4a6a' }); return; }
    if (p.kind === 'item') {
      const it = p.item, ic = DF.iconSprite(it.icon, it.colors, it.element);
      shadow(g, x, y + 2, 6);
      g.drawImage(ic, x - 5, y - 9 + bob);
      lights.push({ x, y: y - 4, r: 12 + it.rarity * 2, a: 0.7, c: DF.RAR_COLOR[it.rarity] });
      if (rnd() < 0.05 + it.rarity * 0.03) fx.particles.push({ x: x + (rnd() - 0.5) * 8, y: y - 4 + (rnd() - 0.5) * 6, vx: 0, vy: -8, life: 0.6, max: 0.6, color: DF.RAR_COLOR[it.rarity], size: 1, glow: true, g: 0 });
    }
  }
  function drawEnemy(g, e, lights) {
    const sp = DF.monsterSprite(e.spec, e.flash > 0 ? 'flash' : e.elite ? 'elite' : '');
    const hov = e.flying ? Math.round(Math.sin(e.wob * 0.5) * 1.5) - 2 : 0;
    const squash = e.state === 'wind' ? Math.round(Math.sin(e.wob) * 1) : 0;
    if (e.spawnT > 0 && !e.minion && !e.child) { g.globalAlpha = 1 - e.spawnT * 1.6; }
    if (e.hidden) { // a faint shimmer is all you see
      if (Math.sin(time * 2 + e.x) > 0.6) { g.fillStyle = 'rgba(255,255,255,0.18)'; g.fillRect(Math.round(e.x - 2), Math.round(e.y - 3), 1, 1); g.fillRect(Math.round(e.x + 1), Math.round(e.y - 3), 1, 1); }
      g.globalAlpha = 1; return;
    }
    shadow(g, e.x, e.y + e.r * 0.4, Math.max(4, e.w * 0.8));
    drawSprite(g, sp, e.x + squash, e.y + e.r * 0.4 + hov, e.dir, e.scale);
    g.globalAlpha = 1;
    if (e.shield) { g.strokeStyle = 'rgba(154,216,255,0.8)'; g.beginPath(); g.arc(e.x, e.y - e.h / 2 + 1, Math.max(e.w, e.h) / 2 + 2, 0, 7); g.stroke(); }
    if (e.burn > 0 && rnd() < 0.3) fx.particles.push({ x: e.x + (rnd() - 0.5) * e.w, y: e.y - rnd() * e.h, vx: 0, vy: -15, life: 0.3, max: 0.3, color: '#ff8a3a', size: 1, glow: true, g: 0 });
    if (e.slow > 0) { g.fillStyle = 'rgba(160,230,255,0.5)'; g.fillRect(Math.round(e.x - e.w / 2), Math.round(e.y + e.r * 0.4 - 1), Math.round(e.w), 1); }
    if (e.slamWind > 0) { g.globalAlpha = 0.35 + 0.35 * Math.sin(time * 30); g.strokeStyle = '#ff5a3a'; g.beginPath(); g.arc(e.x, e.y, 25, 0, 7); g.stroke(); g.globalAlpha = 1; }
    if (e.state === 'wind' || e.cs === 'wind' || e.slamWind > 0) { g.fillStyle = '#ff5a5a'; g.fillRect(Math.round(e.x), Math.round(e.y - e.h - 5), 1, 3); g.fillRect(Math.round(e.x), Math.round(e.y - e.h - 1), 1, 1); }
    if (!e.boss && e.hp < e.maxHp) { const w = Math.max(6, Math.round(e.w)); g.fillStyle = '#1a1020'; g.fillRect(Math.round(e.x - w / 2), Math.round(e.y - e.h - 3 + hov), w, 1); g.fillStyle = e.elite ? '#ffcf4a' : '#ff5a5a'; g.fillRect(Math.round(e.x - w / 2), Math.round(e.y - e.h - 3 + hov), Math.max(1, Math.round(w * e.hp / e.maxHp)), 1); }
    if (['fire', 'light', 'lightning'].includes(e.spec.element) || e.boss || e.elite) lights.push({ x: e.x, y: e.y - e.h / 2, r: e.boss ? 24 : 10, a: 0.45, c: DF.EL_COLOR[e.spec.element] });
  }
  function drawProp(g, p, lights) {
    const x = p.tx * T, y = p.ty * T;
    lights.push({ x: x + 4, y: y + 3, r: 9, a: 0.45, c: p.kind === 'pot' ? '#ffb070' : '#e0b070' }); // a faint glint so they show in the dark
    g.fillStyle = 'rgba(0,0,0,0.35)'; g.fillRect(x + 1, y + 7, 6, 1);
    if (p.kind === 'pot') { // a clay pot: rim, round body, a painted band
      const body = ['#a8583a', '#9a6a3a', '#8a4a4a'][p.v || 0], hi = C.lighten(body, 0.25), dk = C.darken(body, 0.35);
      g.fillStyle = '#0c0a10'; g.fillRect(x + 2, y - 1, 4, 1); g.fillRect(x + 1, y + 1, 6, 5); g.fillRect(x + 2, y + 6, 4, 1);
      g.fillStyle = dk; g.fillRect(x + 2, y, 4, 1);
      g.fillStyle = body; g.fillRect(x + 2, y + 1, 4, 5); g.fillRect(x + 1, y + 2, 6, 3);
      g.fillStyle = hi; g.fillRect(x + 2, y + 2, 1, 2); g.fillRect(x + 3, y + 1, 2, 1);
      g.fillStyle = C.mix(body, '#e8c890', 0.5); g.fillRect(x + 2, y + 4, 4, 1);
      g.fillStyle = dk; g.fillRect(x + 6, y + 3, 1, 2); g.fillRect(x + 3, y + 5, 3, 1);
    } else { // a wooden crate: planks and a cross brace
      g.fillStyle = '#0c0a10'; g.fillRect(x, y - 1, 8, 8);
      g.fillStyle = '#8a6034'; g.fillRect(x + 1, y, 6, 6);
      g.fillStyle = '#b08050'; g.fillRect(x + 1, y, 6, 1); g.fillRect(x + 1, y, 1, 6);
      g.fillStyle = '#5a3c1e'; g.fillRect(x + 1, y + 2, 6, 1); g.fillRect(x + 1, y + 4, 6, 1);
      g.fillStyle = '#c89a60'; for (let i = 0; i < 6; i++) g.fillRect(x + 1 + i, y + 5 - i, 1, 1);
    }
  }
  function drawShards(g, p) {
    const x = p.tx * T, y = p.ty * T, c = p.kind === 'pot' ? '#6a3420' : '#4a3018';
    g.fillStyle = c; g.fillRect(x + 1, y + 5, 2, 1); g.fillRect(x + 5, y + 6, 1, 1); g.fillRect(x + 3, y + 4, 1, 1); g.fillRect(x + 6, y + 3, 1, 1);
  }
  function drawTurret(g, tu, lights) {
    const x = Math.round(tu.x), y = Math.round(tu.y), fading = tu.life < 2 && Math.floor(time * 8) % 2 === 0;
    if (fading) g.globalAlpha = 0.5;
    shadow(g, x, y + 1, 6);
    g.fillStyle = '#6a4a2a'; g.fillRect(x - 3, y - 1, 1, 2); g.fillRect(x + 2, y - 1, 1, 2); g.fillRect(x, y - 2, 1, 3); // legs
    g.fillStyle = '#9aa4b8'; g.fillRect(x - 2, y - 6, 5, 4); g.fillStyle = '#cfd6e6'; g.fillRect(x - 2, y - 6, 5, 1); // body
    g.fillStyle = '#5a6478'; g.fillRect(tu.dir > 0 ? x + 3 : x - 5, y - 5, 3, 1); // barrel
    g.fillStyle = tu.t > 0.45 ? '#ffffff' : '#ffcf4a'; g.fillRect(x, y - 4, 1, 1); // its eye
    g.globalAlpha = 1;
    lights.push({ x, y: y - 4, r: 10, a: 0.5, c: '#ffcf4a' });
  }
  function drawPlayer(g, lights) {
    if (P.dead) return;
    const s = stats();
    const blink = P.inv > 0 && !(P.bash) && !(P.roll) && !(P.ward > 0) && Math.floor(time * 20) % 2 === 0;
    if (P.ward > 0) { const a = Math.min(1, P.ward * 2); g.strokeStyle = C.rgba('#d29a5c', 0.8 * a); g.beginPath(); g.arc(P.x, P.y - 4, 7 + Math.sin(time * 10) * 0.5, 0, 7); g.stroke(); lights.push({ x: P.x, y: P.y - 4, r: 16, a: 0.6 * a, c: '#d29a5c' }); }
    const frame = Math.hypot(P.vx, P.vy) > 5 ? Math.floor(P.walkT * 8) % 2 : 0;
    const sp = DF.heroSprite(run.cls, frame, P.flash > 0 ? 'flash' : '');
    const x = Math.round(P.x), y = Math.round(P.y + 2);
    shadow(g, x, y, 6);
    const w = run.eq.weapon, wc = (w && w.colors[0]) || '#cfd6e6';
    if (run.cls === 'mage') { // a wand in hand, its tip glowing with the weapon's element
      const col = boltColor(), hx = x + (P.dir > 0 ? 3 : -4);
      if (!blink) { g.fillStyle = '#8a5a32'; g.fillRect(hx, y - 8, 1, 4); g.fillStyle = col; g.fillRect(hx, y - 10, 1, 2); if (P.castT > 0) { g.fillStyle = '#ffffff'; g.fillRect(hx, y - 10, 1, 1); } }
      lights.push({ x: hx, y: y - 10, r: P.castT > 0 ? 18 : 8, a: P.castT > 0 ? 0.9 : 0.5, c: col });
      if (!blink) drawSprite(g, sp, x, y, P.dir, 1);
      if (P.poison > 0 && rnd() < 0.2) fx.particles.push({ x: P.x + (rnd() - 0.5) * 6, y: P.y - 6, vx: 0, vy: -10, life: 0.4, max: 0.4, color: '#a6ff4a', size: 1, glow: false, g: 0 });
      return;
    }
    if (run.cls === 'ranger') { // a bow held out front, string drawn back when shooting
      const bc = (w && w.colors[0]) || '#a0703a', hx = x + (P.dir > 0 ? 3 : -4), pull = P.castT > 0 ? 1 : 0;
      if (!blink) drawSprite(g, sp, x, y, P.dir, 1);
      if (!blink && !P.roll) { g.fillStyle = bc; g.fillRect(hx, y - 9, 1, 1); g.fillRect(hx + P.dir, y - 8, 1, 3); g.fillRect(hx, y - 5, 1, 1); g.fillStyle = '#e8e0c8'; g.fillRect(hx - P.dir * pull, y - 8, 1, 3); }
      if (P.poison > 0 && rnd() < 0.2) fx.particles.push({ x: P.x + (rnd() - 0.5) * 6, y: P.y - 6, vx: 0, vy: -10, life: 0.4, max: 0.4, color: '#a6ff4a', size: 1, glow: false, g: 0 });
      return;
    }
    const tink = run.cls === 'tinkerer';
    // Sword (or wrench) at rest.
    if (tink && !P.swing && !blink) { g.fillStyle = wc; g.fillRect(x + (P.dir > 0 ? 3 : -4), y - 8, 1, 3); g.fillRect(x + (P.dir > 0 ? 2 : -5), y - 9, 3, 1); }
    else if (!P.swing && !blink) { g.fillStyle = wc; g.fillRect(x + (P.dir > 0 ? 3 : -4), y - 9, 1, 4); g.fillStyle = '#8a5a32'; g.fillRect(x + (P.dir > 0 ? 3 : -4), y - 5, 1, 1); }
    if (!blink) drawSprite(g, sp, x, y, P.dir, 1);
    // The shield, held up front while bashing.
    const sh = run.eq.offhand && run.eq.offhand.icon === 'shield' ? run.eq.offhand.colors[0] : '#7d88a3';
    if (P.bash) { g.fillStyle = sh; g.fillRect(Math.round(P.x + P.fx * 4 - 2), Math.round(P.y - 6 + P.fy * 3), 4, 5); g.fillStyle = '#ffffff'; g.fillRect(Math.round(P.x + P.fx * 4 - 1), Math.round(P.y - 5 + P.fy * 3), 1, 1); }
    else if (!blink && !tink) { g.fillStyle = sh; g.fillRect(x + (P.dir > 0 ? -4 : 2), y - 6, 2, 3); }
    // The swing: a bright crescent.
    if (P.swing) {
      const sw = P.swing, k = sw.t / sw.dur, a0 = sw.ang - sw.arc / 2 * sw.side, a1 = sw.ang + sw.arc / 2 * sw.side, a = a0 + (a1 - a0) * Math.min(1, k * 1.4);
      const cx = P.x, cy = P.y - 4;
      g.strokeStyle = C.rgba(DF.EL_COLOR[(w && w.element) || 'none'] || '#ffffff', 0.55 * (1 - k)); g.lineWidth = 2;
      g.beginPath(); g.arc(cx, cy, sw.range - 2, Math.min(a0, a), Math.max(a0, a)); g.stroke(); g.lineWidth = 1;
      g.strokeStyle = wc; g.beginPath(); g.moveTo(cx + Math.cos(a) * 3, cy + Math.sin(a) * 3); g.lineTo(cx + Math.cos(a) * (sw.range - 1), cy + Math.sin(a) * (sw.range - 1)); g.stroke();
      if (w && w.element !== 'none') lights.push({ x: cx + Math.cos(a) * 8, y: cy + Math.sin(a) * 8, r: 12, a: 0.5, c: DF.EL_COLOR[w.element] });
    }
    if (P.poison > 0 && rnd() < 0.2) fx.particles.push({ x: P.x + (rnd() - 0.5) * 6, y: P.y - 6, vx: 0, vy: -10, life: 0.4, max: 0.4, color: '#a6ff4a', size: 1, glow: false, g: 0 });
    void s;
  }

  /* ================= HUD ================= */
  let hudKey = '';
  function updateHUD(force) {
    if (!run) return;
    const s = stats();
    const sp2 = run.spell2, def2 = sp2 && DF.SPELLS[sp2.id];
    const k = [Math.ceil(P.hp), s.maxHp, meta.gold, run.potions, run.floorN, P.bashCd > 0 ? Math.ceil(P.bashCd * 4) : 0, P.novaCd > 0 ? Math.ceil(P.novaCd * 4) : 0, AI.pending, action && action.label, Math.floor(P.mana || 0), run.cls, sp2 ? sp2.id + sp2.charges : '', P.spellCd > 0 ? Math.ceil(P.spellCd * 4) : 0].join('|');
    if (k === hudKey && !force) return;
    hudKey = k;
    $('#hp-fill').style.width = (100 * clamp(P.hp / s.maxHp, 0, 1)) + '%';
    $('#hp-text').textContent = `${Math.ceil(P.hp)} / ${s.maxHp}`;
    $('#gold').textContent = meta.gold;
    $('#floor-name').textContent = `${run.floorN} · ${run.content.theme.name}`;
    $('#potion-n').textContent = run.potions;
    $('#potion').disabled = run.potions <= 0;
    const mage = run.cls === 'mage', cu = classUI();
    const bash = $('#btn-bash'); bash.style.setProperty('--cd', P.bashCd > 0 ? Math.min(1, P.bashCd / cu.altCd) : 0); bash.classList.toggle('cooling', P.bashCd > 0);
    const b1 = $('#btn-spell');
    if (cu.skillCd) { b1.style.setProperty('--cd', P.novaCd > 0 ? Math.min(1, P.novaCd / cu.skillCd) : 0); b1.classList.toggle('cooling', P.novaCd > 0); b1.classList.remove('cant'); }
    else b1.classList.remove('cooling');
    $('#mp').hidden = !mage;
    if (mage) { $('#mp-fill').style.width = (100 * clamp(P.mana / s.maxMana, 0, 1)) + '%'; $('#btn-spell').classList.toggle('cant', P.mana < 25); }
    const b2 = $('#btn-spell2');
    b2.hidden = !def2; $('#pad .btns').classList.toggle('wide', !!(cu.skill && def2));
    if (def2) {
      const lab = mage ? def2.short : `${def2.short} \u00d7${sp2.charges}`;
      if (b2.textContent !== lab) b2.textContent = lab;
      b2.style.setProperty('--sc', spellColor(sp2.id)); b2.setAttribute('aria-label', def2.name);
      b2.classList.toggle('cant', (mage && P.mana < def2.cost) || P.spellCd > 0);
    }
    const km = cu.keys + (def2 ? ` <kbd>${cu.skill ? 'I' : 'L'}</kbd> ${def2.short.toLowerCase()}` : '');
    if ($('#key-moves').dataset.k !== km) { $('#key-moves').dataset.k = km; $('#key-moves').innerHTML = km; }
    if (force || bash.dataset.cls !== run.cls) {
      bash.dataset.cls = run.cls;
      bash.textContent = cu.alt; bash.setAttribute('aria-label', cu.altLong || cu.alt);
      $('#btn-attack').textContent = cu.atk; $('#btn-attack').setAttribute('aria-label', cu.atk);
      b1.hidden = !cu.skill; if (cu.skill) { b1.textContent = cu.skill; b1.setAttribute('aria-label', cu.skill); }
    }
    $('#ai-dot').hidden = !AI.pending; $('#ai-dot').title = AI.pending ? `The Deep is dreaming up ${AI.pending} thing${AI.pending === 1 ? '' : 's'}` : '';
    if (force) DF.UI.renderSlots();
  }
  function drawMinimap() {
    const mm = $('#minimap'); if (!mm || !floor) return;
    const g = mm.getContext('2d'), c = 9, ch = 6, gap = 3;
    const seen = floor.rooms.filter((r) => r.seen);
    const minX = Math.min(...seen.map((r) => r.gx)), maxX = Math.max(...seen.map((r) => r.gx));
    const minY = Math.min(...seen.map((r) => r.gy)), maxY = Math.max(...seen.map((r) => r.gy));
    mm.width = (maxX - minX + 1) * (c + gap) + gap; mm.height = (maxY - minY + 1) * (ch + gap) + gap;
    g.clearRect(0, 0, mm.width, mm.height);
    const at = (r) => [gap + (r.gx - minX) * (c + gap), gap + (r.gy - minY) * (ch + gap)];
    // Doorways first: every door of a room you've been in (or are next to), in all four directions.
    // The doors of the room you're standing in are lit up.
    const drawn = new Set();
    for (const r of seen) {
      for (const d in r.doors) {
        const o = floor.get(r.gx + DIRS[d][0], r.gy + DIRS[d][1]);
        if (!o || !o.seen || !(r.visited || o.visited)) continue;
        const key = [r.gx, r.gy, o.gx, o.gy].sort().join(','); if (drawn.has(key)) continue; drawn.add(key);
        const [x, y] = at(r), here = r === room || o === room;
        g.fillStyle = here ? '#ffe9c8' : '#5a5064';
        if (d === 'e') g.fillRect(x + c, y + ch / 2 - 1, gap, 2);
        if (d === 'w') g.fillRect(x - gap, y + ch / 2 - 1, gap, 2);
        if (d === 's') g.fillRect(x + c / 2 - 1, y + ch, 2, gap);
        if (d === 'n') g.fillRect(x + c / 2 - 1, y - gap, 2, gap);
      }
    }
    for (const r of seen) {
      const [x, y] = at(r);
      g.fillStyle = r === room ? '#ffe9c8' : r.visited ? (r.cleared || r.type !== 'fight' ? '#6e6478' : '#8a5a5a') : '#2e2836';
      g.fillRect(x, y, c, ch);
      if (r.stairs) { g.fillStyle = '#000'; g.fillRect(x + 2, y + 1, c - 4, ch - 2); }
      const mark = { boss: '#e2483f', forge: '#ff9a3a', treasure: '#ffcf4a', shop: '#5ad8c0', camp: r.fire && r.fire.used ? '#6a3a3a' : '#ff6a8a', event: r.event && r.event.used ? '#4a3a5a' : '#b48bff' }[r.type];
      if (mark) { g.fillStyle = mark; g.fillRect(x + c / 2 - 1.5, y + ch / 2 - 1.5, 3, 3); }
    }
  }

  /* ================= Input ================= */
  const KEYMAP = { ArrowLeft: 'l', KeyA: 'l', ArrowRight: 'r', KeyD: 'r', ArrowUp: 'u', KeyW: 'u', ArrowDown: 'd', KeyS: 'd' };
  window.addEventListener('keydown', (e) => {
    if (e.target && /INPUT|TEXTAREA|SELECT/.test(e.target.tagName)) return;
    SND.wake();
    if (KEYMAP[e.code]) { input.keys.add(KEYMAP[e.code]); e.preventDefault(); }
    if (G.mode !== 'play') return;
    if (e.code === 'Escape' || e.code === 'KeyP') { DF.UI.togglePause(); e.preventDefault(); return; }
    if (e.code === 'Tab' || e.code === 'KeyB') { DF.UI.toggleInventory(); e.preventDefault(); return; }
    if (hold.size) return;
    if (e.repeat) return;
    if (e.code === 'KeyJ' || e.code === 'Space' || e.code === 'KeyZ') { input.attack = true; e.preventDefault(); }
    if (e.code === 'KeyK' || e.code === 'ShiftLeft' || e.code === 'ShiftRight' || e.code === 'KeyX') { input.bash = true; e.preventDefault(); }
    if (e.code === 'KeyL' || e.code === 'KeyC') { input.spell = true; e.preventDefault(); }
    if (e.code === 'KeyI' || e.code === 'KeyV') { input.spell2 = true; e.preventDefault(); }
    if (e.code === 'KeyE' || e.code === 'Enter') { input.act = true; e.preventDefault(); }
    if (e.code === 'KeyQ' || e.code === 'KeyH') usePotion();
    if (/^Digit[0-9]$/.test(e.code)) { const d = Number(e.code.slice(5)); DF.UI.openItem({ where: 'bag', i: d === 0 ? 9 : d - 1 }); }
  });
  window.addEventListener('keyup', (e) => { if (KEYMAP[e.code]) input.keys.delete(KEYMAP[e.code]); });
  window.addEventListener('blur', () => input.keys.clear());
  let stick = null;
  function readKeys() {
    if (stick) return;
    const k = input.keys;
    if (!k.size) { if (input.fromKeys) { input.mx = input.my = 0; input.fromKeys = false; } return; }
    input.fromKeys = true;
    input.mx = (k.has('r') ? 1 : 0) - (k.has('l') ? 1 : 0); input.my = (k.has('d') ? 1 : 0) - (k.has('u') ? 1 : 0);
  }
  // A floating thumbstick: it appears wherever your thumb lands in the left zone.
  (function touchPad() {
    const zone = $('#stick-zone'), base = $('#stick'), knob = $('#knob');
    const R = 46;
    zone.addEventListener('pointerdown', (e) => {
      SND.wake(); e.preventDefault();
      zone.setPointerCapture(e.pointerId);
      const zr = zone.getBoundingClientRect();
      stick = { id: e.pointerId, x: e.clientX, y: e.clientY };
      base.style.left = (e.clientX - zr.left) + 'px'; base.style.top = (e.clientY - zr.top) + 'px'; base.classList.add('on');
      knob.style.transform = 'translate(-50%,-50%)';
    });
    zone.addEventListener('pointermove', (e) => {
      if (!stick || e.pointerId !== stick.id) return;
      let dx = e.clientX - stick.x, dy = e.clientY - stick.y; const l = Math.hypot(dx, dy);
      if (l > R) { // drag the base along so you never run out of stick
        const k = (l - R) / l; stick.x += dx * k; stick.y += dy * k; dx = e.clientX - stick.x; dy = e.clientY - stick.y;
        const zr = zone.getBoundingClientRect(); base.style.left = (stick.x - zr.left) + 'px'; base.style.top = (stick.y - zr.top) + 'px';
      }
      const ll = Math.hypot(dx, dy), dead = 6;
      const m = ll < dead ? 0 : Math.min(1, (ll - dead) / (R - dead));
      input.mx = ll ? dx / ll * m : 0; input.my = ll ? dy / ll * m : 0;
      knob.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;
    });
    const end = (e) => { if (!stick || e.pointerId !== stick.id) return; stick = null; input.mx = input.my = 0; base.classList.remove('on'); };
    zone.addEventListener('pointerup', end); zone.addEventListener('pointercancel', end);
    const btn = (el, fn) => el.addEventListener('pointerdown', (e) => { e.preventDefault(); SND.wake(); if (G.mode === 'play' && !hold.size) fn(); el.classList.add('down'); setTimeout(() => el.classList.remove('down'), 120); });
    btn($('#btn-attack'), () => { input.attack = true; });
    // Hold the attack button to keep swinging.
    let auto = 0;
    $('#btn-attack').addEventListener('pointerdown', () => { clearInterval(auto); auto = setInterval(() => { input.attack = true; }, 90); });
    ['pointerup', 'pointercancel', 'pointerleave'].forEach((ev) => $('#btn-attack').addEventListener(ev, () => clearInterval(auto)));
    btn($('#btn-bash'), () => { input.bash = true; });
    btn($('#btn-spell'), () => { input.spell = true; });
    btn($('#btn-spell2'), () => { input.spell2 = true; });
    btn($('#btn-action'), () => { input.act = true; });
  }());
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) { if (G.mode === 'play') { saveRun(); DF.UI.pause(true); } SND.sleep(true); }
    else SND.sleep(false);
  });

  /* ================= Bag and equipment ================= */
  function getRef(ref) { if (!run) return null; return ref.where === 'eq' ? run.eq[ref.slot] : run.bag[ref.i]; }
  function setRef(ref, it) { if (ref.where === 'eq') run.eq[ref.slot] = it; else run.bag[ref.i] = it; }
  function equip(ref) {
    const it = getRef(ref); if (!it || ref.where === 'eq') return;
    const slot = slotFor(it), before = stats().maxHp, old = run.eq[slot];
    run.eq[slot] = it; run.bag[ref.i] = old || null;
    const after = stats().maxHp; if (after > before) P.hp += after - before; P.hp = Math.min(P.hp, after);
    SND.clink(0.5); updateHUD(true); saveRun();
  }
  function unequip(slot) {
    const it = run.eq[slot]; if (!it) return false;
    const i = freeSlot(); if (i < 0) { DF.UI.toast(bagFullMsg() + ' Drop or forge something first.'); return false; }
    run.eq[slot] = null; run.bag[i] = it; P.hp = Math.min(P.hp, stats().maxHp); updateHUD(true); saveRun(); return true;
  }
  // Drag and drop in the hero panel: move an item from one place to another, swapping with whatever is there.
  // Returns '' when it worked, or why it couldn't.
  function moveItem(from, to) {
    if (!run || !from || !to) return 'nothing';
    const a = getRef(from), b = getRef(to);
    if (!a || a === b) return 'same';
    const kindOf = (s) => (s.startsWith('trinket') ? 'trinket' : s);
    const fits = (it, ref) => !it || ref.where !== 'eq' || slotKind(it) === kindOf(ref.slot);
    if (!fits(a, to)) return `${a.name} can't be worn there.`;
    if (!fits(b, from)) return `${b.name} can't be worn there, so they can't swap.`;
    const before = stats().maxHp;
    setRef(to, a); setRef(from, b || null);
    const after = stats().maxHp; if (after > before) P.hp += after - before; P.hp = Math.min(P.hp, after);
    if (from.where === 'eq' || to.where === 'eq') SND.clink(0.5);
    updateHUD(true); saveRun();
    return '';
  }
  function dropRef(ref) {
    const it = getRef(ref); if (!it) return;
    setRef(ref, null);
    room.pickups.push({ kind: 'item', item: it, x: P.x + P.dir * 8, y: P.y + 2, t: -1.2 });
    P.hp = Math.min(P.hp, stats().maxHp); updateHUD(true); saveRun();
  }
  function swapPickup(p, i) {
    if (!run || !room.pickups.includes(p) || !run.bag[i]) return;
    const old = run.bag[i];
    run.bag[i] = p.item; room.pickups.splice(room.pickups.indexOf(p), 1);
    room.pickups.push({ kind: 'item', item: old, x: p.x, y: p.y, t: -1.5 });
    SND.pickup(); recordItem(p.item); updateHUD(true); saveRun();
  }
  function allItems() {
    const out = [];
    DF.EQ_SLOTS.forEach((s) => { if (run.eq[s]) out.push({ ref: { where: 'eq', slot: s }, item: run.eq[s] }); });
    run.bag.forEach((it, i) => { if (it) out.push({ ref: { where: 'bag', i }, item: it }); });
    return out;
  }
  /* ================= The forge ================= */
  const EL_PREFIX = { fire: 'Ember', ice: 'Frost', lightning: 'Storm', poison: 'Venom', earth: 'Stone', light: 'Radiant', shadow: 'Shade', nature: 'Thorn', none: 'Twin' };
  const ICON_NOUN = { sword: 'Blade', axe: 'Cleaver', hammer: 'Maul', spear: 'Lance', dagger: 'Fang', mace: 'Crusher', helm: 'Crown', chestplate: 'Plate', shield: 'Bulwark',
    boots: 'Treads', cloak: 'Mantle', gauntlets: 'Fists', ring: 'Band', amulet: 'Pendant', gem: 'Shard', orb: 'Eye', charm: 'Token', feather: 'Plume', wand: 'Rod', bow: 'Longbow', wrench: 'Spanner', crossbow: 'Arbalest', staff: 'Stave', tome: 'Grimoire', quiver: 'Quiver', toolbox: 'Gearbox' };
  function fallbackForge(a, b) {
    const types = a.type === b.type ? [a.type] : [a.type, b.type];
    const type = pick(types), base = a.type === type ? a : b, other = base === a ? b : a;
    const element = other.element !== 'none' ? other.element : base.element;
    const icon = base.icon;
    let name = EL_PREFIX[element] + ' ' + ICON_NOUN[icon];
    if (norm(name) === norm(a.name) || norm(name) === norm(b.name)) name = 'Twin ' + ICON_NOUN[icon];
    const FLAVOUR = { fire: 'Warm to the touch, and getting warmer.', ice: 'Frost creeps along it, even in the sun.', lightning: 'It hums and crackles when you hold it.',
      poison: 'A green sheen drips from it.', earth: 'Heavy, solid and patient as stone.', light: 'It glows softly in the dark.', shadow: 'It seems to drink the light.',
      nature: 'Tiny leaves keep sprouting from it.', none: 'Two old things, one new shape.' };
    return { name, description: FLAVOUR[element] || FLAVOUR.none, type, icon, element,
      powers: type === 'weapon' ? [...new Set([].concat(a.powers || [], b.powers || []))] : [], stat: type === 'trinket' ? (base.stat || other.stat || 'luck') : '',
      colors: [(other.colors && other.colors[0]) || DF.EL_COLOR[element], (base.colors && base.colors[0]) || '#c8c8d8'] };
  }
  // Forge two items into one. Resolves with { item, ai } once the new item is ready.
  async function forge(refA, refB, altar) {
    const a = getRef(refA), b = getRef(refB);
    if (!a || !b || a === b) return null;
    const ctxA = { name: a.name, type: a.type, element: a.element, description: a.description }, ctxB = { name: b.name, type: b.type, element: b.element, description: b.description };
    let spec = await Promise.race([AI.request('forge', { a: ctxA, b: ctxB }, 10), new Promise((r) => setTimeout(() => r(null), AI.settings.mode === 'device' ? 90000 : 26000))]);
    const ai = !!spec;
    if (!spec) spec = fallbackForge(a, b);
    let rar = Math.max(a.rarity, b.rarity) + (a.rarity === b.rarity ? 1 : 0);
    if (rnd() < stats().luckF * 0.5) rar++;
    // Forging always makes something stronger than what went in: one level up from the best input,
    // and if that still doesn't beat an input of the same kind (rounding, or two legendaries), keep levelling.
    rar = Math.min(4, rar);
    const lvl0 = Math.max(a.lvl || 0, b.lvl || 0, run.floorN) + 1 + (a.rarity === 4 && b.rarity === 4 ? 1 : 0);
    const it = makeItem(spec, rar, lvl0);
    const score = (x) => { const st = itemStats(x); return (st.attack || 0) + (st.defence || 0) + (st.health || 0) / 3 + (st.speed || 0) / 4 + (st.luck || 0) / 3; };
    const beat = Math.max(...[a, b].filter((x) => slotKind(x) === slotKind(it) && (x.type !== 'trinket' || x.stat === it.stat)).map(score), -1);
    for (let k = 0; k < 8 && score(it) <= beat; k++) it.lvl++;
    it.forged = true; it.from = [a.name, b.name];
    // Put the new item where the old ones were (equipped if one of them was equipped and it fits).
    const before = stats().maxHp;
    setRef(refA, null); setRef(refB, null);
    const kindOfSlot = (s) => (s.startsWith('trinket') ? 'trinket' : s);
    const eqRef = [refA, refB].find((r) => r.where === 'eq' && kindOfSlot(r.slot) === slotKind(it));
    if (eqRef) run.eq[eqRef.slot] = it;
    else {
      const i = freeSlot();
      if (i >= 0) run.bag[i] = it;
      else { // bag full and both inputs were worn: wear the new one, and set down what it replaces
        const s = slotFor(it), old = run.eq[s]; run.eq[s] = it;
        if (old) { room.pickups.push({ kind: 'item', item: old, x: P.x + P.dir * 8, y: P.y + 2, t: -1.2 }); DF.UI.toast(`Your bag was full, so ${old.name} was set down here.`); }
      }
    }
    const after = stats().maxHp; if (after > before) P.hp += after - before; P.hp = Math.min(P.hp, after);
    if (altar) altar.uses--;
    run.forged++; meta.stats.forged++;
    const rec = { a: a.name, b: b.name, c: it.name, icon: it.icon, colors: it.colors, element: it.element };
    if (!meta.books.recipes.some((r) => r.c === rec.c && ((r.a === rec.a && r.b === rec.b) || (r.a === rec.b && r.b === rec.a)))) meta.books.recipes.unshift(rec);
    if (meta.books.recipes.length > 300) meta.books.recipes.length = 300;
    recordItem(it);
    updateHUD(true); saveRun();
    return { item: it, ai };
  }

  /* ================= Hooks for the menus ================= */
  Object.defineProperties(G, {
    meta: { get: () => meta }, run: { get: () => run }, P: { get: () => P }, room: { get: () => room },
  });
  Object.assign(G, {
    saveMeta, UPGRADES, buyUpgrade, buyStall, eventDo, eventPicture, EVENT_INFO, sellPrice, sellItem, slotFor, slotKind, itemScore, bagSize, moveItem, learnScroll, rerollCost, rerollBlock, rerollFloor, savedRerollBlock, rerollSaved, swapPickup, startRun, quitRun, abandonRun, descend, usePotion, stats, itemStats, equip, unequip, dropRef, getRef, allItems, forge, WEAPON_FEEL,
    prepareNextRun, resize, updateHUD, drawMinimap,
    resetAll() { localStorage.removeItem(META_KEY); meta = defaultMeta(); saveMeta(true); },
    importMeta(m) { if (m && m.v === 1) { meta = Object.assign(defaultMeta(), m, { up: Object.assign(defaultMeta().up, m.up), stats: Object.assign(defaultMeta().stats, m.stats), books: Object.assign(defaultMeta().books, m.books), records: Object.assign(defaultMeta().records, m.records) }); tidyMeta(); saveMeta(true); return true; } return false; },
  });
  // For testing from the browser console.
  G.debug = { get floor() { return floor; }, enterRoom, breakProp, makeEnemy, dropItem, makeItem, lootSpec, makeEvent, killAll() { room.enemies.slice().forEach((e) => killEnemy(e)); }, fx };
  DF.G = G;
  DF.boot = function () { resize(); requestAnimationFrame((t) => { lastT = t; frame(t); }); prepareNextRun(); };
}(window.DF));
