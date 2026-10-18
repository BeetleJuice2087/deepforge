/* Deepforge: the camp, menus, item cards, the forge, the books and settings. */
(function (DF) {
  'use strict';
  const $ = (s) => document.querySelector(s);
  const G = DF.G, AI = DF.AI, SND = DF.SND;
  const esc = (t) => String(t == null ? '' : t).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const cap = (s) => String(s || '').charAt(0).toUpperCase() + String(s || '').slice(1);
  let touch = matchMedia('(pointer: coarse)').matches;
  function setTouch(v) { touch = v; document.body.classList.toggle('touch', v); G.resize(); }
  window.addEventListener('touchstart', () => { if (!touch) setTouch(true); }, { passive: true });
  // Browsers only allow sound after you touch the page, so the first tap anywhere starts the music.
  window.addEventListener('pointerdown', () => SND.wake(), { passive: true });
  window.addEventListener('mousemove', (e) => { if (touch && e.movementX && !matchMedia('(pointer: coarse)').matches) setTouch(false); });

  /* ---------- Toasts and banners ---------- */
  const toasts = [];
  let bannerUntil = 0;
  function toast(msg, ms, html) {
    // Wait until the floor's title card has gone, so they never pile up on it.
    const wait = bannerUntil - Date.now();
    if (wait > 0) { setTimeout(() => toast(msg, ms, html), wait + Math.random() * 200); return; }
    const el = document.createElement('div'); el.className = 'toast';
    if (html) el.innerHTML = msg; else el.textContent = msg;
    $('#toasts').appendChild(el); toasts.push(el);
    while (toasts.length > 3) toasts.shift().remove();
    requestAnimationFrame(() => el.classList.add('on'));
    setTimeout(() => { el.classList.remove('on'); setTimeout(() => { el.remove(); const i = toasts.indexOf(el); if (i >= 0) toasts.splice(i, 1); }, 300); }, ms || 2200);
  }
  let bannerT = 0;
  function banner(small, big, sub) {
    const b = $('#banner');
    b.innerHTML = `<small>${esc(small)}</small><b>${esc(big)}</b><span>${esc(sub)}</span>`;
    b.classList.remove('on'); void b.offsetWidth; b.classList.add('on');
    bannerUntil = Date.now() + 3300;
    clearTimeout(bannerT); bannerT = setTimeout(() => b.classList.remove('on'), 3600);
  }
  function discovery(kind, spec) {
    if (kind === 'monster') toast(`<img src="${DF.bigPicture('monster', spec, 3)}" alt=""><span><small>New in the Monster Book</small>${esc(spec.name)}</span>`, 2600, true);
    else toast(`<img src="${DF.bigPicture('item', spec, 3)}" alt=""><span><small>New in the Item Book</small>${esc(spec.name)}</span>`, 2600, true);
  }
  function bossBar(e) {
    const bar = $('#bossbar');
    if (!e) { bar.hidden = true; return; }
    bar.hidden = false;
    $('#boss-name').textContent = e.spec.name;
    const rec = G.meta.books.mon[window.DF_PROMPTS.norm(e.spec.name)], k = rec ? rec.kills : 0;
    $('#boss-rec').hidden = !k; $('#boss-rec').textContent = k ? `Defeated ${k} time${k === 1 ? '' : 's'} before` : '';
    $('#boss-fill').style.width = Math.max(0, 100 * e.hp / e.maxHp) + '%';
  }
  let lastAction = '';
  function setAction(a) {
    const label = a ? a.label : '';
    if (label === lastAction) return;
    lastAction = label;
    const b = $('#btn-action'); b.hidden = !a; b.textContent = label;
    $('#key-act').hidden = !a; $('#key-act').innerHTML = a ? `<kbd>E</kbd> ${esc(label)}` : '';
  }

  /* ---------- Item slots along the bottom ---------- */
  function slotHTML(it, label) {
    if (!it) return `<span class="empty">${label || ''}</span>`;
    return `<img src="${DF.bigPicture('item', it, 3)}" alt=""><i style="--r:${DF.RAR_COLOR[it.rarity]}"></i>`;
  }
  function renderSlots() {
    const run = G.run; if (!run) return;
    document.querySelectorAll('[data-eq]').forEach((b) => { const s = b.dataset.eq; b.innerHTML = slotHTML(run.eq[s], slotName(s)); b.setAttribute('aria-label', run.eq[s] ? run.eq[s].name : 'No ' + slotName(s).toLowerCase()); });
    const n = run.bag.filter(Boolean).length, size = run.bag.length, lab = $('#bag-label');
    lab.textContent = n >= size ? `Bag full ${size}/${size}` : `Bag ${n}/${size}`; lab.classList.toggle('full', n >= size);
    // The bar shows the first six bag slots; the rest are one tap away in the hero panel.
    const extra = run.bag.slice(6).filter(Boolean).length, more = $('#bag-more');
    if (more) { more.innerHTML = `<span class="more-n">${extra ? '+' + extra : '\u22ef'}</span>`; more.classList.toggle('filled', extra > 0); more.setAttribute('aria-label', `Open the bag (${n} of ${size})`); }
    document.querySelectorAll('[data-bag]').forEach((b) => { const it = run.bag[+b.dataset.bag]; b.innerHTML = slotHTML(it); b.setAttribute('aria-label', it ? it.name : 'Empty bag slot'); b.classList.toggle('filled', !!it); });
  }
  document.querySelectorAll('[data-eq]').forEach((b) => b.addEventListener('click', () => openItem({ where: 'eq', slot: b.dataset.eq })));
  document.querySelectorAll('[data-bag]').forEach((b) => b.addEventListener('click', () => openItem({ where: 'bag', i: +b.dataset.bag })));
  $('#potion').addEventListener('click', () => G.usePotion());
  $('#bag-more').addEventListener('click', () => { invSel = { ref: { where: 'bag', i: Math.min(6, G.run.bag.length - 1) } }; openInventory(); });
  // Friendly names for the places you wear things.
  function slotName(s) { const cls = G.run && G.run.cls; return { weapon: WEAPON_WORD[cls] || 'Weapon', offhand: DF.OFFHAND_WORD[cls] || 'Off-hand', head: 'Head', body: 'Body', hands: 'Hands', feet: 'Feet', trinket1: 'Trinket', trinket2: 'Trinket', trinket: 'Trinket' }[s] || s; }

  /* ---------- The modal sheet ---------- */
  let onClose = null;
  function openSheet(html, cls, closeFn) {
    const m = $('#modal'), s = $('#sheet');
    s.className = 'sheet ' + (cls || ''); s.onclick = null; s.innerHTML = html; m.hidden = false;
    G.hold.add('modal'); onClose = closeFn || null;
    const f = s.querySelector('[data-focus]') || s.querySelector('button'); if (f) setTimeout(() => f.focus({ preventScroll: true }), 30);
    return s;
  }
  function closeSheet() {
    $('#modal').hidden = true; G.hold.delete('modal');
    const f = onClose; onClose = null; if (f) f();
  }
  $('#modal').addEventListener('click', (e) => { if (e.target.id === 'modal' && !$('#sheet').classList.contains('sticky')) closeSheet(); });
  window.addEventListener('keydown', (e) => { if (e.code === 'Escape' && !$('#modal').hidden && !$('#sheet').classList.contains('sticky')) { e.stopPropagation(); closeSheet(); } }, true);

  /* ---------- Item cards ---------- */
  function statLines(it) {
    const st = G.itemStats(it), out = [];
    if (st.attack) out.push(`+${st.attack} attack`); if (st.defence) out.push(`+${st.defence} defence`); if (st.health) out.push(`+${st.health} health`);
    if (st.speed) out.push(`+${st.speed} speed`); if (st.luck) out.push(`+${st.luck}% luck`);
    return out;
  }
  function itemTitle(it) { return `${DF.RARITY[it.rarity]} ${it.element && it.element !== 'none' ? it.element + ' ' : ''}${it.icon}`; }
  function itemBlock(it, big) {
    const cls = G.run && G.run.cls, mage = cls === 'mage', ranger = cls === 'ranger';
    const MAGE_POWER = { pierce: 'Bolts pass through foes.', bounce: 'Bolts bounce off walls.', multishot: 'Casts three bolts at once.' };
    const RANGER_POWER = { pierce: 'Arrows pass through foes.', bounce: 'Arrows bounce off walls.', multishot: 'Shoots three arrows at once.' };
    const pw = (it.powers || []).map((p) => `<li><b>${cap(p)}</b> ${esc((mage && MAGE_POWER[p]) || (ranger && RANGER_POWER[p]) || DF.POWER_TEXT[p])}</li>`).join('');
    const feel = it.type === 'weapon' ? (mage ? 'Powers your magic bolts.' : ranger ? 'Powers your arrows.' : weaponFeelText(it.icon)) : '';
    return `<div class="item-head"><img class="pix ${big ? 'big' : ''}" src="${DF.bigPicture('item', it, big ? 8 : 6)}" alt="" style="--r:${DF.RAR_COLOR[it.rarity]}">
      <div><h2 style="color:${DF.RAR_COLOR[it.rarity]}">${esc(it.name)}</h2><p class="sub">${esc(itemTitle(it))}</p></div></div>
      <p class="desc">${esc(it.description)}</p>
      <ul class="stats">${statLines(it).map((s) => `<li>${s}</li>`).join('')}${feel ? `<li class="feel">${feel}</li>` : ''}</ul>
      ${pw ? `<ul class="powers">${pw}</ul>` : ''}
      ${it.from ? `<p class="from">Forged from ${esc(it.from[0])} and ${esc(it.from[1])}</p>` : ''}`;
  }
  /* ---------- Comparing a find with what you're wearing ---------- */
  const CMP_STATS = ['attack', 'defence', 'health', 'speed', 'luck'];
  function itemScore(it) { const st = G.itemStats(it); return (st.attack || 0) + (st.defence || 0) + (st.health || 0) / 3 + (st.speed || 0) / 4 + (st.luck || 0) / 3 + (it.powers || []).length * 2; }
  // What a find would replace: the item in its slot (for trinkets, an empty trinket slot or the weaker of the two).
  function compareTarget(it) {
    const run = G.run; if (!run || !it) return { worn: true };
    if (Object.values(run.eq).includes(it)) return { worn: true };
    const k = G.slotKind(it);
    if (k === 'trinket') { const a = run.eq.trinket1, b = run.eq.trinket2; return { slot: 'trinket', cur: !a || !b ? null : G.itemScore(a) <= G.itemScore(b) ? a : b }; }
    return { slot: k, cur: run.eq[k] };
  }
  function verdict(it) {
    const t = compareTarget(it); if (t.worn) return null; if (!t.cur) return 'up';
    const d = itemScore(it) - itemScore(t.cur); return d > 0.5 ? 'up' : d < -0.5 ? 'down' : 'same';
  }
  const VERDICT = { up: 'Upgrade ▲', down: 'Weaker ▼', same: 'About the same' };
  function compareBlock(it) {
    const run = G.run; if (!run || !it) return '';
    const t = compareTarget(it); if (t.worn) return ''; const cur = t.cur;
    if (!cur) return `<div class="cmp"><div class="cmp-head"><span>Your ${slotName(t.slot).toLowerCase()} slot is empty.</span><b class="cmp-v up">${VERDICT.up}</b></div></div>`;
    const a = G.itemStats(cur), b = G.itemStats(it), v = verdict(it);
    const rows = CMP_STATS.filter((k) => a[k] || b[k]).map((k) => {
      const d = (b[k] || 0) - (a[k] || 0), u = k === 'luck' ? '%' : '';
      return `<div class="cmp-row"><span>${cap(k)}</span><em>${a[k] || 0}${u}</em><i>→</i><em>${b[k] || 0}${u}</em><strong class="${d > 0 ? 'up' : d < 0 ? 'down' : ''}">${d > 0 ? '+' + d : d < 0 ? '−' + -d : '='}</strong></div>`;
    }).join('');
    const pa = cur.powers || [], pb = it.powers || [], gain = pb.filter((p) => !pa.includes(p)), lose = pa.filter((p) => !pb.includes(p));
    const pw = gain.length || lose.length ? `<div class="cmp-row wide"><span>Powers</span><p>${gain.map((p) => `<b class="up">+${cap(p)}</b>`).join(' ')} ${lose.map((p) => `<b class="down">−${cap(p)}</b>`).join(' ')}</p></div>` : '';
    const ea = cur.element || 'none', eb = it.element || 'none';
    const el = ea !== eb ? `<div class="cmp-row wide"><span>Element</span><p>${cap(ea)} → ${cap(eb)}</p></div>` : '';
    return `<div class="cmp"><div class="cmp-head"><img src="${DF.bigPicture('item', cur, 3)}" alt=""><span>vs your <b style="color:${DF.RAR_COLOR[cur.rarity]}">${esc(cur.name)}</b></span><b class="cmp-v ${v}">${VERDICT[v]}</b></div>${rows}${pw}${el}</div>`;
  }
  const tileArrow = (it) => { const v = G.run ? verdict(it) : null; return v === 'up' ? '<em class="tile-v up">▲</em>' : v === 'down' ? '<em class="tile-v down">▼</em>' : ''; };
  function weaponFeelText(icon) { return { wand: 'Light, quick swings.', bow: 'Swung like a club. Light.', wrench: 'Solid, steady swings.', sword: 'Balanced swings.', axe: 'Wide swings.', hammer: 'Slow, heavy swings.', spear: 'Long reach, narrow thrust.', dagger: 'Very quick stabs.', mace: 'Heavy swings.' }[icon] || ''; }
  function openItem(ref) {
    if (!G.run || G.mode !== 'play') return;
    const it = G.getRef(ref); if (!it) return;
    const eqd = ref.where === 'eq';
    const compare = eqd ? '' : compareBlock(it);
    const s = openSheet(`${itemBlock(it, true)}${compare}
      <div class="row">${eqd ? `<button class="btn" data-a="off">Take off</button>` : `<button class="btn primary" data-a="eq" data-focus>Equip</button>`}
      <button class="btn ghost" data-a="drop">Drop</button><button class="btn ghost" data-a="close">Close</button></div>`, 'item');
    // onclick (not addEventListener): the card window is reused, so each card must replace the last one's handler.
    s.onclick = (e) => {
      const t = e.target.closest('[data-a]'); if (!t) return;
      const a = t.dataset.a;
      if (a === 'eq') { G.equip(ref); closeSheet(); }
      if (a === 'off') { if (G.unequip(ref.slot)) closeSheet(); }
      if (a === 'drop') { G.dropRef(ref); closeSheet(); }
      if (a === 'close') closeSheet();
    };
  }

  /* ---------- Full bag: swap something for the item on the floor ---------- */
  DF.itemVerdict = (it) => verdict(it);
  function openSwap(p) {
    const it = p.item;
    const s = openSheet(`<h2 class="title">Bag full</h2><p class="sub">Pick something to leave here in exchange for this:</p>
      ${itemBlock(it, false)}${compareBlock(it)}
      <p class="sub cmp-hint">▲ better than what you wear · ▼ weaker</p>
      <div class="grid">${G.run.bag.map((b, i) => b ? `<button class="tile" data-i="${i}" style="--r:${DF.RAR_COLOR[b.rarity]}">${tileArrow(b)}<img src="${DF.bigPicture('item', b, 3)}" alt=""><span>${esc(b.name)}</span></button>` : '').join('')}</div>
      <div class="row"><button class="btn ghost" data-a="close" data-focus>Leave it</button></div>`);
    s.onclick = (e) => {
      const t = e.target.closest('[data-i],[data-a]'); if (!t) return;
      if (t.dataset.a === 'close') { closeSheet(); return; }
      G.swapPickup(p, +t.dataset.i); closeSheet();
    };
  }

  /* ---------- The hero panel: your hero, what you wear, your stats, moves, scroll and bag ---------- */
  // Tiny pixel icons for the stat rows (7 x 7, "x" is filled).
  const STAT_PIX = {
    health: ['.xx.xx.', 'xxxxxxx', 'xxxxxxx', 'xxxxxxx', '.xxxxx.', '..xxx..', '...x...'],
    attack: ['......x', '.....xx', '....xx.', 'x..xx..', '.xxx...', '.xx....', 'x.x....'],
    defence: ['xxxxxxx', 'x.....x', 'x.....x', 'x.....x', '.x...x.', '..x.x..', '...x...'],
    speed: ['...xx..', '..xx...', '.xx....', 'xxxxxxx', '....xx.', '...xx..', '..xx...'],
    luck: ['.x...x.', 'xxx.xxx', '.xxxxx.', '..xxx..', '.xxxxx.', 'xxx.xxx', '.x...x.'],
    mana: ['...x...', '..xxx..', '.xxxxx.', 'xxxxxxx', '.xxxxx.', '..xxx..', '...x...'],
  };
  const pixIcon = (rows, color) => `<svg class="stat-ic" viewBox="0 0 7 7" aria-hidden="true">${rows.map((r, y) => [...r].map((c, x) => c === 'x' ? `<rect x="${x}" y="${y}" width="1" height="1"/>` : '').join('')).join('')}</svg>`.replace('<svg', `<svg style="fill:${color}"`);
  const WEAPON_WORD = { knight: 'Weapon', mage: 'Focus', ranger: 'Bow', tinkerer: 'Tool' };
  const WEAPON_HINT = { knight: 'Your sword arc', mage: 'Powers your bolts', ranger: 'Powers your arrows', tinkerer: 'Your wrench swing' };
  const MOVE_CD = { knight: [0, 2.2, 0], mage: [0, 1.6, 0], ranger: [0, 1.1, 4], tinkerer: [0, 6, 3.5] };
  let invSel = null, invDragOff = null;
  function openInventory() {
    if (!G.run || G.mode !== 'play' || !$('#modal').hidden) return;
    invSel = invSel && G.getRef(invSel.ref || {}) ? invSel : { ref: { where: 'eq', slot: 'weapon' } };
    const s = openSheet('', 'wide inv');
    const draw = () => { s.innerHTML = invHTML(); };
    const refOf = (v) => (v.startsWith('eq:') ? { where: 'eq', slot: v.slice(3) } : v.startsWith('bag:') ? { where: 'bag', i: +v.slice(4) } : null);
    // Drag an item onto another slot to move it there (they swap places). A tap without moving still selects.
    let drag = null, justDragged = false;
    s.onpointerdown = (e) => {
      const t = e.target.closest('.inv-slot.filled[data-sel]'); if (!t || e.button > 0) return;
      const ref = refOf(t.dataset.sel); if (!ref) return;
      drag = { ref, el: t, x: e.clientX, y: e.clientY, ghost: null, id: e.pointerId };
    };
    s.ondragstart = (e) => e.preventDefault(); // no built-in image dragging: we do our own
    const onMove = (e) => {
      if (!drag || e.pointerId !== drag.id) return;
      if (!drag.ghost) {
        if (Math.hypot(e.clientX - drag.x, e.clientY - drag.y) < 6) return;
        const img = drag.el.querySelector('img'); if (!img) { drag = null; return; }
        drag.ghost = img.cloneNode(); drag.ghost.className = 'drag-ghost pix'; document.body.appendChild(drag.ghost);
        drag.el.classList.add('dragging'); s.classList.add('is-dragging');
      }
      e.preventDefault();
      drag.ghost.style.left = e.clientX + 'px'; drag.ghost.style.top = e.clientY + 'px';
      const over = document.elementFromPoint(e.clientX, e.clientY), slot = over && over.closest('.inv-slot[data-sel]');
      s.querySelectorAll('.drop-hover').forEach((x) => x.classList.remove('drop-hover'));
      if (slot && refOf(slot.dataset.sel) && slot !== drag.el) slot.classList.add('drop-hover');
    };
    const onUp = (e) => {
      if (!drag || e.pointerId !== drag.id) return;
      const d = drag; drag = null;
      if (!d.ghost) return; // just a tap: the click handler selects it
      d.ghost.remove(); s.classList.remove('is-dragging'); justDragged = true; setTimeout(() => { justDragged = false; }, 50);
      try {
        const over = document.elementFromPoint(e.clientX, e.clientY), slot = over && over.closest('.inv-slot[data-sel]');
        const to = slot && refOf(slot.dataset.sel);
        if (to && typeof G.moveItem !== 'function') toast('Update js/game.js to drag items around.');
        else if (to) { const why = G.moveItem(d.ref, to); if (why && why !== 'same') toast(why); else if (!why) invSel = { ref: to }; }
      } finally { draw(); } // always redraw, so nothing is left faded mid-drag
    };
    if (invDragOff) invDragOff();
    window.addEventListener('pointermove', onMove, { passive: false });
    window.addEventListener('pointerup', onUp); window.addEventListener('pointercancel', onUp);
    invDragOff = () => { window.removeEventListener('pointermove', onMove); window.removeEventListener('pointerup', onUp); window.removeEventListener('pointercancel', onUp); invDragOff = null; };
    s.onclick = (e) => {
      if (justDragged) return;
      const t = e.target.closest('[data-sel],[data-a]'); if (!t) return;
      if (t.dataset.sel) { const v = t.dataset.sel; invSel = v === 'scroll' || v === 'potion' ? { kind: v } : v.startsWith('eq:') ? { ref: { where: 'eq', slot: v.slice(3) } } : { ref: { where: 'bag', i: +v.slice(4) } }; draw(); return; }
      const a = t.dataset.a, ref = invSel && invSel.ref;
      if (a === 'close') { closeSheet(); return; }
      if (a === 'eq' && ref) { const it = G.getRef(ref); G.equip(ref); const s = Object.keys(G.run.eq).find((k) => G.run.eq[k] === it); invSel = s ? { ref: { where: 'eq', slot: s } } : invSel; }
      if (a === 'off' && ref) { const it = G.getRef(ref); if (G.unequip(ref.slot)) { const i = G.run.bag.indexOf(it); invSel = { ref: { where: 'bag', i } }; } }
      if (a === 'drop' && ref) { if (!t.dataset.armed) { t.dataset.armed = '1'; t.textContent = 'Tap again to drop'; return; } G.dropRef(ref); invSel = { ref: { where: 'eq', slot: 'weapon' } }; }
      if (a === 'drink') { G.usePotion(); }
      draw();
    };
    draw();
  }
  function toggleInventory() {
    if (!$('#modal').hidden) { if ($('#sheet').classList.contains('inv')) closeSheet(); return; }
    openInventory();
  }
  function invHTML() {
    const run = G.run, P = G.P, st = G.stats(), m = G.meta, u = m.up, cls = run.cls, c = DF.CLASSES[cls];
    const base = { health: c.hp + u.vit * 6, attack: c.atk + u.str, defence: u.tough, speed: c.spd, luck: 5 + u.fort * 4 };
    const sel = invSel || {}, selItem = sel.ref ? G.getRef(sel.ref) : null;
    const isSel = (k) => (k === 'scroll' || k === 'potion' ? sel.kind === k : sel.ref && (k.startsWith('eq:') ? sel.ref.where === 'eq' && sel.ref.slot === k.slice(3) : sel.ref.where === 'bag' && sel.ref.i === +k.slice(4)));
    const slotBtn = (key, it, label, extra) => `<button class="inv-slot ${it ? 'filled' : ''} ${isSel(key) ? 'on' : ''} ${extra || ''}" data-sel="${key}" style="--r:${it ? DF.RAR_COLOR[it.rarity] : 'var(--iron)'}" aria-label="${esc(it ? it.name : label)}">
      ${it ? `<img class="pix" src="${DF.bigPicture('item', it, 4)}" alt="">` : `<span>${label}</span>`}</button>`;
    // The scroll slot: a spellbook for the Mage, a scroll with charges for everyone else.
    const sp = run.spell2, def = sp && DF.SPELLS[sp.id], spc = def ? DF.EL_COLOR[def.el] : '';
    const scrollSlot = `<button class="inv-slot scroll ${def ? 'filled' : ''} ${isSel('scroll') ? 'on' : ''}" data-sel="scroll" style="--r:${spc || 'var(--iron)'}" aria-label="${def ? esc(def.name) : 'No scroll'}">
      ${def ? `<img class="pix" src="${DF.bigPicture('item', { icon: 'scroll', colors: ['#e8d8a8', spc], element: 'none' }, 4)}" alt="">${cls === 'mage' ? '' : `<b>${sp.charges}</b>`}` : '<span>Scroll</span>'}</button>`;
    const potionSlot = `<button class="inv-slot potion ${run.potions ? 'filled' : ''} ${isSel('potion') ? 'on' : ''}" data-sel="potion" style="--r:#ff4a6a" aria-label="Potions">
      <img class="pix" src="${DF.bigPicture('item', { icon: 'potion', colors: ['#ff4a6a', '#cfc8dc'], element: 'none' }, 4)}" alt=""${run.potions ? '' : ' style="opacity:.35"'}><b>${run.potions}</b></button>`;
    const wire = (side) => `<i class="wire ${side}"></i>`;
    const wear = (s, side) => `<div class="doll-slot">${side === 'l' ? wire('l') : ''}${slotBtn('eq:' + s, run.eq[s], slotName(s))}${side === 'r' ? wire('r') : ''}<small>${slotName(s)}</small></div>`;
    const doll = `<div class="doll doll8">
        <div class="doll-col">${wear('weapon', 'r')}${wear('offhand', 'r')}${wear('trinket1', 'r')}${wear('trinket2', 'r')}</div>
        <div class="doll-hero"><img class="pix" src="${DF.bigPicture('hero', { cls }, 9)}" alt="${esc(c.name)}"></div>
        <div class="doll-col">${wear('head', 'l')}${wear('body', 'l')}${wear('hands', 'l')}${wear('feet', 'l')}</div>
      </div>`;
    const statRow = (k, label, total, b, color, unit) => {
      const gear = total - b;
      return `<li>${pixIcon(STAT_PIX[k], color)}<span>${label}</span><b>${total}${unit || ''}</b>${gear ? `<em class="${gear > 0 ? 'up' : 'down'}">${gear > 0 ? '+' : ''}${gear}</em>` : '<em></em>'}</li>`;
    };
    const stats = `<ul class="inv-stats">
      ${statRow('health', 'Health', st.maxHp, base.health, '#ff4a6a')}
      ${statRow('attack', 'Attack', st.attack, base.attack, '#ff8a3d')}
      ${statRow('defence', 'Defence', st.defence, base.defence, '#9ad8ff')}
      ${statRow('speed', 'Speed', st.speed, Math.min(70, base.speed), '#72e07e')}
      ${statRow('luck', 'Luck', st.luck, base.luck, '#e9c46a', '%')}
      ${st.maxMana ? statRow('mana', 'Mana', st.maxMana, st.maxMana, '#6a9cff') : ''}
      </ul>
      <div class="inv-bars"><div class="bar hp"><i style="width:${Math.round(100 * Math.max(0, P.hp) / st.maxHp)}%"></i><span>${Math.ceil(P.hp)} / ${st.maxHp} health</span></div>
      ${st.maxMana ? `<div class="bar mp"><i style="width:${Math.round(100 * (P.mana || 0) / st.maxMana)}%"></i><span>${Math.floor(P.mana || 0)} / ${st.maxMana} mana</span></div>` : ''}</div>
      <p class="inv-note">${Math.round(st.luckF * 60)}% chance to land a critical hit. Green numbers come from your gear.</p>`;
    // Moves, with how soon each one is ready. Keys are J, K, L.
    const cds = MOVE_CD[cls] || [0, 0, 0], now = [0, P.bashCd || 0, cls === 'mage' ? 0 : (P.novaCd || 0)];
    const moves = c.moves.map((mv, i) => {
      const [name, ...rest] = mv.split(':'), wait = now[i];
      let state = 'Ready';
      if (cls === 'mage' && i === 2) state = (P.mana || 0) >= 25 ? 'Ready' : 'Needs 25 mana';
      else if (wait > 0.05) state = `Ready in ${Math.ceil(wait)}s`;
      void cds;
      return `<li><kbd>${'JKL'[i]}</kbd><div><b>${esc(name)}</b><small>${esc(cap(rest.join(':').trim()))}</small></div><span class="${state === 'Ready' ? 'ok' : ''}">${state}</span></li>`;
    });
    if (def) moves.push(`<li style="--c:${spc}"><kbd>${c.moves.length > 2 ? 'I' : 'L'}</kbd><div><b style="color:${spc}">${esc(def.name)}</b><small>${esc(def.text)}</small></div><span class="${(P.spellCd || 0) <= 0.05 ? 'ok' : ''}">${cls === 'mage' ? `${def.cost} mana` : `${sp.charges} left`}</span></li>`);
    const extra = cls === 'tinkerer' ? `<p class="inv-note">Turrets built right now: ${(P.turrets || []).length} of 2.</p>` : '';
    const n = run.bag.filter(Boolean).length;
    const bag = run.bag.map((it, i) => slotBtn('bag:' + i, it, '')).join('');
    // What you tapped, in detail.
    let detail = '';
    if (selItem) {
      const eqd = sel.ref.where === 'eq';
      const compare = eqd ? '' : compareBlock(selItem);
      detail = `${itemBlock(selItem, false)}${compare}<div class="row">${eqd ? '<button class="btn small" data-a="off">Take off</button>' : '<button class="btn small primary" data-a="eq">Equip</button>'}<button class="btn small ghost" data-a="drop">Drop</button></div>`;
    } else if (sel.ref) {
      detail = `<p class="inv-empty">Nothing in this slot. ${sel.ref.where === 'eq' ? `Equip ${/^[aeiou]/i.test(slotName(sel.ref.slot)) ? 'an' : 'a'} ${slotName(sel.ref.slot).toLowerCase()} item from your bag to fill it.` : 'Room for one more find.'}</p>`;
    } else if (sel.kind === 'scroll') {
      detail = def ? spellBlock(sp.id, cls === 'mage' ? 'In your spellbook' : `Scroll \u00b7 ${sp.charges} charge${sp.charges === 1 ? '' : 's'} left`, cls !== 'mage')
        : `<p class="inv-empty">${cls === 'mage' ? 'Your spellbook has room for one more spell. Find a scroll in a chest or buy one from a merchant, and you\u2019ll learn it for good.' : 'No scroll. Find one in a chest or buy one from a merchant; you can read it aloud a few times.'}</p>`;
    } else if (sel.kind === 'potion') {
      detail = `<div class="item-head"><img class="pix" src="${DF.bigPicture('item', { icon: 'potion', colors: ['#ff4a6a', '#cfc8dc'], element: 'none' }, 6)}" alt="" style="--r:#ff4a6a"><div><h2 style="color:#ff6a8a">Healing potion</h2><p class="sub">You have ${run.potions}</p></div></div>
        <p class="desc">Heals nearly half your health and cures poison.</p><div class="row"><button class="btn small primary" data-a="drink" ${run.potions && P.hp < st.maxHp ? '' : 'disabled'}>Drink one</button></div>`;
    }
    return `<div class="inv-top"><img class="pix" src="${DF.bigPicture('hero', { cls }, 3)}" alt="">
        <div><h2>${esc(c.name)}</h2><small>Floor ${run.floorN} \u00b7 ${esc(run.content.theme.name)}</small></div>
        <button class="icon-btn" data-a="close" aria-label="Close"><svg viewBox="0 0 12 12" aria-hidden="true"><path d="M2 3l1-1 3 3 3-3 1 1-3 3 3 3-1 1-3-3-3 3-1-1 3-3z"/></svg></button></div>
      <div class="inv-grid">
        <section class="inv-panel"><h3>Equipment</h3>${doll}</section>
        <section class="inv-panel"><h3>Stats</h3>${stats}</section>
      </div>
      <section class="inv-panel"><h3>Moves</h3><ul class="inv-moves">${moves.join('')}</ul>${extra}</section>
      <section class="inv-panel"><h3>Bag <span class="${n >= run.bag.length ? 'full' : ''}">${n}/${run.bag.length}</span></h3><div class="inv-bag" style="--cols:${({ 8: 8, 12: 6, 16: 8, 20: 10 })[run.bag.length] || 10};--cols-s:${({ 8: 4, 12: 6, 16: 4, 20: 5 })[run.bag.length] || 5}">${bag}</div><div class="inv-supplies"><span>Supplies</span>${potionSlot}${scrollSlot}<small class="drag-hint">Drag items to move or swap them.</small></div></section>
      <section class="inv-panel inv-detail">${detail}</section>
      <div class="inv-foot"><span><i class="coin"></i> ${m.gold} gold</span><span>${run.kills} defeated</span><span>${run.forged} forged</span><span class="keyhint"><kbd>Tab</kbd> close</span></div>`;
  }

  /* ---------- Spell scrolls and the merchant ---------- */
  function spellBlock(id, label, noHow) {
    const d = DF.SPELLS[id], c = DF.EL_COLOR[d.el], mage = G.run && G.run.cls === 'mage';
    const how = mage ? `${d.cost} mana` : `${DF.SCROLL_CHARGES} charges`;
    if (noHow) label = label + ' \u00b7 ' + d.el;
    return `<div class="item-head"><img class="pix big" src="${DF.bigPicture('item', { icon: 'scroll', colors: ['#e8d8a8', c], element: 'none' }, 8)}" alt="" style="--r:${c}">
      <div><h2 style="color:${c}">${esc(d.name)}</h2><p class="sub">${esc(label || 'Spell scroll')} ${noHow ? '' : ` \u00b7 ${d.el} \u00b7 ${how}`}</p></div></div>
      <p class="desc">${esc(d.text)}</p>
      <p class="from">${mage ? 'You learn it for good, and cast it with mana.' : 'You can read it aloud a few times before it crumbles.'}</p>`;
  }
  function openScroll(p) {
    const now = G.run.spell2, a = DF.SPELLS[now.id], b = DF.SPELLS[p.spell];
    const mage = G.run.cls === 'mage';
    const card = (d, id, tag, extra) => `<div style="--c:${DF.EL_COLOR[d.el]}"><small>${tag}</small><b>${esc(d.name)}</b>${extra ? ` <small>${extra}</small>` : ''}<p>${esc(d.text)}</p></div>`;
    const s = openSheet(`<h2 class="title">Spell scroll</h2><p class="sub">You can carry one scroll spell. Learning this one leaves your old one here on the floor.</p>
      <div class="spell-pair">${card(a, now.id, 'You know', mage ? '' : `${now.charges} left`)}${card(b, p.spell, 'On the floor', mage ? '' : `${p.charges || DF.SCROLL_CHARGES} charges`)}</div>
      <div class="row"><button class="btn primary" data-a="learn" data-focus>Learn ${esc(b.short)}</button><button class="btn ghost" data-a="close">Keep ${esc(a.short)}</button></div>`);
    s.onclick = (e) => {
      const t = e.target.closest('[data-a]'); if (!t) return;
      if (t.dataset.a === 'learn') G.learnScroll(p);
      closeSheet();
    };
  }
  /* ---------- The merchant: buy from his stalls, sell from your bag ---------- */
  function openTrade(shop, tab, pick) {
    tab = tab || 'buy';
    const run = G.run, gold = G.meta.gold;
    const tabs = `<div class="trade-tabs"><button class="${tab === 'buy' ? 'on' : ''}" data-tab="buy">Buy</button><button class="${tab === 'sell' ? 'on' : ''}" data-tab="sell">Sell</button></div>`;
    let body = '';
    if (tab === 'buy') {
      const rows = shop.stalls.map((st, i) => {
        const pic = st.kind === 'item' ? DF.bigPicture('item', st.item, 3) : st.kind === 'potion' ? DF.bigPicture('item', { icon: 'potion', colors: ['#ff4a6a', '#cfc8dc'], element: 'none' }, 3) : DF.bigPicture('item', { icon: 'scroll', colors: ['#e8d8a8', DF.EL_COLOR[DF.SPELLS[st.spell].el]], element: 'none' }, 3);
        const name = st.kind === 'item' ? st.item.name : st.kind === 'potion' ? 'Healing potion' : DF.SPELLS[st.spell].name + ' scroll';
        const col = st.kind === 'item' ? DF.RAR_COLOR[st.item.rarity] : st.kind === 'potion' ? '#ff6a8a' : DF.EL_COLOR[DF.SPELLS[st.spell].el];
        const desc = st.kind === 'item' ? [statLines(st.item).join(' \u00b7 '), st.item.description].filter(Boolean).join(' \u2014 ') : st.kind === 'potion' ? 'Heals nearly half your health and cures poison.' : DF.SPELLS[st.spell].text;
        return `<button class="trade-row ${st.sold ? 'sold' : ''}" data-buy="${i}" ${st.sold ? 'disabled' : ''}><img src="${pic}" alt=""><span><strong style="color:${col}">${esc(name)}${st.kind === 'item' ? tileArrow(st.item) : ''}</strong><small>${esc(desc)}</small></span><b class="${gold >= st.price ? '' : 'short'}">${st.sold ? 'Sold' : st.price + 'g'}</b></button>`;
      }).join('');
      body = `<div class="trade-list">${rows}</div>`;
    } else if (pick != null && run.bag[pick]) {
      const it = run.bag[pick], g = G.sellPrice(it);
      body = `${itemBlock(it, false)}${compareBlock(it)}<div class="shop-price"><span>He offers <b>${g} gold</b></span><small>You have ${gold}</small></div>
        <div class="row"><button class="btn primary" data-a="sell" data-i="${pick}">Sell for ${g}g</button><button class="btn ghost" data-tab="sell">Back</button></div>`;
    } else {
      const items = run.bag.map((b, i) => b ? `<button class="tile" data-pick="${i}" style="--r:${DF.RAR_COLOR[b.rarity]}">${tileArrow(b)}<img src="${DF.bigPicture('item', b, 3)}" alt=""><span>${esc(b.name)}</span><em class="tile-price">${G.sellPrice(b)}g</em></button>` : '').join('');
      body = items ? `<p class="sub cmp-hint">Tap something in your bag to see his offer. ▼ weaker than what you wear</p><div class="grid">${items}</div>`
        : `<p class="inv-empty">Your bag is empty. He only buys what you carry in your bag, not what you're wearing.</p>`;
    }
    const s = openSheet(`<h2 class="title">The merchant</h2><p class="sub">${tab === 'buy' ? '“Have a look. Everything is for sale.”' : '“Let’s see what you dragged up from the deep.”'} <span class="trade-gold">${gold} gold</span></p>
      ${tabs}${body}${tab === 'sell' && pick != null && run.bag[pick] ? '' : '<div class="row"><button class="btn ghost" data-a="close" data-focus>Done</button></div>'}`);
    s.onclick = (e) => {
      const t = e.target.closest('[data-tab],[data-buy],[data-pick],[data-a]'); if (!t) return;
      if (t.dataset.tab) { openTrade(shop, t.dataset.tab); return; }
      if (t.dataset.buy != null) { openStall(shop.stalls[+t.dataset.buy], shop); return; }
      if (t.dataset.pick != null) { openTrade(shop, 'sell', +t.dataset.pick); return; }
      if (t.dataset.a === 'sell') { const it = run.bag[+t.dataset.i], g = G.sellItem(+t.dataset.i); if (g) toast(`Sold <b style="color:${DF.RAR_COLOR[it.rarity]}">${esc(it.name)}</b> for <b style="color:#ffcf4a">${g} gold</b>.`, 2400, true); openTrade(shop, 'sell'); return; }
      if (t.dataset.a === 'close') closeSheet();
    };
  }
  function openStall(st, shop) {
    const gold = G.meta.gold, short = Math.max(0, st.price - gold);
    let body;
    if (st.kind === 'item') body = itemBlock(st.item, true) + compareBlock(st.item);
    else if (st.kind === 'potion') body = `<div class="item-head"><img class="pix big" src="${DF.bigPicture('item', { icon: 'potion', colors: ['#ff4a6a', '#cfc8dc'], element: 'none' }, 8)}" alt="" style="--r:#ff4a6a">
      <div><h2 style="color:#ff6a8a">Healing potion</h2><p class="sub">Potion</p></div></div><p class="desc">Heals nearly half your health and cures poison. Drink it with the potion button or <kbd>Q</kbd>.</p>`;
    else body = spellBlock(st.spell, 'Spell scroll for sale');
    const s = openSheet(`<p class="sub">The merchant holds it up to the lantern.</p>${body}
      <div class="shop-price"><span>Price <b>${st.price} gold</b></span><small>You have ${gold}</small></div>
      <div class="row"><button class="btn primary" data-a="buy" data-focus ${short ? 'aria-disabled="true"' : ''}>${short ? `Need ${short} more` : 'Buy'}</button><button class="btn ghost" data-a="close">${shop ? 'Back' : 'Not now'}</button></div>`, 'item');
    s.onclick = (e) => {
      const t = e.target.closest('[data-a]'); if (!t) return;
      if (t.dataset.a === 'close') { if (shop) openTrade(shop, 'buy'); else closeSheet(); return; }
      const why = G.buyStall(st);
      if (why) { toast(why); return; }
      if (shop) openTrade(shop, 'buy'); else closeSheet();
      toast(st.kind === 'item' ? `Bought <b style="color:${DF.RAR_COLOR[st.item.rarity]}">${esc(st.item.name)}</b>.` : st.kind === 'potion' ? 'Bought a potion.' : 'Bought a scroll. Pick it up to learn it.', 2400, true);
    };
  }

  /* ---------- The forge ---------- */
  function openForge(altar) {
    const pickd = [];
    const s = openSheet('', 'forge');
    function draw() {
      const all = G.allItems();
      const a = pickd[0] && G.getRef(pickd[0]), b = pickd[1] && G.getRef(pickd[1]);
      let hint = 'Pick two things to melt together.';
      if (a && b) {
        const rar = Math.min(4, Math.max(a.rarity, b.rarity) + (a.rarity === b.rarity ? 1 : 0));
        const types = a.type === b.type ? a.type : `${a.type} or ${b.type}`;
        hint = `Makes a new ${types}, at least <b style="color:${DF.RAR_COLOR[rar]}">${DF.RARITY[rar]}</b>, and always stronger than what goes in.`;
      } else if (a) hint = 'Now pick a second one.';
      const slot = (it) => it ? `<img src="${DF.bigPicture('item', it, 5)}" alt=""><small style="color:${DF.RAR_COLOR[it.rarity]}">${esc(it.name)}</small>` : '<span class="plus">?</span>';
      s.innerHTML = `<h2 class="title">Forge altar</h2><p class="sub">Two things go in, one new thing comes out. ${altar.uses} use${altar.uses === 1 ? '' : 's'} left here.</p>
        <div class="forge-row"><div class="fslot">${slot(a)}</div><span class="op">+</span><div class="fslot">${slot(b)}</div></div>
        <p class="hint">${hint}</p>
        <div class="grid">${all.map(({ ref, item }) => {
          const on = pickd.some((r) => r.where === ref.where && r.slot === ref.slot && r.i === ref.i);
          return `<button class="tile ${on ? 'on' : ''}" data-ref='${JSON.stringify(ref)}' style="--r:${DF.RAR_COLOR[item.rarity]}"><img src="${DF.bigPicture('item', item, 3)}" alt=""><span>${esc(item.name)}</span>${ref.where === 'eq' ? '<em>worn</em>' : ''}</button>`;
        }).join('')}</div>
        ${all.length < 2 ? '<p class="hint">You need at least two items. Find more in chests and from elite monsters.</p>' : ''}
        <div class="row"><button class="btn primary" data-a="forge" ${a && b ? '' : 'disabled'}>Forge</button><button class="btn ghost" data-a="close">Not now</button></div>`;
    }
    draw();
    s.onclick = async (e) => {
      const t = e.target.closest('[data-ref],[data-a]'); if (!t) return;
      if (t.dataset.ref) {
        const ref = JSON.parse(t.dataset.ref);
        const k = pickd.findIndex((r) => r.where === ref.where && r.slot === ref.slot && r.i === ref.i);
        if (k >= 0) pickd.splice(k, 1); else if (pickd.length < 2) pickd.push(ref); else pickd[1] = ref;
        SND.clink(0.5); draw(); return;
      }
      if (t.dataset.a === 'close') { closeSheet(); return; }
      if (t.dataset.a === 'forge' && pickd.length === 2) {
        s.onclick = null; s.classList.add('sticky');
        const names = pickd.map((r) => G.getRef(r).name);
        s.innerHTML = `<div class="anvil-wrap"><canvas id="anvil" width="64" height="40"></canvas></div><p class="forging">${AI.ready() ? 'The Deep is shaping something new from' : 'Hammering together'} <b>${esc(names[0])}</b> and <b>${esc(names[1])}</b>…</p>`;
        const stop = anvilAnim($('#anvil'));
        const t0 = performance.now();
        const res = await G.forge(pickd[0], pickd[1], altar);
        const wait = 1600 - (performance.now() - t0); if (wait > 0) await new Promise((r) => setTimeout(r, wait));
        stop(); SND.forged();
        if (!res) { closeSheet(); return; }
        s.classList.remove('sticky');
        s.innerHTML = `<div class="reveal" style="--r:${DF.RAR_COLOR[res.item.rarity]}">${itemBlock(res.item, true)}</div>
          ${!res.ai && AI.ready() ? '<p class="note">The Deep didn’t answer in time, so the forge improvised.</p>' : ''}
          <div class="row"><button class="btn primary" data-a="ok" data-focus>Take it</button></div>`;
        s.querySelector('[data-a="ok"]').onclick = closeSheet;
      }
    };
  }
  function anvilAnim(cv) {
    const g = cv.getContext('2d'); let t = 0, raf = 0, hits = 0; const sparks = [];
    const step = () => {
      t += 1 / 60; g.clearRect(0, 0, 64, 40);
      const phase = (t % 0.5) / 0.5, up = phase < 0.75 ? phase / 0.75 : 1 - (phase - 0.75) / 0.25;
      if (phase > 0.97 && !step.hit) { step.hit = true; hits++; SND.anvil(hits); for (let i = 0; i < 12; i++) sparks.push({ x: 34, y: 20, vx: (Math.random() - 0.5) * 60, vy: -Math.random() * 50, l: 0.5 }); } else if (phase < 0.5) step.hit = false;
      // glow
      const gr = g.createRadialGradient(32, 22, 0, 32, 22, 26); gr.addColorStop(0, 'rgba(255,140,60,0.5)'); gr.addColorStop(1, 'rgba(255,140,60,0)'); g.fillStyle = gr; g.fillRect(0, 0, 64, 40);
      g.fillStyle = '#4a4458'; g.fillRect(24, 28, 16, 8); g.fillStyle = '#6e6880'; g.fillRect(27, 24, 10, 4);
      g.fillStyle = '#9a94ac'; g.fillRect(20, 20, 24, 4); g.fillRect(44, 21, 4, 2); g.fillStyle = '#cfc8dc'; g.fillRect(20, 20, 22, 1);
      g.fillStyle = '#ffb070'; g.fillRect(29, 18, 8, 2); g.fillStyle = '#fff3c0'; g.fillRect(31, 18, 3, 1);
      // hammer
      g.save(); g.translate(46, 12); g.rotate(-0.9 * up + 0.15);
      g.fillStyle = '#8a5a32'; g.fillRect(-14, -1, 14, 2); g.fillStyle = '#cfd6e6'; g.fillRect(-18, -4, 5, 8); g.restore();
      for (const s of sparks) { s.l -= 1 / 60; s.x += s.vx / 60; s.y += s.vy / 60; s.vy += 120 / 60; g.fillStyle = s.l > 0.25 ? '#fff3c0' : '#ff8a3a'; if (s.l > 0) g.fillRect(s.x | 0, s.y | 0, 1, 1); }
      while (sparks.length && sparks[0].l <= 0) sparks.shift();
      raf = requestAnimationFrame(step);
    };
    step();
    return () => cancelAnimationFrame(raf);
  }

  /* ---------- Stairs, pause, death ---------- */
  function confirmStairs() {
    const run = G.run, nx = run.next;
    let known;
    if (nx && nx.theme) {
      const ready = nx.monsters.filter(Boolean).length === 4 && nx.boss;
      known = `Next floor: <b>${esc(nx.theme.name)}</b>, freshly invented.${ready ? '' : ' A few of its monsters are still being dreamed up, so any that aren\u2019t ready are made up by the game.'}`;
    } else if (!AI.ready()) known = 'Next floor: made up by the game itself (the AI is off).';
    else if (nx && nx.failed) known = 'Next floor: made up by the game itself (the AI didn\u2019t answer this time).';
    else known = 'The AI is still dreaming up the next floor. If you go now, the game makes one up itself instead.';
    const s = openSheet(`<h2 class="title">Floor ${run.floorN + 1}</h2><p class="sub">${known} Going down restores a quarter of your health.</p>
      <div class="row"><button class="btn primary" data-a="go" data-focus>Descend</button><button class="btn ghost" data-a="stay">Not yet</button></div>`);
    s.onclick = (e) => { const a = e.target.dataset.a; if (a === 'go') { closeSheet(); G.descend(); } if (a === 'stay') closeSheet(); };
  }
  function pause(force) {
    if (G.mode !== 'play' || (!$('#modal').hidden && !force)) return;
    if (!$('#modal').hidden) return;
    const run = G.run, st = G.stats();
    const s = openSheet(`<h2 class="title">Paused</h2>
      <p class="sub">Floor ${run.floorN}: ${esc(run.content.theme.name)}. ${esc(DF.RULE_TEXT[run.content.theme.rule])}</p>
      <ul class="statgrid"><li><b>${st.attack}</b> attack</li><li><b>${st.defence}</b> defence</li><li><b>${st.speed}</b> speed</li><li><b>${st.luck}%</b> luck</li><li><b>${run.kills}</b> defeated</li><li><b>${run.forged}</b> forged</li></ul>
      <div class="col"><button class="btn primary" data-a="resume" data-focus>Resume</button>
      <button class="btn" data-a="inv">Hero and bag</button><button class="btn" data-a="mon">Monster Book</button><button class="btn" data-a="item">Item Book</button><button class="btn" data-a="stats">Stats</button><button class="btn" data-a="set">Settings</button>
      <button class="btn ghost" data-a="camp">Back to camp (keeps this run)</button><button class="btn danger" data-a="quit">Give up this run</button></div>`);
    s.onclick = (e) => {
      const t = e.target.closest('[data-a]'); if (!t) return;
      const a = t.dataset.a;
      if (a === 'resume') closeSheet();
      if (a === 'inv') { closeSheet(); openInventory(); }
      if (a === 'mon') openBook('mon', () => pause()); if (a === 'item') openBook('item', () => pause()); if (a === 'set') openSettings(() => pause()); if (a === 'stats') openStats(() => pause());
      if (a === 'camp') { closeSheet(); G.quitRun(); }
      if (a === 'reroll') {
        const why = G.rerollBlock(); if (why) { toast(why); return; }
        if (!t.dataset.armed) { t.dataset.armed = '1'; t.firstChild.textContent = `Tap again to spend ${G.rerollCost()} gold`; return; }
        closeSheet(); G.rerollFloor();
      }
      if (a === 'quit') {
        if (t.dataset.armed) { closeSheet(); G.abandonRun(); } else { t.dataset.armed = '1'; t.textContent = 'Tap again to give up'; }
      }
    };
  }
  function rerollButton() {
    const why = G.rerollBlock(), cost = G.rerollCost();
    return `<button class="btn ${why ? 'cant' : ''}" data-a="reroll">Reroll this floor (${cost} gold)<small>${esc(why || 'A brand-new floor in place of this one. Once per floor.')}</small></button>`;
  }
  function togglePause() { if ($('#modal').hidden) pause(); else if (!$('#sheet').classList.contains('sticky')) closeSheet(); }
  $('#btn-pause').addEventListener('click', () => pause());
  $('#btn-inv').addEventListener('click', () => openInventory());
  function showDeath(sum) {
    $('#modal').hidden = true; G.hold.clear();
    const s = openSheet(`<h2 class="title">You fell on floor ${sum.floorN}</h2><p class="sub">${sum.by ? `${esc(sum.by)} got you in ${esc(sum.theme)}.` : `${esc(sum.theme)} claimed you this time.`} Your gold and books are safe at camp.</p>
      <ul class="statgrid"><li><b>${sum.floorN}</b> floor reached</li><li><b>${sum.kills}</b> defeated</li><li><b>${sum.gold}</b> gold found</li><li><b>${sum.forged}</b> forged</li></ul>
      <div class="row"><button class="btn primary" data-a="camp" data-focus>Back to camp</button></div>`, 'sticky');
    s.onclick = (e) => { if (e.target.dataset.a === 'camp') { closeSheet(); showCamp(); } };
  }
  function waitForDream(ready, ms) {
    return new Promise((res) => {
      const s = openSheet(`<div class="anvil-wrap"><canvas id="anvil" width="64" height="40"></canvas></div><p class="forging">The Deep is dreaming up the first floor…</p>
        <div class="row"><button class="btn ghost" data-a="skip">Use an old map</button></div>`, 'sticky');
      const stop = anvilAnim($('#anvil'));
      const t0 = Date.now();
      const done = (v) => { clearInterval(iv); stop(); closeSheet(); res(v); };
      const iv = setInterval(() => { if (ready()) done(true); else if (Date.now() - t0 > ms) done(false); }, 150);
      s.querySelector('[data-a="skip"]').onclick = () => done(false);
    });
  }

  /* ---------- Choosing a hero ---------- */
  function pickHero(done) {
    const last = G.meta.lastCls || 'knight', u = G.meta.up;
    const card = (id) => {
      const c = DF.CLASSES[id];
      return `<button class="hero ${id === last ? 'on' : ''}" data-cls="${id}">
        <img class="pix" src="${DF.bigPicture('hero', { cls: id }, 6)}" alt="">
        <b>${c.name}</b><span class="hero-blurb">${esc(c.blurb)}</span>
        <span class="hero-stats"><i>${c.hp + u.vit * 6} health</i><i>${c.atk + u.str} attack</i><i>${c.spd} speed</i>${c.mana ? `<i>${c.mana} mana</i>` : ''}</span>
        <span class="hero-moves">${c.moves.map((m) => `<em>${esc(m)}</em>`).join('')}</span></button>`;
    };
    const s = openSheet(`<h2 class="title">Choose your hero</h2><p class="sub">Your gold, upgrades and books are shared by every hero.</p>
      <div class="heroes">${Object.keys(DF.CLASSES).map(card).join('')}</div>
      <div class="row"><button class="btn ghost" data-a="close">Not yet</button></div>`, 'wide');
    s.onclick = (e) => {
      const t = e.target.closest('[data-cls],[data-a]'); if (!t) return;
      if (t.dataset.a === 'close') { closeSheet(); return; }
      SND.wake(); closeSheet(); done(t.dataset.cls);
    };
  }

  /* ---------- Camp ---------- */
  let campRaf = 0;
  function showCamp() {
    G.mode = 'camp';
    SND.song({ seed: 'campfire', camp: true });
    $('#toasts').innerHTML = ''; toasts.length = 0; // in-game messages don't follow you to camp
    $('#camp').hidden = false; $('#app').classList.add('away');
    const m = G.meta;
    const up = G.UPGRADES.map((u) => {
      const l = m.up[u.id], max = l >= u.max, cost = u.cost(l);
      // Capped upgrades show their pips; the open-ended ones show a level.
      const lvl = Number.isFinite(u.max) ? `${'\u25c6'.repeat(l)}${'\u25c7'.repeat(u.max - l)}` : `Lv ${l}`;
      return `<li><div><b>${u.name}</b> <span class="lvl">${lvl}</span><small>${u.text}</small></div>
        <button class="btn small ${!max && m.gold >= cost ? 'primary' : 'cant'}" type="button" data-up="${u.id}" aria-label="${max ? u.name + ' maxed' : `Buy ${u.name} for ${cost} gold`}">${max ? 'Maxed' : `<i class="coin"></i>${cost}`}</button></li>`;
    }).join('');
    const r = m.run;
    $('#camp-body').innerHTML = `
      <div class="camp-actions">
        ${r ? `<button class="btn primary big" data-a="cont" data-focus>Continue on floor ${r.floorN}<small>${esc(r.content.theme.name)}</small></button>` : ''}
        ${r ? `<div class="camp-pair">${(() => {
          // Short reason on the button; tapping it gives the full explanation.
          const why = G.savedRerollBlock();
          const cost = 30 * r.floorN;
          const short = !why ? `${cost} gold for a new floor` : /already rerolled/.test(why) ? 'Already rerolled' : /more gold/.test(why) ? `Costs ${cost} gold` : 'Floor already started';
          return `<button class="btn ${why ? 'cant' : ''}" data-a="reroll">Reroll floor<small>${esc(short)}</small></button>`;
        })()}
        <button class="btn" data-a="new">Start a new run<small>Ends your saved run</small></button></div>`
        : `<button class="btn primary big" data-a="new" data-focus>Descend<small>Floor 1 awaits</small></button>`}
      </div>
      <section class="camp-shop"><h3>Camp upgrades <span class="gold-pill"><i class="coin"></i>${m.gold}</span></h3><ul class="ups">${up}</ul></section>
      <div class="camp-links"><button class="btn" data-a="mon">Monster Book <small>${Object.keys(m.books.mon).length}</small></button>
        <button class="btn" data-a="item">Item Book <small>${Object.keys(m.books.item).length}</small></button>
        <button class="btn" data-a="stats">Stats</button><button class="btn" data-a="set">Settings</button></div>
      <p class="camp-stats">${m.stats.runs ? `Deepest floor ${m.stats.deepest}. ${m.stats.runs} run${m.stats.runs === 1 ? '' : 's'}, ${m.stats.kills} monsters defeated, ${m.stats.forged} thing${m.stats.forged === 1 ? '' : 's'} forged.` : 'Every monster, treasure and floor below is invented the moment you find it.'}</p>`;
    const f = $('#camp-body').querySelector('[data-focus]'); if (f) setTimeout(() => f.focus({ preventScroll: true }), 50);
    cancelAnimationFrame(campRaf); campScene();
  }
  $('#camp').addEventListener('click', (e) => {
    const t = e.target.closest('[data-a],[data-up]'); if (!t) return;
    SND.wake();
    if (t.dataset.up) {
      const why = G.buyUpgrade(t.dataset.up);
      const y = $('#camp').scrollTop; showCamp(); $('#camp').scrollTop = y;
      if (why) toast(why);
      else { const b = $(`[data-up="${t.dataset.up}"]`); if (b) { const li = b.closest('li'); li.classList.add('bought'); } }
      return;
    }
    const a = t.dataset.a;
    if (a === 'reroll') {
      const why = G.savedRerollBlock(); if (why) { toast(why); return; }
      if (!t.dataset.armed) { t.dataset.armed = '1'; t.firstChild.textContent = 'Tap again'; t.querySelector('small').textContent = `to spend ${30 * G.meta.run.floorN} gold`; return; }
      $('#camp').hidden = true; $('#app').classList.remove('away'); cancelAnimationFrame(campRaf);
      G.resize(); G.rerollSaved().then(() => renderSlots());
      return;
    }
    if (a === 'cont' || a === 'new') {
      if (a === 'new' && G.meta.run) { if (!t.dataset.armed) { t.dataset.armed = '1'; t.firstChild.textContent = 'Tap again to start over'; return; } G.meta.run = null; G.saveMeta(true); }
      const go = (cls) => { $('#camp').hidden = true; $('#app').classList.remove('away'); cancelAnimationFrame(campRaf); G.resize(); G.startRun(a === 'cont', cls).then(() => renderSlots()); };
      if (a === 'cont') go(); else pickHero(go);
    }
    if (a === 'mon') openBook('mon'); if (a === 'item') openBook('item'); if (a === 'set') openSettings(); if (a === 'stats') openStats();
  });
  function campScene() {
    const cv = $('#camp-scene'), g = cv.getContext('2d'); g.imageSmoothingEnabled = false;
    const W = cv.width, H = cv.height; let t = 0;
    const knight = DF.heroSprite(G.meta.lastCls || 'knight', 0, '');
    const stars = Array.from({ length: 26 }, () => [Math.random() * W, Math.random() * H * 0.45, Math.random()]);
    const embers = [];
    const step = () => {
      t += 1 / 60;
      g.fillStyle = '#0d0a12'; g.fillRect(0, 0, W, H);
      stars.forEach(([x, y, k]) => { g.fillStyle = `rgba(236,227,211,${0.25 + 0.25 * Math.sin(t * 2 + k * 9)})`; g.fillRect(x | 0, y | 0, 1, 1); });
      // the dungeon mouth
      g.fillStyle = '#2a2230'; g.fillRect(W - 46, H - 34, 34, 24); g.fillStyle = '#3a3040'; g.fillRect(W - 48, H - 36, 38, 3);
      g.fillStyle = '#050407'; g.fillRect(W - 38, H - 28, 18, 18); g.fillRect(W - 36, H - 30, 14, 2);
      for (let i = 0; i < 4; i++) { g.fillStyle = `rgba(80,60,90,${0.5 - i * 0.1})`; g.fillRect(W - 37 + i, H - 14 + i * 1, 16 - i * 2, 1); }
      // ground
      g.fillStyle = '#1e1824'; g.fillRect(0, H - 10, W, 10); g.fillStyle = '#2a2230'; g.fillRect(0, H - 10, W, 1);
      // fire glow
      const fx = 40, fy = H - 11, fl = 0.9 + Math.sin(t * 9) * 0.05 + Math.sin(t * 23) * 0.04;
      const gr = g.createRadialGradient(fx, fy - 3, 0, fx, fy - 3, 40 * fl); gr.addColorStop(0, 'rgba(255,140,60,0.35)'); gr.addColorStop(1, 'rgba(255,140,60,0)'); g.fillStyle = gr; g.fillRect(0, 0, W, H);
      g.fillStyle = '#5a3a22'; g.fillRect(fx - 5, fy, 10, 2); g.fillRect(fx - 3, fy - 1, 6, 1);
      const h = 5 + Math.round(Math.sin(t * 12) + 1);
      g.fillStyle = '#ff6a2a'; g.fillRect(fx - 2, fy - h, 5, h); g.fillStyle = '#ffb02a'; g.fillRect(fx - 1, fy - h + 2, 3, h - 2); g.fillStyle = '#fff3c0'; g.fillRect(fx, fy - h + 3, 1, h - 4);
      if (Math.random() < 0.2) embers.push({ x: fx + (Math.random() - 0.5) * 4, y: fy - h, vy: -10 - Math.random() * 10, l: 1.2 });
      embers.forEach((e) => { e.l -= 1 / 60; e.y += e.vy / 60; e.x += Math.sin(t * 3 + e.y) * 0.2; g.fillStyle = e.l > 0.5 ? '#ffb070' : '#ff6a2a'; if (e.l > 0) g.fillRect(e.x | 0, e.y | 0, 1, 1); });
      while (embers.length && embers[0].l <= 0) embers.shift();
      // the knight, and an anvil
      g.drawImage(knight.right, fx - 18, H - 10 - knight.h);
      g.fillStyle = '#ffd9a0'; g.globalAlpha = 0.25; g.fillRect(fx - 12, H - 10 - knight.h + 1, 1, knight.h - 2); g.globalAlpha = 1;
      g.fillStyle = '#4a4458'; g.fillRect(fx + 14, H - 14, 6, 4); g.fillStyle = '#9a94ac'; g.fillRect(fx + 12, H - 16, 10, 2); g.fillRect(fx + 22, H - 15, 2, 1);
      campRaf = requestAnimationFrame(step);
    };
    step();
  }

  /* ---------- Books ---------- */
  // A monster's signature ability (from the bestiary, even for ones the AI invented).
  function special(spec) {
    const prof = DF.bestiaryFor(spec.name), name = spec.special || (prof && prof.s[0]), text = spec.specialText || (prof && prof.s[1]);
    return name ? `<p class="special"><b>${esc(name)}</b> ${esc(text || '')}</p>` : '';
  }
  function abilitiesOf(spec) {
    const prof = DF.bestiaryFor(spec.name), list = (spec.abilities || []).slice();
    if (prof) prof.a.forEach((a) => { if (a !== 'mutates' && !list.includes(a)) list.push(a); });
    return list.filter((a) => a !== 'mutates');
  }
  function openBook(tab, back) {
    const m = G.meta;
    const tabs = `<div class="tabs"><button data-t="mon" class="${tab === 'mon' ? 'on' : ''}">Monsters</button><button data-t="item" class="${tab === 'item' ? 'on' : ''}">Items</button><button data-t="rec" class="${tab === 'rec' ? 'on' : ''}">Recipes</button></div>`;
    let body = '';
    if (tab === 'mon') {
      const list = Object.values(m.books.mon);
      body = list.length ? `<ul class="book">${list.slice().reverse().map(({ spec, kills }) => `
        <li><img class="pix" src="${DF.bigPicture('monster', spec, 5)}" alt=""><div><h3>${esc(spec.name)}${spec.boss ? ' <span class="tag boss">Boss</span>' : ''}</h3>
        <p>${esc(spec.description)}</p>${special(spec)}
        <p class="chips"><span class="chip" style="--c:${DF.EL_COLOR[spec.element]}">${spec.element}</span><span class="chip weak" style="--c:${DF.EL_COLOR[spec.weakness]}">weak to ${spec.weakness}</span>
        <span class="chip plain">${esc(DF.BEHAVIOUR_TEXT[spec.behaviour] || '')}</span>${abilitiesOf(spec).map((a) => `<span class="chip plain" title="${esc(DF.ABILITY_TEXT[a] || '')}">${esc(a)}</span>`).join('')}</p>
        <p class="kills">${kills ? `Defeated ${kills}` : 'Not defeated yet'}</p></div></li>`).join('')}</ul>` : '<p class="empty-book">Monsters you meet are written here.</p>';
    } else if (tab === 'item') {
      const list = Object.values(m.books.item);
      body = list.length ? `<ul class="book">${list.slice().reverse().map(({ spec, best, forged }) => `
        <li><img class="pix" src="${DF.bigPicture('item', spec, 5)}" alt=""><div><h3 style="color:${DF.RAR_COLOR[best]}">${esc(spec.name)}${forged ? ' <span class="tag">Forged</span>' : ''}</h3>
        <p>${esc(spec.description)}</p>
        <p class="chips"><span class="chip plain">${spec.type}</span>${spec.element !== 'none' ? `<span class="chip" style="--c:${DF.EL_COLOR[spec.element]}">${spec.element}</span>` : ''}${(spec.powers || []).map((p) => `<span class="chip plain">${p}</span>`).join('')}${spec.stat ? `<span class="chip plain">+${spec.stat}</span>` : ''}</p>
        <p class="kills">Best found: ${DF.RARITY[best]}</p></div></li>`).join('')}</ul>` : '<p class="empty-book">Treasure you find and forge is written here.</p>';
    } else {
      const list = m.books.recipes;
      body = list.length ? `<ul class="recipes">${list.map((r) => `<li><span>${esc(r.a)}</span><i>+</i><span>${esc(r.b)}</span><i>=</i><b><img class="pix" src="${DF.bigPicture('item', r, 3)}" alt="">${esc(r.c)}</b></li>`).join('')}</ul>` : '<p class="empty-book">Every forging is remembered here.</p>';
    }
    const s = openSheet(`<h2 class="title">${{ mon: 'Monster Book', item: 'Item Book', rec: 'Forge recipes' }[tab]}</h2>${tabs}<div class="book-scroll">${body}</div>
      <div class="row"><button class="btn ghost" data-a="close">Close</button></div>`, 'wide', back);
    s.onclick = (e) => { const t = e.target.closest('[data-t],[data-a]'); if (!t) return; if (t.dataset.t) { onClose = null; openBook(t.dataset.t, back); } if (t.dataset.a === 'close') closeSheet(); };
  }

  /* ---------- Stats ---------- */
  const fmt = (n) => Math.round(n || 0).toLocaleString();
  function fmtTime(secs) {
    secs = Math.round(secs || 0);
    const h = Math.floor(secs / 3600), m = Math.floor((secs % 3600) / 60);
    return h ? `${h}h ${m}m` : m ? `${m}m` : `${secs}s`;
  }
  function fmtDist(tiles) { const m = Math.round(tiles || 0); return m >= 1000 ? (m / 1000).toFixed(1) + ' km' : m + ' m'; }
  function openStats(back) {
    const m = G.meta, st = m.stats, rec = m.records || {};
    const tile = (big, label, title) => `<li${title ? ` title="${esc(title)}"` : ''}><b>${big}</b>${label}</li>`;
    const pct = (a, b) => (b ? Math.round(100 * a / b) + '%' : '0%');
    const best = rec.bestRun, big = rec.bigHit, item = rec.bestItem;
    const monPic = (name) => { const b = m.books.mon[window.DF_PROMPTS.norm(name)]; return b ? `<img class="pix" src="${DF.bigPicture('monster', b.spec, 3)}" alt="">` : '<i class="nopic"></i>'; };
    const prey = Object.values(m.books.mon).filter((b) => b.kills > 0).sort((a, b) => b.kills - a.kills).slice(0, 3);
    const foes = Object.entries(rec.killedBy || {}).sort((a, b) => b[1] - a[1]).slice(0, 3);
    const elems = Object.entries(rec.elemKills || {}).sort((a, b) => b[1] - a[1]);
    const floors = st.floorsAI + st.floorsHand;
    const html = `<h2 class="title">Stats</h2>
      ${!st.runs ? '<p class="sub">Play a run and your records start filling in.</p>' : ''}
      <h3 class="stat-h">Records</h3>
      <ul class="statgrid two">
        ${tile(st.deepest || 0, 'deepest floor')}
        ${tile(best ? `Floor ${best.floorN}` : '\u2014', best ? `best run: ${fmt(best.kills)} defeated, ${fmt(best.gold)} gold` : 'best run')}
        ${tile(fmtTime(rec.longestRun), 'longest run')}
        ${tile(big ? fmt(big.n) : '\u2014', big ? `biggest hit, with ${esc(big.weapon)} on ${esc(big.monster)}` : 'biggest hit')}
      </ul>
      <h3 class="stat-h">Fighting</h3>
      <ul class="statgrid">
        ${tile(fmt(st.kills), 'monsters defeated')}${tile(fmt(st.bosses), 'bosses beaten')}${tile(fmt(st.elites), 'elites beaten')}
        ${tile(fmt(st.dmgDealt), 'damage dealt')}${tile(fmt(st.dmgTaken), 'damage taken')}${tile(fmt(st.swings), 'swings')}
        ${tile(pct(st.crits, st.hits), 'of hits were crits', `${fmt(st.crits)} crits`)}${tile(fmt(st.weakHits), 'weak-spot hits')}${tile(fmt(st.bashes), 'shield bashes')}
        ${tile(fmt(st.potions), 'potions drunk')}${tile(fmt(st.deaths), st.deaths === 1 ? 'fall' : 'falls')}${tile(fmt(st.runs), st.runs === 1 ? 'run' : 'runs')}
      </ul>
      <h3 class="stat-h">Exploring</h3>
      <ul class="statgrid">
        ${tile(fmtTime(st.playSecs), 'time in the dungeon')}${tile(fmtDist(st.walked), 'walked')}${tile(fmt(st.descents), 'stairs taken')}
        ${tile(fmt(st.rooms), 'rooms cleared')}${tile(fmt(st.chests), 'chests opened')}${tile(fmt(st.mimics), 'mimics found')}
        ${tile(fmt(st.pots), 'pots and crates smashed')}${tile(fmt(st.rests), 'campfire rests')}${tile(fmt(st.rerolls), 'floors rerolled')}${tile(floors ? pct(st.floorsAI, floors) : '\u2014', 'floors dreamed by the AI', `${fmt(st.floorsAI)} by the AI, ${fmt(st.floorsHand)} made by the game`)}
      </ul>
      <h3 class="stat-h">Treasure</h3>
      <ul class="statgrid">
        ${tile(fmt(st.goldTotal), 'gold earned')}${tile(fmt(st.items), 'items found')}${tile(fmt(st.legendaries), 'legendaries found')}
        ${tile(fmt(st.forged), 'things forged')}${tile(fmt(st.bought), 'things bought')}${tile(fmt(st.sold || 0), 'things sold')}${tile(fmt(st.scrolls), 'scrolls learned')}${tile(fmt(st.spells), 'scroll spells cast')}${tile(Object.keys(m.books.mon).length, 'monsters in the book')}${tile(Object.keys(m.books.item).length, 'items in the book')}
      </ul>
      ${item ? `<h3 class="stat-h">Best find</h3><div class="stat-row"><img class="pix" src="${DF.bigPicture('item', item, 4)}" alt=""><span><b style="color:${DF.RAR_COLOR[item.rarity]}">${esc(item.name)}</b><small>${DF.RARITY[item.rarity]} ${esc(item.type || '')}</small></span></div>` : ''}
      ${prey.length ? `<h3 class="stat-h">Favourite prey</h3>${prey.map((b) => `<div class="stat-row"><img class="pix" src="${DF.bigPicture('monster', b.spec, 3)}" alt=""><span><b>${esc(b.spec.name)}</b><small>defeated ${fmt(b.kills)} times</small></span></div>`).join('')}` : ''}
      ${foes.length ? `<h3 class="stat-h">Nemeses</h3>${foes.map(([name, n]) => `<div class="stat-row">${monPic(name)}<span><b>${esc(name)}</b><small>beat you ${n === 1 ? 'once' : n + ' times'}</small></span></div>`).join('')}` : ''}
      ${elems.length ? `<h3 class="stat-h">Defeated by element</h3><p class="chips">${elems.map(([el, n]) => `<span class="chip" style="--c:${DF.EL_COLOR[el] || '#ccc'}">${el} ${fmt(n)}</span>`).join('')}</p>` : ''}
      <div class="row"><button class="btn ghost" data-a="close" data-focus>Close</button></div>`;
    const s = openSheet(`<div class="book-scroll stats-scroll">${html}</div>`, 'wide', back);
    s.onclick = (e) => { if (e.target.closest('[data-a="close"]')) closeSheet(); };
  }

  /* ---------- Settings ---------- */
  function openSettings(back) {
    const st = AI.settings;
    const s = openSheet('', 'wide', back);
    function draw() {
      const L = AI.local, id = AI.modelId(), dev = st.mode === 'device';
      const pct = Math.round((L.progress || 0) * 100);
      const devStatus = L.loading ? `Downloading and starting… ${pct}%` : L.engine && L.model === id ? 'Ready on this device.' : L.error ? 'Couldn’t start: ' + esc(L.error.slice(0, 140)) : L.cached[id] ? 'Downloaded. It starts when needed.' : 'Not downloaded yet.';
      s.innerHTML = `<h2 class="title">Settings</h2>
      <section class="set"><h3>Sound</h3>
        <label class="sw"><input type="checkbox" id="s-on" ${SND.on ? 'checked' : ''}> Sound effects</label>
        <label class="range">Effects volume <input type="range" id="s-vol" min="0" max="1" step="0.05" value="${SND.vol}"></label>
        <label class="sw"><input type="checkbox" id="s-mu" ${SND.music ? 'checked' : ''}> Music</label>
        <label class="range">Music volume <input type="range" id="s-mvol" min="0" max="1" step="0.05" value="${SND.mvol}"></label>
        <div class="seg">${[['tracks', 'Soundtrack'], ['synth', 'Made on the spot']].map(([v, l]) => `<label><input type="radio" name="m-kind" value="${v}" ${SND.kind === v ? 'checked' : ''}> ${l}</label>`).join('')}</div>
        <details><summary>Music credits</summary><ul class="credits">${DF.MUSIC_CREDITS.map((c) => `<li><small>${esc(c.use)}</small><b>${c.url ? `<a href="${esc(c.url)}" target="_blank" rel="noopener">${esc(c.title)}</a>` : esc(c.title)}</b>${c.by ? ` by ${esc(c.by)}` : ''}${c.license ? ` <em>${esc(c.license)}</em>` : ''}</li>`).join('')}</ul><p class="note">Tracks were converted to MP3 and their volumes evened out for the game. Licences: <a href="https://creativecommons.org/licenses/by/4.0/" target="_blank" rel="noopener">CC-BY 4.0</a>, <a href="https://creativecommons.org/licenses/by-sa/4.0/" target="_blank" rel="noopener">CC-BY-SA 4.0</a>, <a href="https://creativecommons.org/publicdomain/zero/1.0/" target="_blank" rel="noopener">CC0</a>.</p></details></section>
      <section class="set"><h3>The Deep (AI)</h3>
        <p class="note">It invents each floor, its monsters, the treasure and everything you forge. When it's off or can't answer in time, the game makes up floors itself, so there's always something new.</p>
        <div class="seg">${[['cloud', 'Online'], ['device', 'On this device'], ['off', 'Off']].map(([v, l]) => `<label><input type="radio" name="ai-mode" value="${v}" ${st.mode === v ? 'checked' : ''} ${v === 'device' && !AI.hasGPU() ? 'disabled' : ''}> ${l}</label>`).join('')}</div>
        ${st.mode === 'cloud' ? `<label class="field">Worker address<input type="url" id="ai-url" placeholder="${esc(AI.defaultUrl || 'https://deepforge.your-name.workers.dev')}" value="${esc(st.url || '')}" spellcheck="false" autocomplete="off"></label>
          <div class="row left"><button class="btn small" data-a="test">Test connection</button><span id="ai-test-out" class="note"></span></div>
          ${!AI.url() ? '<p class="note">Online needs your Deepforge Worker. Until it’s set, the game makes up floors itself.</p>' : ''}` : ''}
        ${dev ? `<label class="field">Model<select id="ai-model">${Object.entries(AI.LOCAL_MODELS).filter(([k]) => !(AI.IS_MOBILE && k === 'better')).map(([k, mm]) => `<option value="${k}" ${st.model === k ? 'selected' : ''}>${mm.label} (${mm.size})</option>`).join('')}</select></label>
          <p class="note">${devStatus}</p><div class="bar"><i style="width:${pct}%"></i></div>
          <div class="row left"><button class="btn small" data-a="dl" ${L.loading || (L.engine && L.model === id) ? 'disabled' : ''}>Download now</button>${L.cached[id] ? '<button class="btn small ghost" data-a="rm">Remove download</button>' : ''}</div>` : ''}
        ${!AI.hasGPU() ? '<p class="note">This browser can’t run the AI on its graphics chip, so On this device is off. Online still works.</p>' : ''}
        <p class="note">${AI.inventCount} inventions saved on this device.${AI.cloudLeft != null ? ` ${AI.cloudLeft} new inventions left online today.` : ''}</p>
        <details><summary>AI log</summary><pre class="log">${esc(AI.logText) || 'Nothing yet.'}</pre></details></section>
      <section class="set"><h3>Your save</h3>
        <p class="note">Keep your camp, books and inventions safe, or move them to another device, with a backup file or a code you can paste.</p>
        <div class="row left"><button class="btn small" data-a="download">Download save file</button><button class="btn small" data-a="load">Load save file</button></div>
        <input type="file" id="save-file" accept=".json,application/json,text/plain" hidden>
        <div class="row left"><button class="btn small" data-a="copy">Copy backup code</button><button class="btn small" data-a="paste">Restore from code</button></div>
        <textarea id="backup" rows="3" placeholder="Paste a backup code here, then tap Restore" hidden></textarea>
        <div class="row left"><button class="btn small danger" data-a="reset">Erase everything</button></div></section>
      <div class="row"><button class="btn primary" data-a="close">Done</button></div>`;
      bind();
    }
    function bind() {
      $('#s-on').onchange = (e) => { SND.set(e.target.checked, SND.vol); };
      $('#s-mu').onchange = (e) => { SND.set(SND.on, SND.vol, e.target.checked); };
      $('#s-mvol').oninput = (e) => { SND.set(SND.on, SND.vol, null, +e.target.value); };
      $('#s-vol').oninput = (e) => { SND.set(SND.on, +e.target.value); };
      s.querySelectorAll('input[name="m-kind"]').forEach((r) => { r.onchange = () => SND.setKind(r.value); });
      s.querySelectorAll('input[name="ai-mode"]').forEach((r) => { r.onchange = () => { st.mode = r.value; AI.saveSettings(); if (st.mode === 'device') AI.checkCached(); draw(); kick(); }; });
      const u = $('#ai-url'); if (u) u.onchange = () => { st.url = u.value.trim(); AI.saveSettings(); kick(); draw(); };
      const mdl = $('#ai-model'); if (mdl) mdl.onchange = () => { st.model = mdl.value; AI.saveSettings(); draw(); };
    }
    // After switching the AI on, start dreaming the next floor straight away.
    function kick() { if (G.mode === 'camp') { G.prepareNextRun(); } }
    s.onclick = async (e) => {
      const a = e.target.dataset.a; if (!a) return;
      if (a === 'close') closeSheet();
      if (a === 'test') { const u = $('#ai-url'); st.url = u.value.trim(); AI.saveSettings(); $('#ai-test-out').textContent = 'Checking…'; const msg = await AI.testCloud(); const out = $('#ai-test-out'); if (out) out.textContent = msg; kick(); }
      if (a === 'dl') { AI.loadLocal().then(() => toast('The Deep is ready on this device.')).catch(() => toast('Couldn’t start the AI on this device.')); draw(); }
      if (a === 'rm') { await AI.removeLocal(); draw(); }
      if (a === 'download') {
        const data = { format: 'deepforge-save', v: 1, savedAt: new Date().toISOString(), meta: G.meta, inv: AI.exportInv() };
        const blob = new Blob([JSON.stringify(data)], { type: 'application/json' });
        const url = URL.createObjectURL(blob), link = document.createElement('a');
        link.href = url; link.download = `deepforge-save-${new Date().toISOString().slice(0, 10)}.json`;
        document.body.appendChild(link); link.click(); link.remove();
        setTimeout(() => URL.revokeObjectURL(url), 2000);
        toast('Save file downloaded.');
      }
      if (a === 'load') {
        const inp = $('#save-file'); inp.value = '';
        inp.onchange = async () => {
          const f = inp.files && inp.files[0]; if (!f) return;
          try {
            const text = (await f.text()).trim();
            // A downloaded save file, or a text file holding a backup code.
            const o = text.startsWith('DF1:') ? JSON.parse(decodeURIComponent(escape(atob(text.slice(4))))) : JSON.parse(text);
            if (!o || !G.importMeta(o.meta)) throw new Error('bad');
            AI.importInv(o.inv); toast('Save loaded.'); closeSheet(); if (G.mode === 'camp') showCamp();
          } catch (err) { toast('That file isn\u2019t a Deepforge save.'); }
        };
        inp.click();
      }
      if (a === 'copy') {
        const code = 'DF1:' + btoa(unescape(encodeURIComponent(JSON.stringify({ meta: G.meta, inv: AI.exportInv() }))));
        try { await navigator.clipboard.writeText(code); toast('Backup code copied.'); } catch (err) { const ta = $('#backup'); ta.hidden = false; ta.value = code; ta.select(); toast('Copy the code from the box.'); }
      }
      if (a === 'paste') {
        const ta = $('#backup');
        if (ta.hidden) { ta.hidden = false; ta.focus(); return; }
        try {
          const raw = ta.value.trim(); if (!raw.startsWith('DF1:')) throw new Error('not ours');
          const o = JSON.parse(decodeURIComponent(escape(atob(raw.slice(4)))));
          if (!G.importMeta(o.meta)) throw new Error('bad');
          AI.importInv(o.inv); toast('Save restored.'); closeSheet(); if (G.mode === 'camp') showCamp();
        } catch (err) { toast('That code didn’t work. Check it was copied completely.'); }
      }
      if (a === 'reset') {
        if (!e.target.dataset.armed) { e.target.dataset.armed = '1'; e.target.textContent = 'Tap again to erase camp, books and upgrades'; return; }
        G.resetAll(); toast('Everything erased.'); closeSheet(); showCamp();
      }
    };
    draw();
    const off = AI.onChange(() => { if ($('#modal').hidden || !s.querySelector('#s-on')) { off(); return; } if (st.mode === 'device' && document.activeElement && document.activeElement.tagName !== 'INPUT') draw(); });
  }

  DF.UI = { openInventory, toggleInventory, openStats, openSwap, openScroll, openStall, openTrade, toast, banner, discovery, bossBar, setAction, renderSlots, openItem, openForge, confirmStairs, showDeath, showCamp, waitForDream, togglePause, pause: () => pause(), esc, isTouch: () => touch, openSettings };
  // Start up.
  setTouch(touch);
  $('#potion-img').src = DF.bigPicture('item', { icon: 'potion', colors: ['#ff4a6a', '#cfc8dc'], element: 'none' }, 3);
  DF.boot();
  showCamp();
  if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js').catch(() => {});
}(window.DF));
