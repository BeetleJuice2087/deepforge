/* Deepforge: the questions the AI is asked, and the cache key for each answer.
   This same file is pasted into the Cloudflare Worker (worker/deepforge-worker.js),
   so the on-device AI and the online AI are always asked the same thing.
   If you change it, rebuild the Worker too (or copy this block into it). */
(function (root) {
  'use strict';
  const ELEMENTS = ['fire', 'ice', 'lightning', 'poison', 'earth', 'light', 'shadow', 'nature'];
  const BEHAVIOURS = ['chaser', 'shooter', 'ambusher', 'swarm', 'tank', 'summoner', 'trickster'];
  const ABILITIES = ['fire trail', 'splits when hit', 'explodes on death', 'freezes floor', 'heals friends', 'shields', 'poisons', 'pulls you in'];
  const POWERS = ['pierce', 'bounce', 'chain', 'lifesteal', 'burn', 'freeze', 'knockback', 'multishot'];
  const RULES = ['darkness', 'slippery floors', 'hazard pools', 'swift foes', 'rich veins', 'healing springs'];
  const BODIES = ['walker', 'biped', 'blob', 'ghost', 'bat', 'bird', 'serpent', 'spider', 'bug', 'crab', 'octopus', 'jelly', 'frog', 'flame',
    'cloud', 'orb', 'spiky', 'mushroom', 'tree', 'flower', 'fish', 'snail', 'bee', 'flutter', 'star', 'horse'];
  const ICONS = {
    weapon: ['sword', 'axe', 'hammer', 'spear', 'dagger', 'mace'],
    armour: ['helm', 'chestplate', 'shield', 'boots', 'cloak', 'gauntlets'],
    trinket: ['ring', 'amulet', 'gem', 'orb', 'charm', 'feather'],
  };
  const STATS = ['health', 'attack', 'defence', 'speed', 'luck'];
  const SEEDS_A = ['lava', 'frost', 'candy', 'clockwork', 'mushroom', 'sunken', 'crystal', 'bone', 'library', 'storm', 'honey', 'mirror',
    'garden', 'sand', 'cloud', 'toy', 'ink', 'moon', 'swamp', 'iron', 'jungle', 'glass', 'coral', 'ember', 'ghost', 'star', 'pumpkin', 'circus',
    'amber', 'thunder', 'moss', 'salt', 'velvet', 'copper', 'ash', 'pearl', 'thorn', 'snow', 'gold', 'shadow'];
  const SEEDS_B = ['cave', 'tomb', 'temple', 'vault', 'kitchen', 'mine', 'castle', 'hollow', 'sewer', 'garden', 'forge', 'catacomb', 'museum',
    'market', 'ship', 'tower', 'den', 'palace', 'cellar', 'bath', 'workshop', 'nest', 'chapel', 'prison', 'lab', 'arena', 'grotto', 'archive'];
  const THEME_SEEDS = 1000; // themes are cached in 1000 slots, so the shared cache fills up and later floors come back instantly

  const norm = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 40);
  const clip = (s, n) => String(s || '').replace(/[\r\n"\\]/g, ' ').slice(0, n);
  const SYSTEM = 'You invent things for Deepforge, a family-friendly pixel-art dungeon crawler. Nothing gory, scary or rude. Reply with ONE JSON object only, no other text.';

  function inspiration(seed) {
    seed = Math.abs(seed | 0);
    return SEEDS_A[seed % SEEDS_A.length] + ' ' + SEEDS_B[Math.floor(seed / SEEDS_A.length) % SEEDS_B.length];
  }

  // Tidy what the game sends, so the Worker only ever sees short, safe text.
  function cleanCtx(kind, c) {
    c = c || {};
    if (kind === 'theme') return { seed: Math.abs(c.seed | 0) % THEME_SEEDS, tier: Math.max(1, Math.min(5, c.tier | 0)) };
    if (kind === 'monster') return { theme: clip(c.theme, 30), themeDesc: clip(c.themeDesc, 90), element: ELEMENTS.includes(c.element) ? c.element : 'earth',
      slot: ['0', '1', '2', '3', 'boss', 'named'].includes(String(c.slot)) ? String(c.slot) : '0', avoid: (Array.isArray(c.avoid) ? c.avoid : []).slice(0, 5).map((a) => clip(a, 24)) };
    if (kind === 'item') return { theme: clip(c.theme, 30), themeDesc: clip(c.themeDesc, 90), element: ELEMENTS.includes(c.element) ? c.element : 'earth',
      slot: Math.max(0, Math.min(11, c.slot | 0)) };
    if (kind === 'forge') {
      const it = (x) => ({ name: clip(x && x.name, 26), type: ['weapon', 'armour', 'trinket'].includes(x && x.type) ? x.type : 'trinket',
        element: ELEMENTS.includes(x && x.element) ? x.element : 'none', description: clip(x && x.description, 90) });
      return { a: it(c.a), b: it(c.b) };
    }
    return null;
  }

  function key(kind, c) {
    if (kind === 'theme') return `theme|${c.tier}|${c.seed}`;
    if (kind === 'monster') return `mon|${norm(c.theme)}|${c.slot}`;
    if (kind === 'item') return `item|${norm(c.theme)}|${c.slot}`;
    if (kind === 'forge') return `forge|${[norm(c.a.name), norm(c.b.name)].sort().join('+')}`;
    return '';
  }
  const itemTypeForSlot = (slot) => ['weapon', 'armour', 'trinket'][slot % 3];
  const forgeTypes = (c) => (c.a.type === c.b.type ? [c.a.type] : [c.a.type, c.b.type]);

  function question(kind, c) {
    if (kind === 'theme') {
      return `Invent a dungeon floor inspired by "${inspiration(c.seed)}" (depth ${c.tier} of 5, deeper is stranger).
JSON keys:
- name: 2-3 words, like "Frozen Library" or "Clockwork Tomb"
- description: one short sentence, max 70 characters
- element: one of ${ELEMENTS.join(', ')}
- rule: one of ${RULES.join(', ')}
- floor: dark hex colour of the floor tiles
- wall: hex colour of the walls, a bit lighter than the floor
- accent: bright hex colour for glowing details
- light: hex colour of the torchlight
Example: {"name":"Candy Crypt","description":"Sugar-glazed tombs that smell sweetly of danger.","element":"poison","rule":"rich veins","floor":"#3a2036","wall":"#7a3a68","accent":"#ff8ad8","light":"#ffd0f0"}`;
    }
    if (kind === 'monster') {
      const boss = c.slot === 'boss' || c.slot === 'named';
      return `Invent ${boss ? 'the BOSS monster' : 'one monster'} that lives in the dungeon floor "${c.theme}" (${c.themeDesc}).${c.slot === 'named' ? ' It is a famous champion with a proper name, like "Grimjaw the Toad King".' : ''}${c.avoid.length ? ' It must be different from: ' + c.avoid.join(', ') + '.' : ''}
JSON keys:
- name: 1-3 words that say what creature it is, like "Ember Bat" or "Coral Crab"
- description: one short sentence, max 70 characters, only about what it really does
- colors: 2 to 4 hex colours
- body: one of ${BODIES.join(', ')}
- element: one of ${ELEMENTS.join(', ')} (most monsters here are ${c.element})
- weakness: the one element that hurts it most
- tier: ${boss ? '3' : '1 (weak), 2 (normal) or 3 (strong)'}
- behaviour: one of chaser (runs at you), shooter (shoots from afar), ambusher (hides then strikes), swarm (comes in packs), tank (slow, tough, charges), summoner (calls helpers), trickster (blinks around)
- abilities: ${boss ? 'exactly 2' : '0 to 2'} from ${ABILITIES.join(', ')}
Example: {"name":"Cinder Imp","description":"Throws fireballs and leaves burning footprints.","colors":["#c8402a","#ff9a3a","#3a1210","#ffe14a"],"body":"biped","element":"fire","weakness":"ice","tier":2,"behaviour":"shooter","abilities":["fire trail"]}`;
    }
    if (kind === 'item') {
      const type = itemTypeForSlot(c.slot);
      return `Invent one ${type} found as treasure in the dungeon floor "${c.theme}" (${c.themeDesc}).
JSON keys:
- name: 1-3 words, like "Ember Blade"
- description: one short sentence, max 70 characters
- type: "${type}"
- icon: one of ${ICONS[type].join(', ')}
- element: one of ${ELEMENTS.join(', ')}, or none
${type === 'weapon' ? `- powers: 1 or 2 from ${POWERS.join(', ')}` : type === 'trinket' ? `- stat: the one it boosts, from ${STATS.join(', ')}` : '- powers: []'}
- colors: 2 hex colours
Example: {"name":"Frostbite Dagger","description":"Quick and cold as a winter night.","type":"weapon","icon":"dagger","element":"ice","powers":["freeze"],"colors":["#bff0ff","#5ab8e0"]}`;
    }
    if (kind === 'forge') {
      const types = forgeTypes(c);
      return `Two items are forged together into ONE new item that blends the ideas of both.
Item 1: ${c.a.name} (${c.a.type}, ${c.a.element}): ${c.a.description}
Item 2: ${c.b.name} (${c.b.type}, ${c.b.element}): ${c.b.description}
JSON keys:
- name: 1-3 words, NOT the same as either item
- description: one short sentence, max 70 characters
- type: ${types.map((t) => '"' + t + '"').join(' or ')}
- icon: weapon ${ICONS.weapon.join('/')}; armour ${ICONS.armour.join('/')}; trinket ${ICONS.trinket.join('/')}
- element: one of ${ELEMENTS.join(', ')}, or none
- powers: weapons only, 1 to 3 from ${POWERS.join(', ')}
- stat: trinkets only, one of ${STATS.join(', ')}
- colors: 2 hex colours
Example: Frost Sword + Ghost Gem = {"name":"Phantom Icicle Blade","description":"A see-through blade that chills whatever it cuts.","type":"weapon","icon":"sword","element":"ice","powers":["freeze","pierce"],"colors":["#cdeeff","#b48bff"]}`;
    }
    return '';
  }

  root.DF_PROMPTS = { SYSTEM, ELEMENTS, BEHAVIOURS, ABILITIES, POWERS, RULES, BODIES, ICONS, STATS, THEME_SEEDS, inspiration, cleanCtx, key, question, itemTypeForSlot, forgeTypes, norm };
}(typeof globalThis !== 'undefined' ? globalThis : self));
