/* Deepforge: the floor generator. Makes whole floors (name, look, monsters, boss and treasure) from
   big word lists, with no AI at all. It's used whenever the AI is off, slow, or out of answers, so the
   dungeon never runs out of new floors. The same seed always makes the same floor. */
(function (DF) {
  'use strict';
  const C = DF.color;

  /* ---------------- Word lists, by element ---------------- */
  const EL = {
    fire: {
      adj: ['Molten', 'Ember', 'Scorched', 'Ashen', 'Burning', 'Cinder', 'Smouldering', 'Blazing', 'Sulphur', 'Charred'],
      place: ['Forge', 'Caldera', 'Furnace', 'Kiln', 'Pits', 'Crucible', 'Vents', 'Foundry', 'Smelter', 'Hearth'],
      of: ['Ash', 'Embers', 'Cinders', 'Flame', 'Smoke'],
      pre: ['Ember', 'Cinder', 'Magma', 'Ash', 'Scorch', 'Lava', 'Soot', 'Pyre'],
      mat: ['Obsidian', 'Brimstone', 'Ember', 'Cinder', 'Magma'],
      feel: ['smouldering', 'red-hot', 'sooty', 'crackling', 'blistering'],
      desc: ['Rivers of magma glow between the stones.', 'The air shimmers with a dry, fierce heat.', 'Ash drifts down like grey snow.',
        'Old chains glow red-hot on the walls.', 'Every step crunches on cinders.', 'Something deep below roars like a bellows.'],
      hue: [8, 28], rules: ['hazard pools', 'swift foes'],
    },
    ice: {
      adj: ['Frozen', 'Frost', 'Glacial', 'Rime', 'Snowbound', 'Shivering', 'Icebound', 'Hoarfrost', 'Winter', 'Pale'],
      place: ['Vault', 'Grotto', 'Halls', 'Crypt', 'Cavern', 'Library', 'Rift', 'Cellars', 'Gallery', 'Abyss'],
      of: ['Frost', 'Snow', 'Silence', 'Winter', 'Sleet'],
      pre: ['Frost', 'Ice', 'Snow', 'Rime', 'Sleet', 'Chill', 'Hail', 'Glacier'],
      mat: ['Frost', 'Glacier', 'Rime', 'Crystal', 'Snow'],
      feel: ['frost-rimed', 'shivering', 'glassy', 'snow-white', 'brittle'],
      desc: ['Icicles hang like teeth from the ceiling.', 'Your breath freezes in the still air.', 'Blue light glows through walls of ice.',
        'Frozen shapes sleep inside the walls.', 'Snow falls from nowhere and never melts.', 'The floor is slick with black ice.'],
      hue: [188, 215], rules: ['slippery floors', 'darkness'],
    },
    lightning: {
      adj: ['Storm', 'Thunder', 'Crackling', 'Static', 'Charged', 'Tempest', 'Galvanic', 'Humming', 'Copper', 'Sparking'],
      place: ['Spire', 'Foundry', 'Engine', 'Halls', 'Tower', 'Coils', 'Works', 'Dynamo', 'Generator', 'Lab'],
      of: ['Storms', 'Thunder', 'Sparks', 'Static', 'Lightning'],
      pre: ['Storm', 'Volt', 'Static', 'Thunder', 'Shock', 'Arc', 'Surge', 'Flash'],
      mat: ['Copper', 'Storm', 'Volt', 'Brass', 'Thunder'],
      feel: ['crackling', 'buzzing', 'static-charged', 'twitching', 'humming'],
      desc: ['Sparks leap between brass coils.', 'Thunder rolls through the stone.', 'Your hair stands on end.',
        'Old machines hum and flicker in the dark.', 'Blue arcs crawl along the walls.', 'The air smells like a storm.'],
      hue: [44, 58], rules: ['swift foes', 'rich veins'],
    },
    poison: {
      adj: ['Toxic', 'Blighted', 'Festering', 'Venom', 'Rotting', 'Murky', 'Sickly', 'Bilious', 'Putrid', 'Stagnant'],
      place: ['Swamp', 'Sewers', 'Bog', 'Cistern', 'Mire', 'Warren', 'Fen', 'Drains', 'Marsh', 'Pools'],
      of: ['Rot', 'Venom', 'Sludge', 'Blight', 'Ooze'],
      pre: ['Venom', 'Toxic', 'Bile', 'Blight', 'Rot', 'Sludge', 'Plague', 'Mire'],
      mat: ['Venom', 'Blight', 'Bile', 'Toxic', 'Rot'],
      feel: ['dripping', 'sickly', 'reeking', 'bubbling', 'oozing'],
      desc: ['Green slime drips from every crack.', 'Bubbles burst in pools of sludge.', 'A sour mist hangs low over the floor.',
        'Pipes leak something you shouldn’t touch.', 'The walls are furred with green mould.', 'Everything here smells of rot.'],
      hue: [82, 110], rules: ['hazard pools', 'darkness'],
    },
    earth: {
      adj: ['Sunken', 'Crumbling', 'Buried', 'Ancient', 'Stone', 'Dusty', 'Deep', 'Hollow', 'Forgotten', 'Fallen'],
      place: ['Mines', 'Quarry', 'Tomb', 'Catacombs', 'Ruins', 'Barrow', 'Tunnels', 'Vault', 'Dig', 'Crypt'],
      of: ['Dust', 'Stone', 'Kings', 'Bones', 'Echoes'],
      pre: ['Stone', 'Rock', 'Mud', 'Clay', 'Iron', 'Granite', 'Dust', 'Boulder'],
      mat: ['Iron', 'Stone', 'Granite', 'Bronze', 'Clay'],
      feel: ['craggy', 'dust-caked', 'heavy', 'cracked', 'mossy'],
      desc: ['Old pickaxes lie where miners left them.', 'Dust falls whenever something moves above.', 'Roots and rubble choke the corridors.',
        'Carvings of forgotten kings line the walls.', 'Gold glints in the cracked stone.', 'The tunnels groan under the weight above.'],
      hue: [24, 40], rules: ['rich veins', 'hazard pools'],
    },
    light: {
      adj: ['Gilded', 'Radiant', 'Shining', 'Holy', 'Golden', 'Dawnlit', 'Sunlit', 'Gleaming', 'Hallowed', 'Bright'],
      place: ['Temple', 'Sanctum', 'Cathedral', 'Halls', 'Chapel', 'Palace', 'Shrine', 'Treasury', 'Cloister', 'Court'],
      of: ['Dawn', 'Light', 'Gold', 'Saints', 'Mirrors'],
      pre: ['Sun', 'Dawn', 'Gilded', 'Radiant', 'Halo', 'Glimmer', 'Prism', 'Gold'],
      mat: ['Gold', 'Silver', 'Sun', 'Dawn', 'Prism'],
      feel: ['glowing', 'golden', 'dazzling', 'gleaming', 'shining'],
      desc: ['Sunbeams fall from cracks high above.', 'Mirrors throw light in every direction.', 'Golden statues watch from their alcoves.',
        'Bells ring softly when no one is near.', 'Even the dust sparkles here.', 'Old hymns echo from somewhere far off.'],
      hue: [42, 52], rules: ['healing springs', 'rich veins'],
    },
    shadow: {
      adj: ['Haunted', 'Shadow', 'Gloom', 'Dusk', 'Silent', 'Forgotten', 'Whispering', 'Moonless', 'Hollow', 'Grim'],
      place: ['Crypt', 'Manor', 'Catacombs', 'Ossuary', 'Chapel', 'Asylum', 'Gallery', 'Labyrinth', 'Mausoleum', 'Halls'],
      of: ['Whispers', 'Night', 'Shadows', 'Sorrow', 'Echoes'],
      pre: ['Shadow', 'Gloom', 'Dusk', 'Night', 'Void', 'Grim', 'Murk', 'Dread'],
      mat: ['Shadow', 'Night', 'Void', 'Dusk', 'Bone'],
      feel: ['silent', 'shadowy', 'hollow-eyed', 'whispering', 'pale'],
      desc: ['Candles burn without warmth.', 'Portraits follow you with their eyes.', 'Whispers stop the moment you listen.',
        'Shadows move a little after you do.', 'Bones are stacked neatly along the walls.', 'Something sighs in the dark.'],
      hue: [262, 288], rules: ['darkness', 'swift foes'],
    },
    nature: {
      adj: ['Overgrown', 'Mossy', 'Tangled', 'Wild', 'Verdant', 'Blooming', 'Rootbound', 'Fungal', 'Thorny', 'Sunken'],
      place: ['Grove', 'Garden', 'Hollow', 'Thicket', 'Den', 'Burrow', 'Greenhouse', 'Glade', 'Orchard', 'Roots'],
      of: ['Thorns', 'Roots', 'Spores', 'Moss', 'Petals'],
      pre: ['Moss', 'Thorn', 'Bramble', 'Fern', 'Root', 'Bark', 'Spore', 'Vine'],
      mat: ['Oak', 'Thorn', 'Bark', 'Willow', 'Moss'],
      feel: ['mossy', 'thorny', 'leafy', 'root-tangled', 'blooming'],
      desc: ['Roots have split the floor wide open.', 'Glowing mushrooms light the way.', 'Vines creep across every wall.',
        'Pollen drifts like golden dust.', 'Strange flowers turn to watch you pass.', 'The ground is soft with moss.'],
      hue: [100, 140], rules: ['healing springs', 'slippery floors'],
    },
  };
  const NEIGHBOURS = { fire: ['earth', 'lightning'], ice: ['shadow', 'light'], lightning: ['fire', 'light'], poison: ['nature', 'shadow'],
    earth: ['nature', 'fire'], light: ['lightning', 'ice'], shadow: ['poison', 'ice'], nature: ['poison', 'earth'] };
  const EL_ABILITIES = { fire: ['fire trail', 'explodes on death'], ice: ['freezes floor', 'shields'], lightning: ['explodes on death', 'pulls you in'],
    poison: ['poisons', 'splits when hit'], earth: ['shields', 'splits when hit'], light: ['heals friends', 'shields'], shadow: ['pulls you in', 'poisons'],
    nature: ['heals friends', 'splits when hit'] };

  /* ---------------- Monsters ---------------- */
  // Creature words the sprite maker recognises, so a "Wolf" looks like a wolf and a "Wraith" like a ghost.
  const CREATURES = {
    chaser: ['Hound', 'Wolf', 'Rat', 'Boar', 'Lizard', 'Beetle', 'Crab', 'Spider', 'Toad', 'Scorpion', 'Zombie', 'Ghoul', 'Orc', 'Minotaur', 'Bone Hound', 'Lizardman', 'Skeleton', 'Basilisk', 'Lobster', 'Shark'],
    swarm: ['Bat', 'Bee', 'Wasp', 'Mite', 'Grub', 'Slime', 'Moth', 'Ant', 'Tick', 'Maggot', 'Imp', 'Goblin', 'Scarab', 'Leech', 'Hornet', 'Worm', 'Centipede'],
    shooter: ['Eye', 'Orb', 'Shard', 'Flower', 'Mushroom', 'Toad', 'Wisp', 'Bloom', 'Crystal', 'Octopus', 'Archer', 'Beholder', 'Flytrap', 'Cultist', 'Mage', 'Angler', 'Gargoyle'],
    ambusher: ['Ghost', 'Shade', 'Spider', 'Snake', 'Wraith', 'Slime', 'Eel', 'Phantom', 'Ooze', 'Serpent', 'Mimic', 'Banshee', 'Rogue', 'Assassin', 'Scorpion', 'Tentacle', 'Viper', 'Slug'],
    tank: ['Golem', 'Troll', 'Crab', 'Tortoise', 'Knight', 'Treant', 'Boar', 'Yeti', 'Bear', 'Snail', 'Ogre', 'Minotaur', 'Mummy', 'Gargoyle', 'Guardian', 'Defender', 'Spearman', 'Horror'],
    trickster: ['Imp', 'Moth', 'Fairy', 'Wisp', 'Fox', 'Sprite', 'Phantom', 'Butterfly', 'Goblin', 'Bat', 'Vampire', 'Thief', 'Ninja', 'Harpy', 'Banshee', 'Reaper', 'Blade'],
    summoner: ['Wizard', 'Witch', 'Queen', 'Mushroom', 'Spider', 'King', 'Goblin', 'Skeleton', 'Lich', 'Necromancer', 'Cultist', 'Medusa', 'Shaman', 'Mind Flayer', 'Priest'],
  };
  const VERBS = {
    chaser: ['runs straight at you', 'never stops hunting', 'charges at anything that moves', 'chases you room to room'],
    swarm: ['hunts in packs', 'comes in buzzing crowds', 'never travels alone', 'swarms over anything that moves'],
    shooter: ['spits bolts from afar', 'keeps its distance and fires', 'pelts you from across the room', 'hangs back and shoots'],
    ambusher: ['waits unseen until you come close', 'hides in plain sight', 'lurks where you least expect', 'springs out of nowhere'],
    tank: ['shrugs off blows, then charges', 'is slow but terribly tough', 'plods forward like a wall', 'barely notices your hits'],
    trickster: ['blinks from place to place', 'never stays where you aim', 'vanishes and reappears behind you', 'flickers in and out of sight'],
    summoner: ['calls little helpers to its side', 'is never alone for long', 'raises minions from the floor', 'summons a crowd to fight for it'],
  };
  const SIZES = ['Hulking', 'Elder', 'Great', 'Ancient', 'Giant', 'Dire'];
  const BOSS_NOUNS = ['King', 'Queen', 'Golem', 'Dragon', 'Wyrm', 'Kraken', 'Beholder', 'Treant', 'Wizard', 'Witch', 'Troll', 'Spider', 'Phoenix', 'Serpent', 'Knight', 'Skeleton',
    'Lich', 'Demon', 'Minotaur', 'Vampire', 'Medusa', 'Gargoyle', 'Mummy', 'Horror', 'Reaper', 'Ogre', 'Hydra', 'Mimic'];
  const BOSS_TITLES = ['Lord', 'Keeper', 'Warden', 'Tyrant', 'Matron', 'Ruler', 'Guardian', 'Mother'];
  const SYL_A = ['Mor', 'Kal', 'Vex', 'Zar', 'Gol', 'Ith', 'Ul', 'Nyx', 'Bra', 'Thul', 'Ska', 'Or', 'Grim', 'Sel', 'Dra', 'Vor'];
  const SYL_B = ['gath', 'ok', 'ra', 'ion', 'eth', 'umm', 'ix', 'ara', 'oth', 'una', 'ax', 'ess', 'or', 'ith'];

  /* ---------------- Treasure ---------------- */
  const ICON_NOUNS = {
    sword: ['Blade', 'Sword', 'Saber', 'Edge'], axe: ['Axe', 'Cleaver', 'Hatchet'], hammer: ['Hammer', 'Maul', 'Mallet'],
    spear: ['Spear', 'Lance', 'Pike'], dagger: ['Dagger', 'Fang', 'Shiv', 'Knife'], mace: ['Mace', 'Morningstar', 'Crusher'],
    helm: ['Helm', 'Crown', 'Hood'], chestplate: ['Plate', 'Cuirass', 'Mail', 'Vest'], shield: ['Shield', 'Buckler', 'Bulwark'],
    boots: ['Boots', 'Treads', 'Greaves'], cloak: ['Cloak', 'Mantle', 'Cape'], gauntlets: ['Gauntlets', 'Gloves', 'Grips'],
    ring: ['Ring', 'Band', 'Loop'], amulet: ['Amulet', 'Pendant', 'Locket'], gem: ['Gem', 'Shard', 'Jewel'],
    orb: ['Orb', 'Eye', 'Sphere'], charm: ['Charm', 'Token', 'Totem'], feather: ['Feather', 'Plume', 'Quill'],
  };
  const PLAIN_MATS = ['Iron', 'Bronze', 'Silver', 'Bone', 'Oak', 'Copper', 'Steel', 'Ivory', 'Pewter', 'Ashwood'];
  const POWER_FX = { burn: 'sets foes alight', freeze: 'chills whatever it strikes', chain: 'crackles with lightning', lifesteal: 'drinks a little life with each hit',
    knockback: 'hits like a falling wall', pierce: 'cuts through anything in its way', bounce: 'sends waves that ricochet', multishot: 'throws three waves at once' };
  const EL_POWERS = { fire: ['burn'], ice: ['freeze'], lightning: ['chain'], poison: ['lifesteal', 'burn'], earth: ['knockback'], light: ['pierce', 'bounce'],
    shadow: ['lifesteal', 'multishot'], nature: ['lifesteal', 'bounce'], none: ['pierce', 'knockback', 'bounce', 'multishot'] };
  const ARMOUR_LINE = ['Light, but it turns a blade.', 'Heavy and dented from old fights.', 'It fits as if it was made for you.', 'Stitched and patched a hundred times.',
    'Cold to the touch, and very hard.', 'It hums faintly when you are hit.'];
  const STAT_LINE = { health: 'It beats softly, like a second heart.', attack: 'It makes your grip fierce.', defence: 'It hardens your skin like bark.',
    speed: 'It makes your feet feel light.', luck: 'It turns up exactly when you need it.' };
  const EL_STAT = { fire: 'attack', ice: 'defence', lightning: 'speed', poison: 'luck', earth: 'defence', light: 'health', shadow: 'luck', nature: 'health' };

  /* ---------------- Helpers ---------------- */
  function rngFrom(seed) { const r = DF.seeded(String(seed)); const f = () => r(1000000) / 1000000; f.int = (n) => r(n); f.pick = (a) => a[r(a.length)]; return f; }
  function hsl(h, s, l) {
    h = ((h % 360) + 360) % 360; s /= 100; l /= 100;
    const k = (n) => (n + h / 30) % 12, a = s * Math.min(l, 1 - l), f = (n) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
    return '#' + [f(0), f(8), f(4)].map((x) => Math.round(x * 255).toString(16).padStart(2, '0')).join('');
  }
  // The body shape for a creature word ("Wolf" walks on four legs, "Wraith" floats).
  const bodyOf = (noun) => DF.bodyFromWords(noun) || 'biped';
  const fit = (t, n) => (t.length <= n ? t : t.slice(0, n - 1).replace(/[ ,]+\S*$/, '') + '.');
  const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
  const an = (w) => (/^[aeiou]/i.test(w) ? 'An ' : 'A ');

  /* ---------------- The parts ---------------- */
  function theme(R, element) {
    const el = element || R.pick(DF.ELEMENTS), W = EL[el];
    const form = R();
    let name;
    if (form < 0.55) name = R.pick(W.adj) + ' ' + R.pick(W.place);
    else if (form < 0.75) name = 'The ' + R.pick(W.adj) + ' ' + R.pick(W.place);
    else name = R.pick(W.place) + ' of ' + R.pick(W.of);
    let d1 = R.pick(W.desc), d2 = R.pick(W.desc); if (d2 === d1) d2 = '';
    const description = fit(d1 + (d2 && (d1 + ' ' + d2).length <= 90 ? ' ' + d2 : ''), 90);
    const rule = R() < 0.65 ? R.pick(W.rules) : R.pick(DF.RULES);
    const h = W.hue[0] + R() * (W.hue[1] - W.hue[0]);
    const colors = { floor: hsl(h + (R() - 0.5) * 20, 22 + R() * 14, 9 + R() * 4), wall: hsl(h + (R() - 0.5) * 16, 28 + R() * 14, 24 + R() * 8),
      accent: hsl(h + (R() - 0.5) * 24, 80 + R() * 15, 58 + R() * 8), light: hsl(h, 85 + R() * 10, 78 + R() * 8) };
    return { name, description, element: el, rule, colors };
  }
  function monsterColors(R, el) {
    const W = EL[el], h = W.hue[0] + R() * (W.hue[1] - W.hue[0]) + (R() - 0.5) * 30;
    return [hsl(h, 55 + R() * 30, 45 + R() * 15), hsl(h + 20 + R() * 40, 60 + R() * 30, 60 + R() * 15), hsl(h, 40 + R() * 20, 18 + R() * 8), R() < 0.7 ? '#ffffff' : hsl(h + 180, 90, 70)];
  }
  // Monsters come from the bestiary: each creature has its own description, way of fighting and signature ability.
  function monster(R, th, slot, avoid) {
    const tier = slot < 2 ? 1 : slot === 2 ? 2 : (R() < 0.5 ? 2 : 3);
    for (let tries = 0; tries < 30; tries++) {
      const el = R() < 0.7 ? th.element : R.pick(NEIGHBOURS[th.element]), W = EL[el];
      // Mostly creatures made for this slot's strength, sometimes a weaker one.
      const fits = DF.BESTIARY.filter((m) => (!m.el || m.el === el) && m.t <= tier && (m.t === tier || R() < 0.35));
      if (!fits.length) continue;
      const c = R.pick(fits);
      let name = c.el ? c.n : R.pick(W.pre) + ' ' + c.n;
      if (tier >= 2 && c.t < tier && R() < 0.5) name = R.pick(SIZES) + ' ' + name; // a "Hulking" version of a smaller creature
      if (name.length > 24 || avoid.includes(name)) continue;
      const behaviour = R.pick(c.b);
      const abilities = c.a.slice();
      if (tier === 3 && abilities.length < 2 && R() < 0.5) { const a = R.pick(EL_ABILITIES[el]); if (!abilities.includes(a)) abilities.push(a); }
      return { name, description: c.d, colors: monsterColors(R, el), element: el, weakness: DF.NATURAL_WEAKNESS[el], tier, behaviour, abilities,
        special: c.s[0], specialText: c.s[1], body: bodyOf(c.n.split(' ').pop()) };
    }
    return null;
  }
  function boss(R, th, named, avoid) {
    const W = EL[th.element], noun = R.pick(BOSS_NOUNS);
    let name;
    const place = th.name.replace(/^The /, '').split(' of ')[0].split(' ').pop();
    const form = R();
    if (named) name = R.pick(SYL_A) + R.pick(SYL_B) + ' the ' + R.pick(W.pre) + ' ' + noun;
    else if (form < 0.4) name = 'The ' + R.pick(W.adj) + ' ' + noun;
    else if (form < 0.7 && !DF.bodyFromWords(place)) name = noun + ' of the ' + place;
    else if (form < 0.7) name = 'The ' + R.pick(W.adj) + ' ' + noun;
    else name = 'The ' + R.pick(W.pre) + ' ' + R.pick(BOSS_TITLES);
    if (name.length > 24) name = 'The ' + R.pick(W.pre) + ' ' + noun;
    const behaviour = R.pick(['tank', 'summoner', 'shooter', 'chaser', 'trickster']);
    const a1 = R.pick(EL_ABILITIES[th.element]); let a2 = R.pick(DF.ABILITIES.filter((a) => a !== a1 && !['splits when hit', 'mutates', 'burrows'].includes(a)));
    const where = th.name.replace(/^The /, '').split(' of ')[0];
    const description = fit(`Ruler of the ${where}. It ${R.pick(VERBS[behaviour])}.`, 90);
    const prof = DF.bestiaryFor(noun), abilities = [a1, a2];
    if (prof && prof.a[0] && prof.a[0] !== 'mutates' && !abilities.includes(prof.a[0])) abilities[1] = prof.a[0];
    return { name: avoid.includes(name) ? name + ' II' : name, description, colors: monsterColors(R, th.element), element: th.element, weakness: DF.NATURAL_WEAKNESS[th.element], tier: 3, behaviour, abilities, body: bodyOf(noun),
      special: prof ? prof.s[0] : '', specialText: prof ? prof.s[1] : '' };
  }
  function item(R, th, type) {
    const icon = R.pick(DF.ICONS[type]), noun = R.pick(ICON_NOUNS[icon]);
    const elemental = R() < 0.6, el = elemental ? (R() < 0.75 ? th.element : R.pick(NEIGHBOURS[th.element])) : 'none';
    const W = EL[el];
    let name;
    if (!elemental) name = R.pick(PLAIN_MATS) + ' ' + noun;
    else if (R() < 0.25) name = noun + ' of ' + R.pick(W.of);
    else name = R.pick(W.mat) + ' ' + noun;
    const h = el === 'none' ? R() * 360 : W.hue[0] + R() * (W.hue[1] - W.hue[0]);
    const colors = el === 'none' ? [hsl(h, 10 + R() * 15, 60 + R() * 15), hsl(25 + R() * 15, 40, 35)] : [hsl(h, 70 + R() * 25, 55 + R() * 15), hsl(h + 30, 50, 35 + R() * 15)];
    const out = { name, type, icon, element: el, colors, powers: [], stat: '' };
    if (type === 'weapon') {
      const p = R() < 0.75 ? R.pick(EL_POWERS[el]) : R.pick(DF.POWERS); out.powers = [p];
      out.description = fit(`${an(noun)}${noun.toLowerCase()} that ${POWER_FX[p]}.`, 90);
    } else if (type === 'armour') {
      out.description = R.pick(ARMOUR_LINE);
    } else {
      out.stat = R() < 0.6 ? EL_STAT[el] || R.pick(DF.STATS) : R.pick(DF.STATS);
      out.description = STAT_LINE[out.stat];
    }
    return out;
  }

  /* ---------------- A whole floor ---------------- */
  // seed: anything (a number or text). base: an AI theme to build around (its monsters and treasure fill any gaps), or nothing.
  DF.GEN = {
    floor(seed, n, base) {
      const R = rngFrom('deepforge-gen|' + seed);
      const th = base ? { name: base.name, description: base.description, element: base.element, rule: base.rule, colors: base.colors } : theme(R);
      const avoid = [], monsters = [];
      for (let i = 0; i < 4; i++) { const m = monster(R, th, i, avoid); monsters.push(m); avoid.push(m.name); }
      const b = boss(R, th, n % 5 === 0, avoid);
      const loot = [0, 1, 2, 3, 4, 5].map((i) => item(R, th, DF.ITEM_TYPES[i % 3]));
      return Object.assign({}, th, { monsters, boss: b, loot, generated: true });
    },
    theme: (seed, element) => theme(rngFrom('deepforge-theme|' + seed), element),
  };
}(window.DF));
