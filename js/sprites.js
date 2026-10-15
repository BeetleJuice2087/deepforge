/* Deepforge: tiny pixel pictures for monsters, items and the Knight.
   Monster bodies come from Sand Alchemy's creature drawing: the words in a name pick
   the kind of body ("Magma Crab" is a crab), and small changes from the name keep
   every monster a little different. */
(function (DF) {
  'use strict';

  /* ---- Colour helpers ---- */
  const hexOk = (c) => typeof c === 'string' && /^#[0-9a-fA-F]{6}$/.test(c);
  function rgb(h) { const n = parseInt(h.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
  function hex(r, g, b) { return '#' + [r, g, b].map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join(''); }
  function mix(a, b, t) { const A = rgb(a), B = rgb(b); return hex(A[0] + (B[0] - A[0]) * t, A[1] + (B[1] - A[1]) * t, A[2] + (B[2] - A[2]) * t); }
  const darken = (c, t) => mix(c, '#000000', t);
  const lighten = (c, t) => mix(c, '#ffffff', t);
  function lum(c) { const [r, g, b] = rgb(c); return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255; }
  function rgba(c, a) { const [r, g, b] = rgb(c); return `rgba(${r},${g},${b},${a})`; }
  DF.color = { hexOk, rgb, hex, mix, darken, lighten, lum, rgba };

  function seeded(text) {
    let h = 2166136261;
    for (const ch of String(text)) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
    return (n) => { h = Math.imul(h ^ (h >>> 15), 2246822507); h ^= h >>> 13; return ((h >>> 0) % n); };
  }
  DF.seeded = seeded;

  /* ---- Body shapes from words (from Sand Alchemy) ---- */
  const BODY_WORDS = [
    ['horse', /\b(horses?|pony|ponies|unicorns?|stallions?|mares?|steeds?|colts?|pegasus)/g],
    ['frog', /\b(frogs?|toads?)\b/g],
    ['walker', /\b(dogs?|pup|puppy|cats?|kitten|fox|foxes|wolf|wolves|deer|cows?|pigs?|goats?|sheep|lions?|tigers?|bears?|rabbits?|bunny|mouse|mice|rats?|hamster|lizards?|dino\w*|camel|llama|elephant|rhino|hippo|boar|otter|ferret|raccoon|skunk|hedgehog|turtle|tortoise|beasts?|critters?|hounds?|bull|ox|salamander|newt|mole|hyena|jackal|panther|badger)\b/g],
    ['serpent', /\b(snakes?|serpents?|worm\w*|eels?|wyrms?|naga|centipede|millipede|dragon\w*|wyvern)/g],
    ['octopus', /\b(octopus\w*|octo|squids?|kraken|cuttlefish)/g],
    ['jelly', /\b(jellyfish|medusa)/g],
    ['fish', /\b(fish\w*|sharks?|whales?|minnow|guppy|carp|trout|piranha|tadpoles?|angler)/g],
    ['crab', /\b(crabs?|lobsters?|scorpions?|shrimp)/g],
    ['spider', /\b(spiders?|tarantula|weavers?|spinners?)/g],
    ['bee', /\b(bees?|wasps?|hornets?|bumble\w*)\b/g],
    ['flutter', /\b(butterfly|butterflies|moths?|fairy|fairies|pixie|dragonfly|firefly|sprites?|wings?)\b/g],
    ['bat', /\b(bats?)\b/g],
    ['bird', /\b(birds?|owls?|crows?|ravens?|parrots?|eagles?|hawks?|ducks?|chicks?|chickens?|hens?|goose|geese|swans?|robin|sparrow|pigeon|flamingo|phoenix|griffin|falcons?|penguins?|vultures?|harpy)\b/g],
    ['snail', /\b(snails?|slugs?)\b/g],
    ['bug', /\b(bugs?|beetles?|ants?|ladybugs?|ticks?|mites?|crickets?|grasshoppers?|roach|weevils?|scarabs?|larva|grubs?|maggots?)\b/g],
    ['blob', /\b(slimes?|blobs?|jelly|goo|ooze|puddle|gel|mochi|pudding|marshmallow|glob|sludge|gloop|gumdrop)/g],
    ['ghost', /\b(ghosts?|wraiths?|spirits?|phantoms?|spect(er|re)s?|spook\w*|wisps?|haunt\w*|banshee|shades?|souls?)/g],
    ['biped', /\b(golems?|robots?|bots?|knights?|man|men|guards?|person|wizards?|witch|elf|elves|gnomes?|goblins?|trolls?|yeti|zombies?|skeletons?|ninja|king|queen|imps?|monkeys?|apes?|gorilla|soldiers?|pirates?|warriors?|giants?|ogres?|mummy|mummies|vampires?|aliens?|androids?|cyborgs?|sentinels?|mages?|priests?|cultists?|kobolds?|orcs?|dwarf|dwarves|jester|clown|puppets?|dolls?|scarecrows?|automatons?|librarian|archivist|monk|statues?|lords?|baron|duke|pharaoh)\b/g],
    ['tree', /\b(trees?|groves?|bush|shrubs?|oaks?|willow|treant|ent)\b/g],
    ['mushroom', /\b(mushrooms?|shrooms?|fung\w*|toadstool|spores?)/g],
    ['flower', /\b(sprouts?|blooms?|blossoms?|flowers?|petals?|thorns?|vines?|ferns?|cactus|moss|buds?|lily|rose)\b/g],
    ['flame', /\b(flames?|blaze|embers?|inferno|flares?|pyro\w*|torch|candle|fires?|cinders?)\b/g],
    ['cloud', /\b(clouds?|fog\w*|mists?|\w*storms?|nimbus|vapou?r|puffs?|tempest|smoke)\b/g],
    ['star', /\b(stars?|starfish|comets?|meteors?|nova|moon)\b/g],
    ['orb', /\b(bubbles?|orbs?|balls?|spheres?|pearl|eyes?|eyeballs?|beholder)\b/g],
    ['spiky', /\b(spark\w*|burst\w*|blasts?|glitter|crack\w*|thunder\w*|lightning|volt\w*|zap\w*|bolts?|shock\w*|static|shards?|icicles?|crystals?|urchin)/g],
  ];
  function lastBody(text) {
    let best = '', at = -1;
    for (const [k, re] of BODY_WORDS) { re.lastIndex = 0; let m; while ((m = re.exec(text))) { if (m.index >= at) { at = m.index; best = k; } } }
    return best;
  }
  const BEHAVIOUR_BODY = { shooter: 'spiky', tank: 'biped', swarm: 'bug', ambusher: 'ghost', trickster: 'flutter', summoner: 'biped', chaser: 'walker' };
  DF.bodyType = function (spec) {
    return lastBody(String(spec.name || '').toLowerCase())
      || (DF.BODIES.includes(spec.body) ? spec.body : '')
      || lastBody(String(spec.description || '').toLowerCase())
      || BEHAVIOUR_BODY[spec.behaviour] || 'blob';
  };
  const SHAPES = {
    crab: [['c...c', 'cc.cc', '.aaa.', 'adada', 'c.c.c'], ['c.....c', 'cc...cc', '.aaaaa.', 'aadadaa', '.c.c.c.']],
    octopus: [['.aaa.', 'aaaaa', 'adada', 'aaaaa', 'c.c.c'], ['..aaa..', '.aaaaa.', '.adada.', 'caaaaac', 'c.c.c.c']],
    jelly: [['.aaa.', 'aadaa', 'aaaaa', 'c.c.c', '.c.c.'], ['.bbb.', 'babab', 'aaaaa', 'c.c.c']],
    bat: [['a.....a', 'aa.d.aa', '.aaaaa.', '...a...'], ['aa...aa', '.aadaa.', '..aaa..']],
    ghost: [['.aaa.', 'adada', 'aaaaa', 'aaaaa', 'a.a.a'], ['.aaa.', 'aaaaa', 'adbda', 'aaaaa', '.a.a.']],
    frog: [['d...d', 'aa.aa', 'aaaaa', 'abbba', 'c...c'], ['.d.d.', 'aaaaa', 'aaaaa', 'c.a.c']],
    bee: [['.cc...', 'cc....', 'ababad', '.c.c..'], ['..cc..', '.cc...', 'babab.', 'ababad']],
    snail: [['..bb..', '.bbab.', '.babb.', 'aaaaad'], ['.bbb...', 'bbabb..', 'babbb.d', 'aaaaaaa']],
    tree: [['.bbb.', 'bbbbb', 'bdbdb', '.bab.', '..a..', '.c.c.'], ['..b..', '.bbb.', 'bbdbd', '.bbb.', '..a..', '..a..']],
    mushroom: [['.bbb.', 'bbabb', 'bbbbb', '.ada.', '.aaa.', '.c.c.'], ['bbbbb', 'babab', '.ada.', '.aaa.']],
    flower: [['.b.b.', 'bbabb', '.bdb.', '..c..', '.ccc.'], ['b.b.b', '.bab.', 'babab', '.bdb.', '..c..']],
    flame: [['..a..', '.aa..', '.aba.', 'abdba', '.aaa.'], ['.a...', '.aa.a', 'abaaa', 'adbda', '.aaa.']],
    cloud: [['.aa.aa.', 'aaaaaaa', 'aadaada', '.aaaaa.', '.c.c.c.'], ['..aaa..', '.aaaaa.', 'aadadaa', 'aaaaaaa']],
    star: [['..a..', 'aaaaa', '.ada.', '.a.a.'], ['..b..', '.aaa.', 'baaab', '.dad.', 'a...a']],
    orb: [['.aaa.', 'abaaa', 'adada', 'aaaaa', '.aaa.'], ['..aaa..', '.abaaa.', 'aadadaa', '.aaaaa.', '..aaa..']],
    spiky: [['c.a.c', '.aaa.', 'adada', '.aaa.', 'c.a.c'], ['..c..', 'c.a.c', '.ada.', 'caaac', '..c..']],
    flutter: [['aa.aa', 'abdba', '.a.a.'], ['a.a', '.d.', 'a.a'], ['bb.bb', 'aadaa', 'bb.bb']],
  };
  function creatureRows(spec) {
    const name = String(spec.name || 'Monster'), r = seeded(name), kind = DF.bodyType(spec);
    const grid = (w, h) => Array.from({ length: h }, () => Array(w).fill('.'));
    const out = (gr) => gr.map((row) => row.join(''));
    if (SHAPES[kind]) { const list = SHAPES[kind]; return list[r(list.length)]; }
    if (kind === 'horse') {
      const horn = /unicorn|pegasus|horn/i.test(name), L = 5 + r(2), gr = grid(L + 2, 5);
      if (horn) gr[0][L + 1] = 'c';
      gr[1][L] = 'b'; gr[1][L + 1] = 'd'; gr[2][L] = 'a';
      for (let x = 0; x < L; x++) gr[3][x] = 'a'; gr[3][L] = 'a'; gr[2][0] = 'b';
      [1, 2, L - 2, L - 1].forEach((x) => { gr[4][x] = 'c'; });
      return out(gr);
    }
    if (kind === 'walker') {
      const L = 5 + r(3), H = 1 + r(2), ears = r(2), neck = r(5) === 0, tail = r(3) > 0, spots = r(3) === 0;
      const top = ears ? 1 : 0, bodyY = top + (neck ? 2 : 1), gr = grid(L + 2, bodyY + H + 1);
      if (ears) gr[0][L] = 'b';
      gr[top][L] = 'b'; gr[top][L + 1] = 'd';
      if (neck) gr[top + 1][L] = 'a';
      for (let y = bodyY; y < bodyY + H; y++) for (let x = 0; x < L; x++) gr[y][x] = spots && (x + y) % 3 === 0 ? 'b' : 'a';
      gr[bodyY][L] = 'a';
      if (tail) gr[bodyY - 1][0] = 'a';
      (L >= 6 ? [1, 3, L - 3, L - 1] : [0, L - 1]).forEach((x) => { gr[bodyY + H][x] = 'c'; });
      return out(gr);
    }
    if (kind === 'biped') {
      const bot = /\b(robots?|bots?|android|cyborg|golem|sentinel|automaton|tech)\b/i.test(name);
      if (bot) return r(2) ? ['..c..', '.bdb.', '.aaa.', 'caaac', '.a.a.', '.c.c.'] : ['.c.c.', 'bdbdb', '.aaa.', 'caaac', '.c.c.'];
      const wide = r(2), tall = r(2), w = wide ? 5 : 4, gr = grid(w, tall ? 5 : 4), bw = wide ? 3 : 2;
      gr[0][1] = 'b'; gr[0][2] = 'd'; if (wide) gr[0][3] = 'b';
      (tall ? [1, 2, 3] : [1, 2]).forEach((y, k) => { for (let x = 1; x < 1 + bw; x++) gr[y][x] = 'a'; if (k === 0) { gr[y][0] = 'c'; gr[y][w - 1] = 'c'; } });
      const ly = gr.length - 1; gr[ly][1] = 'c'; gr[ly][bw] = 'c';
      return out(gr);
    }
    if (kind === 'bug') {
      const L = 3 + r(3), gr = grid(L + 1, 3);
      for (let x = 1; x < L; x++) gr[0][x] = 'a';
      for (let x = 0; x < L; x++) gr[1][x] = r(3) === 0 ? 'b' : 'a';
      gr[1][L] = 'd'; if (r(2)) gr[0][L] = 'c';
      for (let x = 0; x < L; x += 2) gr[2][x] = 'c';
      return out(gr);
    }
    if (kind === 'spider') {
      const L = 3 + r(2), gr = grid(L + 3, 3);
      for (let x = 0; x < L + 3; x += 2) { gr[0][x] = 'c'; gr[2][x] = 'c'; }
      for (let x = 1; x <= L; x++) gr[1][x] = 'a';
      gr[1][L + 1] = 'd';
      return out(gr);
    }
    if (kind === 'serpent') {
      const L = 6 + r(3), gr = grid(L + 1, 2);
      for (let x = 0; x < L; x++) { const k = Math.floor(x / 2) % 2; gr[k][x] = x % 4 === 0 && r(2) ? 'b' : 'a'; if (x % 2 === 1 && x < L - 1) gr[1 - k][x] = 'a'; }
      gr[0][L] = 'd'; gr[0][L - 1] = 'a';
      return out(gr);
    }
    if (kind === 'fish') {
      const L = 3 + r(4), h = r(2) ? 4 : 3, gr = grid(L + 2, h);
      gr[0][0] = 'c'; gr[h - 1][0] = 'c'; gr[1][1] = 'c';
      for (let y = 0; y < h; y++) for (let x = 2; x < L + 2; x++) { const edge = y === 0 || y === h - 1; if (!edge || (x > 2 && x < L + 1)) gr[y][x] = 'a'; }
      gr[1][L] = 'd'; if (r(2)) gr[0][Math.floor(L / 2) + 1] = 'b';
      return out(gr);
    }
    if (kind === 'bird') {
      const L = 3 + r(3), gr = grid(L + 2, 3);
      for (let x = 1; x < Math.min(4, L); x++) gr[0][x] = 'b';
      for (let x = 0; x <= L; x++) gr[1][x] = 'a';
      gr[0][L] = 'a'; gr[0][L + 1] = 'c';
      gr[2][Math.floor(L / 2)] = 'c';
      return out(gr);
    }
    return r(2) ? ['..aaa..', '.aaaaa.', 'aadadaa', 'aaaaaaa', '.b...b.'] : ['.aaaa.', 'aaaaaa', 'adaada', 'aaaaaa', 'b..b..'];
  }
  DF.creatureRows = creatureRows;

  /* ---- Turning letter pictures into little canvases (cached) ---- */
  const cache = new Map();
  function paint(rows, pal, outline, scale) {
    scale = scale || 1;
    const h = rows.length, w = Math.max(...rows.map((r) => r.length)), pad = outline ? 1 : 0;
    const cv = document.createElement('canvas'); cv.width = (w + pad * 2) * scale; cv.height = (h + pad * 2) * scale;
    const g = cv.getContext('2d');
    const on = (x, y) => y >= 0 && y < h && x >= 0 && x < (rows[y] || '').length && rows[y][x] !== '.';
    if (outline) {
      g.fillStyle = outline;
      for (let y = -1; y <= h; y++) for (let x = -1; x <= w; x++) {
        if (on(x, y)) continue;
        if (on(x - 1, y) || on(x + 1, y) || on(x, y - 1) || on(x, y + 1)) g.fillRect((x + pad) * scale, (y + pad) * scale, scale, scale);
      }
    }
    for (let y = 0; y < h; y++) for (let x = 0; x < rows[y].length; x++) {
      const ch = rows[y][x]; if (ch === '.') continue;
      g.fillStyle = pal[ch] || pal.a; g.fillRect((x + pad) * scale, (y + pad) * scale, scale, scale);
    }
    return cv;
  }
  function flipped(cv) {
    const f = document.createElement('canvas'); f.width = cv.width; f.height = cv.height;
    const g = f.getContext('2d'); g.translate(cv.width, 0); g.scale(-1, 1); g.drawImage(cv, 0, 0); return f;
  }
  function monsterPalette(spec) {
    const cols = (spec.colors || []).filter(hexOk);
    let a = cols[0] || DF.EL_COLOR[spec.element] || '#9a8aa8';
    if (lum(a) < 0.12) a = lighten(a, 0.35); // dark bodies vanish on dark floors
    const b = cols[1] || lighten(a, 0.35), c = cols[2] || darken(a, 0.45);
    let d = cols[3] || '#ffffff';
    if (Math.abs(lum(d) - lum(a)) < 0.25) d = lum(a) > 0.5 ? '#1a1020' : '#ffffff';
    return { a, b, c, d };
  }
  // A monster picture: { right, left, w, h }. Kinds: '' normal, 'elite' gold outline, 'flash' all white.
  DF.monsterSprite = function (spec, kind) {
    const key = 'm|' + spec.name + '|' + (spec.colors || []).join() + '|' + (kind || '');
    if (cache.has(key)) return cache.get(key);
    const rows = spec.rows || (spec.rows = creatureRows(spec));
    let pal = monsterPalette(spec);
    if (kind === 'flash') pal = { a: '#ffffff', b: '#ffffff', c: '#ffffff', d: '#ffffff' };
    const outline = kind === 'elite' ? '#ffcf4a' : kind === 'flash' ? null : '#0c0a10';
    const right = paint(rows, pal, outline, 1), left = flipped(right);
    const s = { right, left, w: right.width, h: right.height };
    cache.set(key, s); return s;
  };
  DF.iconPalette = function (colors, element) {
    const cols = (colors || []).filter(hexOk);
    const a = cols[0] || DF.EL_COLOR[element] || '#c8c8d8';
    return { a, b: cols[1] || darken(a, 0.35), c: '#8a5a32', d: darken(a, 0.55), e: lighten(a, 0.6) };
  };
  // An item icon (8 x 8 plus an outline).
  DF.iconSprite = function (icon, colors, element, scale) {
    const key = 'i|' + icon + '|' + (colors || []).join() + '|' + element + '|' + (scale || 1);
    if (cache.has(key)) return cache.get(key);
    const rows = DF.ICON_PIX[icon] || DF.ICON_PIX.gem;
    const cv = paint(rows, DF.iconPalette(colors, element), '#0c0a10', scale || 1);
    cache.set(key, cv); return cv;
  };
  DF.heroSprite = function (cls, frame, kind) {
    const hero = DF.HEROES[cls] || DF.HEROES.knight;
    const key = 'h|' + cls + '|' + frame + '|' + (kind || '');
    if (cache.has(key)) return cache.get(key);
    let pal = Object.assign({}, hero.colors);
    if (kind === 'flash') { pal = {}; for (const k in hero.colors) pal[k] = '#ffffff'; }
    const right = paint(hero.rows[frame % hero.rows.length], pal, kind === 'flash' ? null : '#0c0a10', 1);
    const s = { right, left: flipped(right), w: right.width, h: right.height };
    cache.set(key, s); return s;
  };
  DF.knightSprite = (frame, kind) => DF.heroSprite('knight', frame, kind);
  // A sprite drawn big, for the books and cards (a data URL so it can go in an <img>).
  DF.bigPicture = function (kind, spec, scale) {
    const key = 'big|' + kind + '|' + (spec.name || spec.icon || spec.cls) + '|' + (spec.colors || []).join() + '|' + scale;
    if (cache.has(key)) return cache.get(key);
    let cv;
    if (kind === 'monster') {
      const rows = spec.rows || creatureRows(spec);
      cv = paint(rows, monsterPalette(spec), spec.elite ? '#ffcf4a' : '#0c0a10', scale);
    } else if (kind === 'knight' || kind === 'hero') { const h = DF.HEROES[spec.cls || 'knight']; cv = paint(h.rows[0], h.colors, '#0c0a10', scale); }
    else cv = paint(DF.ICON_PIX[spec.icon] || DF.ICON_PIX.gem, DF.iconPalette(spec.colors, spec.element), '#0c0a10', scale);
    const url = cv.toDataURL();
    cache.set(key, url); return url;
  };
}(window.DF));
