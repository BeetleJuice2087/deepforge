/* Deepforge: the dungeon's AI ("the Deep").
   Two ways to think, like Sand Alchemy: on this device (WebLLM on the graphics chip) or online
   through your Cloudflare Worker (which keeps every answer in KV so repeats are instant for everyone).
   Every answer is checked against the game's fixed lists before it's used, and every answer is
   also saved on this device, so a floor or forge you've seen before never waits again.
   The game never waits on the AI: it asks ahead of time and uses the handmade pool if an answer
   isn't ready. */
(function (DF) {
  'use strict';
  const P = window.DF_PROMPTS;
  const C = DF.color;

  // Paste your Deepforge Worker address here to switch online AI on for everyone (or set it in Settings).
  const AI_DEFAULT_URL = 'https://deepforge.christers20.workers.dev';
  const AI_KEY = 'deepforge.ai', INV_KEY = 'deepforge.inv', LOG_KEY = 'deepforge.ailog';
  const settings = { mode: 'cloud', url: '', model: 'small' };
  try { Object.assign(settings, JSON.parse(localStorage.getItem(AI_KEY) || '{}')); } catch (e) { /* defaults */ }
  const saveSettings = () => { try { localStorage.setItem(AI_KEY, JSON.stringify(settings)); } catch (e) { /* fine */ } };
  const aiUrl = () => (settings.url || AI_DEFAULT_URL || '').trim().replace(/\/+$/, '');
  const hasGPU = () => !!navigator.gpu && window.isSecureContext !== false;
  const IS_MOBILE = /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent) || (navigator.maxTouchPoints > 1 && /Macintosh/.test(navigator.userAgent));

  /* ---- A debug log, kept between visits (shown in Settings) ---- */
  let logLines = []; try { logLines = JSON.parse(localStorage.getItem(LOG_KEY) || '[]'); } catch (e) { logLines = []; }
  function log(msg) {
    logLines.push(new Date().toTimeString().slice(0, 8) + '  ' + String(msg).replace(/\s+/g, ' ').slice(0, 300));
    if (logLines.length > 100) logLines = logLines.slice(-100);
    try { localStorage.setItem(LOG_KEY, JSON.stringify(logLines)); } catch (e) { /* full */ }
  }

  /* ---- Everything invented so far, kept on this device ---- */
  let inv = {};
  try { inv = JSON.parse(localStorage.getItem(INV_KEY) || '{}') || {}; } catch (e) { inv = {}; }
  let invTimer = 0;
  function remember(key, spec) {
    inv[key] = spec;
    const keys = Object.keys(inv);
    if (keys.length > 1500) keys.slice(0, keys.length - 1500).forEach((k) => delete inv[k]);
    clearTimeout(invTimer);
    invTimer = setTimeout(() => { try { localStorage.setItem(INV_KEY, JSON.stringify(inv)); } catch (e) { /* storage full */ } }, 500);
  }

  /* ---- Checking answers ---- */
  const BAD_WORDS = /\b(ass|arse|bitch|bastard|crap|damn|dick|fuck|shit|piss|cock|cunt|slut|whore|nazi|porn|sex|murder|gun|drug|weed|beer|wine|vodka|gore|suicide)\w*/i;
  function cleanName(n, max) {
    n = String(n || '').replace(/[^A-Za-z0-9 '\-]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max || 24).trim();
    if (n.length < 2 || BAD_WORDS.test(n)) return '';
    return n.replace(/(^|\s|-)[a-z]/g, (c) => c.toUpperCase());
  }
  function cleanText(t, max) {
    t = String(t || '').replace(/[<>{}\[\]\\]/g, '').replace(/\s+/g, ' ').trim();
    if (t.length > max) { t = t.slice(0, max); const cut = t.lastIndexOf(' '); if (cut > max * 0.6) t = t.slice(0, cut); t = t.replace(/[,;:\s]+$/, '') + '.'; }
    return BAD_WORDS.test(t) ? '' : t;
  }
  const low = (s) => String(s || '').toLowerCase().trim();
  const pickFrom = (list, v, fallback) => { v = low(v); return list.includes(v) ? v : fallback; };
  const hexes = (arr) => (Array.isArray(arr) ? arr : []).map((c) => String(c).trim()).filter(C.hexOk).slice(0, 4);
  function nearestAbility(a) {
    a = low(a);
    if (DF.ABILITIES.includes(a)) return a;
    const map = [[/fire|flame|burn/, 'fire trail'], [/split|divid/, 'splits when hit'], [/explo|burst|boom/, 'explodes on death'], [/freez|ice|frost/, 'freezes floor'],
      [/heal/, 'heals friends'], [/shield|armou?r|guard/, 'shields'], [/poison|toxic|venom/, 'poisons'], [/pull|drag|vortex|suck/, 'pulls you in']];
    for (const [re, v] of map) if (re.test(a)) return v;
    return '';
  }
  function nearestBehaviour(b) {
    b = low(b);
    if (DF.BEHAVIOURS.includes(b)) return b;
    const map = [[/shoot|rang|spit|throw/, 'shooter'], [/hid|ambush|lurk|stealth/, 'ambusher'], [/swarm|pack|group|horde/, 'swarm'], [/tank|slow|tough|charg|guard/, 'tank'],
      [/summon|call|spawn/, 'summoner'], [/trick|blink|teleport/, 'trickster']];
    for (const [re, v] of map) if (re.test(b)) return v;
    return 'chaser';
  }
  function checkTheme(s) {
    const name = cleanName(s.name, 24); if (!name) return null;
    const element = pickFrom(DF.ELEMENTS, s.element, 'earth');
    let floor = C.hexOk(s.floor) ? s.floor : '#2a2430', wall = C.hexOk(s.wall) ? s.wall : C.lighten(floor, 0.15);
    // Floors must stay dark so the monsters and lights stand out.
    while (C.lum(floor) > 0.16) floor = C.darken(floor, 0.25);
    if (C.lum(wall) > 0.35) wall = C.darken(wall, 0.35);
    if (Math.abs(C.lum(wall) - C.lum(floor)) < 0.04) wall = C.lighten(wall, 0.18);
    let accent = C.hexOk(s.accent) ? s.accent : DF.EL_COLOR[element];
    if (C.lum(accent) < 0.35) accent = C.lighten(accent, 0.45);
    let light = C.hexOk(s.light) ? s.light : C.lighten(accent, 0.4);
    if (C.lum(light) < 0.5) light = C.lighten(light, 0.5);
    return { name, description: cleanText(s.description, 90) || 'A strange new depth.', element, rule: pickFrom(DF.RULES, s.rule, DF.RULES[DF.seeded(name)(DF.RULES.length)]),
      colors: { floor, wall, accent, light } };
  }
  function checkMonster(s, boss) {
    const name = cleanName(s.name, 24); if (!name) return null;
    const element = pickFrom(DF.ELEMENTS, s.element, 'earth');
    let weakness = pickFrom(DF.ELEMENTS, s.weakness, DF.NATURAL_WEAKNESS[element]);
    if (weakness === element) weakness = DF.NATURAL_WEAKNESS[element];
    let abilities = [...new Set((Array.isArray(s.abilities) ? s.abilities : [s.abilities]).map(nearestAbility).filter(Boolean))].slice(0, 2);
    let behaviour = nearestBehaviour(s.behaviour);
    if (boss) {
      if (behaviour === 'swarm' || behaviour === 'ambusher') behaviour = 'tank'; // a boss comes alone and in the open
      const r = DF.seeded(name);
      while (abilities.length < 2) { const a = DF.ABILITIES[r(DF.ABILITIES.length)]; if (!abilities.includes(a) && a !== 'splits when hit') abilities.push(a); }
      abilities = abilities.map((a) => (a === 'splits when hit' ? 'shields' : a));
      abilities = [...new Set(abilities)];
    }
    let colors = hexes(s.colors);
    if (!colors.length) colors = [DF.EL_COLOR[element]];
    return { name, description: cleanText(s.description, 90) || DF.BEHAVIOUR_TEXT[behaviour], colors, element, weakness,
      tier: boss ? 3 : Math.max(1, Math.min(3, Math.round(+s.tier) || 2)), behaviour, abilities,
      body: DF.BODIES.includes(low(s.body)) ? low(s.body) : '' };
  }
  function checkItem(s, types) {
    const name = cleanName(s.name, 24); if (!name) return null;
    const type = types.includes(low(s.type)) ? low(s.type) : types[0];
    const r = DF.seeded(name);
    const icon = DF.ICONS[type].includes(low(s.icon)) ? low(s.icon) : DF.ICONS[type][r(DF.ICONS[type].length)];
    const element = low(s.element) === 'none' ? 'none' : pickFrom(DF.ELEMENTS, s.element, 'none');
    let powers = [];
    if (type === 'weapon') powers = [...new Set((Array.isArray(s.powers) ? s.powers : [s.powers]).map(low).filter((p) => DF.POWERS.includes(p)))].slice(0, 4);
    if (type === 'weapon' && !powers.length) powers = [DF.POWERS[r(DF.POWERS.length)]];
    const stat = type === 'trinket' ? pickFrom(DF.STATS, s.stat, DF.STATS[r(DF.STATS.length)]) : '';
    let colors = hexes(s.colors).slice(0, 2);
    if (!colors.length) colors = [DF.EL_COLOR[element]];
    return { name, description: cleanText(s.description, 90) || 'Freshly forged.', type, icon, element, powers, stat, colors };
  }
  function check(kind, spec, ctx) {
    if (!spec || typeof spec !== 'object') return null;
    if (typeof spec.name !== 'string' && typeof spec.Name === 'string') spec.name = spec.Name;
    if (kind === 'theme') return checkTheme(spec);
    if (kind === 'monster') return checkMonster(spec, ctx.slot === 'boss' || ctx.slot === 'named');
    if (kind === 'item') return checkItem(spec, [P.itemTypeForSlot(ctx.slot)]);
    if (kind === 'forge') {
      const out = checkItem(spec, P.forgeTypes(ctx));
      if (!out) return null;
      const n = P.norm(out.name);
      if (n === P.norm(ctx.a.name) || n === P.norm(ctx.b.name)) return null; // it just repeated an ingredient
      return out;
    }
    return null;
  }

  // Small models sometimes wrap their JSON in chatter or stop half-way. Pull out the first {...} and close it up.
  function looseJSON(text) {
    let s = String(text || '').replace(/```(json)?/gi, '');
    const a = s.indexOf('{'); if (a < 0) return null;
    s = s.slice(a);
    try { return JSON.parse(s.slice(0, s.lastIndexOf('}') + 1)); } catch (e) { /* repair below */ }
    for (let cut = s.length; cut > 1; cut--) {
      const t = s.slice(0, cut).replace(/[\s,:]+$/, '');
      const stack = []; let inStr = false;
      for (let i = 0; i < t.length; i++) {
        const c = t[i];
        if (inStr) { if (c === '\\') i++; else if (c === '"') inStr = false; continue; }
        if (c === '"') inStr = true; else if (c === '{' || c === '[') stack.push(c === '{' ? '}' : ']'); else if (c === '}' || c === ']') stack.pop();
      }
      if (inStr) continue;
      try { const o = JSON.parse(t + stack.reverse().join('')); if (o && typeof o === 'object') return o; } catch (e) { /* cut more */ }
      if (s.length - cut > 400) break;
    }
    return null;
  }

  /* ---- On this device (WebGPU + WebLLM, from Sand Alchemy) ---- */
  const WEBLLM_URL = 'https://cdn.jsdelivr.net/npm/@mlc-ai/web-llm@0.2.85/+esm';
  const LOCAL_MODELS = {
    small: { id: 'Llama-3.2-1B-Instruct-q4f16_1-MLC', label: 'Small and quick', size: 'about 0.7 GB' },
    middle: { id: 'Qwen2.5-1.5B-Instruct-q4f16_1-MLC', label: 'In-between', size: 'about 1 GB' },
    better: { id: 'Llama-3.2-3B-Instruct-q4f16_1-MLC', label: 'Smarter', size: '1.8 GB, for computers' },
  };
  const PHONE = IS_MOBILE || (navigator.deviceMemory || 8) <= 4;
  const local = { engine: null, model: null, loading: null, progress: 0, text: '', cached: {}, error: '', chunk: PHONE ? 64 : 0, thread: null };
  let webllm = null, gpuInfo = null;
  async function webllmLib() { if (!webllm) webllm = await import(WEBLLM_URL); return webllm; }
  function gpuCheck() {
    if (!gpuInfo) gpuInfo = (async () => {
      if (!hasGPU()) return { ok: false, why: 'This browser can’t run AI on its graphics chip.' };
      if (!('caches' in window)) return { ok: false, why: 'This browser can’t store the download.' };
      const adapter = await Promise.race([navigator.gpu.requestAdapter().catch(() => null), new Promise((r) => setTimeout(() => r(null), 10000))]);
      if (!adapter) return { ok: false, why: 'This device’s graphics chip isn’t supported. Try Online.' };
      return { ok: true, f16: adapter.features.has('shader-f16') };
    })();
    return gpuInfo;
  }
  function useBuildFor(gpu) { if (gpu.ok && !gpu.f16) for (const k in LOCAL_MODELS) LOCAL_MODELS[k].id = LOCAL_MODELS[k].id.replace('q4f16_1', 'q4f32_1'); }
  const modelId = () => (LOCAL_MODELS[settings.model] || LOCAL_MODELS.small).id;
  async function loadLocal() {
    if (local.engine && local.model === modelId()) return local.engine;
    if (local.loading) return local.loading;
    local.loading = (async () => {
      const gpu = await gpuCheck();
      if (!gpu.ok) throw new Error(gpu.why);
      useBuildFor(gpu);
      const want = modelId();
      const lib = await webllmLib();
      if (local.engine) { try { await local.engine.unload(); } catch (e) { /* ignore */ } local.engine = null; }
      const code = `import * as w from '${WEBLLM_URL}'; const h = new w.WebWorkerMLCEngineHandler(); self.onmessage = (m) => h.onmessage(m);`;
      const thread = new Worker(URL.createObjectURL(new Blob([code], { type: 'text/javascript' })), { type: 'module' });
      local.thread = thread; local.progress = 0; local.error = '';
      log('Starting ' + want);
      let last = Date.now();
      const watchdog = new Promise((_, fail) => {
        const tick = setInterval(() => {
          if (!local.loading) { clearInterval(tick); return; }
          if (Date.now() - last > 90000) { clearInterval(tick); try { thread.terminate(); } catch (e) { /* gone */ } fail(new Error('It got stuck. On a phone, try Small and quick, or use Online.')); }
        }, 5000);
      });
      const eng = await Promise.race([lib.CreateWebWorkerMLCEngine(thread, want, {
        initProgressCallback: (r) => { last = Date.now(); local.progress = r.progress || 0; local.text = r.text || ''; emit(); },
      }, local.chunk ? { prefill_chunk_size: local.chunk, context_window_size: 2048 } : undefined), watchdog]);
      local.engine = eng; local.model = want; local.cached[want] = true; local.progress = 1;
      log('Started OK');
      return eng;
    })();
    try { return await local.loading; } catch (e) { local.error = String(e && e.message || e); log('Start failed: ' + local.error); throw e; } finally { local.loading = null; emit(); }
  }
  async function checkCached() {
    if (!hasGPU()) return;
    useBuildFor(await gpuCheck());
    try { const lib = await webllmLib(); for (const k in LOCAL_MODELS) local.cached[LOCAL_MODELS[k].id] = await lib.hasModelInCache(LOCAL_MODELS[k].id); } catch (e) { /* offline */ }
    emit();
  }
  async function removeLocal() {
    const id = modelId();
    if (local.engine && local.model === id) { try { await local.engine.unload(); } catch (e) { /* ignore */ } local.engine = null; local.model = null; }
    const lib = await webllmLib(); await lib.deleteModelAllInfoInCache(id);
    local.cached[id] = false; local.progress = 0; emit();
  }
  async function askLocal(kind, ctx) {
    let eng;
    try { eng = await loadLocal(); } catch (e) { return null; }
    const ways = [{}, { response_format: { type: 'json_object' } }];
    let restarts = 0;
    for (let k = 0; k < ways.length; k++) {
      try {
        try { await eng.resetChat(); } catch (e) { /* older engines */ }
        const r = await eng.chat.completions.create(Object.assign({
          messages: [{ role: 'system', content: P.SYSTEM }, { role: 'user', content: P.question(kind, ctx) }],
          temperature: 0.85, max_tokens: 400,
        }, ways[k]));
        const text = r && r.choices && r.choices[0] && r.choices[0].message ? r.choices[0].message.content : '';
        log(kind + ' (device): ' + String(text).slice(0, 200));
        const spec = check(kind, looseJSON(text), ctx);
        if (spec) return spec;
      } catch (e) {
        const why = String(e && e.message || e);
        log(kind + ' (device) error: ' + why.slice(0, 160));
        const crashed = /instance reference|device (was |is )?lost|mapAsync|dispos|destroy/i.test(why);
        if (crashed && restarts < 1) {
          restarts++; local.chunk = Math.max(16, Math.floor((local.chunk || 256) / 4));
          try { if (local.thread) local.thread.terminate(); } catch (e2) { /* gone */ }
          local.engine = null; local.model = null; local.thread = null;
          try { eng = await loadLocal(); } catch (e2) { return null; }
          k = -1; continue;
        }
        if (crashed) return null;
      }
    }
    return null;
  }

  /* ---- Online, through the Worker ---- */
  let cloudLeft = null;
  async function askCloud(kind, ctx) {
    const ctl = new AbortController(), timer = setTimeout(() => ctl.abort(), 25000);
    try {
      const r = await fetch(aiUrl() + '/invent', { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ game: 'deepforge', v: 1, kind, ctx }), signal: ctl.signal });
      const j = await r.json().catch(() => ({}));
      if (j && j.left != null) cloudLeft = j.left;
      if (!r.ok || !j.ok) { log(kind + ' (online) said: ' + (j.error || r.status)); return null; }
      const spec = check(kind, j.spec, ctx);
      if (!spec) log(kind + ' (online) answer didn’t fit: ' + JSON.stringify(j.spec).slice(0, 160));
      return spec;
    } catch (e) { log(kind + ' (online) unreachable'); return null; } finally { clearTimeout(timer); }
  }
  async function testCloud() {
    if (!/^https?:\/\//.test(aiUrl())) return 'The address should start with https://';
    try {
      const r = await fetch(aiUrl() + '/', { cache: 'no-store' }); const j = await r.json();
      if (j && j.ok && j.game === 'deepforge') { cloudLeft = j.left; return `Connected! ${j.left != null ? j.left + ' new inventions left today.' : ''}`; }
      if (j && j.ok) return 'That’s a Worker, but not the Deepforge one. Deploy worker/deepforge-worker.js.';
      return 'That address answered, but not like a Deepforge Worker.';
    } catch (e) { return 'Couldn’t reach that address.'; }
  }

  /* ---- The queue: one question at a time on the device, two at a time online ---- */
  const queue = [], waiting = new Map();
  let running = 0, busyKind = '';
  const listeners = new Set();
  function emit() { listeners.forEach((f) => { try { f(); } catch (e) { /* ignore */ } }); }
  const ready = () => settings.mode === 'device' ? hasGPU() : settings.mode === 'cloud' ? /^https:\/\/\S+$|^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(aiUrl()) : false;
  // Ask for something. Resolves with a checked answer, or null (AI off, offline, or a bad answer).
  function request(kind, rawCtx, prio) {
    const ctx = P.cleanCtx(kind, rawCtx); if (!ctx) return Promise.resolve(null);
    const key = P.key(kind, ctx);
    if (inv[key]) { const hit = check(kind, inv[key], ctx); if (hit) return Promise.resolve(hit); }
    if (!ready()) return Promise.resolve(null);
    if (waiting.has(key)) { const job = waiting.get(key); job.prio = Math.max(job.prio, prio || 0); return job.promise; }
    const job = { kind, ctx, key, prio: prio || 0 };
    job.promise = new Promise((res) => { job.res = res; });
    waiting.set(key, job); queue.push(job); pump(); emit();
    return job.promise;
  }
  function pump() {
    const max = settings.mode === 'device' ? 1 : 2;
    while (running < max && queue.length) {
      queue.sort((a, b) => b.prio - a.prio);
      const job = queue.shift(); running++; busyKind = job.kind; emit();
      const t0 = performance.now();
      (settings.mode === 'device' ? askLocal(job.kind, job.ctx) : askCloud(job.kind, job.ctx))
        .catch(() => null)
        .then((spec) => {
          if (spec) { remember(job.key, spec); log(`${job.kind} ready in ${Math.round(performance.now() - t0)} ms: ${spec.name}`); }
          waiting.delete(job.key); job.res(spec || null);
        })
        .finally(() => { running--; busyKind = queue.length ? busyKind : ''; emit(); pump(); });
    }
  }
  // Drop everything that isn't wanted any more (a new run started).
  function clearQueue(belowPrio) {
    for (let i = queue.length - 1; i >= 0; i--) if (queue[i].prio < belowPrio) { const j = queue[i]; queue.splice(i, 1); waiting.delete(j.key); j.res(null); }
    emit();
  }

  DF.AI = {
    settings, saveSettings, ready, request, clearQueue, testCloud, log, hasGPU, IS_MOBILE, LOCAL_MODELS, local, loadLocal, removeLocal, checkCached, modelId,
    get logText() { return logLines.join('\n'); },
    get pending() { return queue.length + running; },
    get busyKind() { return busyKind; },
    get cloudLeft() { return cloudLeft; },
    get inventCount() { return Object.keys(inv).length; },
    onChange(f) { listeners.add(f); return () => listeners.delete(f); },
    url: aiUrl, defaultUrl: AI_DEFAULT_URL,
    check, cleanName, cleanText,
    exportInv: () => inv, importInv(o) { if (o && typeof o === 'object') { inv = Object.assign({}, o, inv); remember('_', null); delete inv._; } },
  };
}(window.DF));
