/* Deepforge: fixed lists, the handmade fallback pool, room layouts and pixel pictures.
   Everything the AI invents is picked from these lists, so the game can always run it. */
window.DF = window.DF || {};
(function (DF) {
  'use strict';

  DF.ELEMENTS = ['fire', 'ice', 'lightning', 'poison', 'earth', 'light', 'shadow', 'nature'];
  DF.EL_COLOR = { fire: '#ff7a2a', ice: '#8fe3ff', lightning: '#ffe14a', poison: '#a6ff4a', earth: '#d29a5c', light: '#fff1b0', shadow: '#b48bff', nature: '#5fe07a', none: '#d8d4dc' };
  // The weakness a monster gets when the AI's pick doesn't make sense.
  DF.NATURAL_WEAKNESS = { fire: 'ice', ice: 'fire', lightning: 'earth', poison: 'light', earth: 'nature', light: 'shadow', shadow: 'light', nature: 'fire' };

  DF.BEHAVIOURS = ['chaser', 'shooter', 'ambusher', 'swarm', 'tank', 'summoner', 'trickster'];
  DF.BEHAVIOUR_TEXT = {
    chaser: 'Runs straight at you.', shooter: 'Keeps its distance and shoots.', ambusher: 'Hides until you come close.',
    swarm: 'Comes in a pack.', tank: 'Slow and tough, then charges.', summoner: 'Calls little helpers.', trickster: 'Blinks from place to place.',
  };
  DF.ABILITIES = ['fire trail', 'splits when hit', 'explodes on death', 'freezes floor', 'heals friends', 'shields', 'poisons', 'pulls you in'];
  DF.POWERS = ['pierce', 'bounce', 'chain', 'lifesteal', 'burn', 'freeze', 'knockback', 'multishot'];
  DF.POWER_TEXT = {
    pierce: 'Swings send out a blade wave that passes through foes.', bounce: 'Swings send out a blade wave that bounces off walls.',
    chain: 'Hits arc lightning to nearby foes.', lifesteal: 'Hits heal you a little.', burn: 'Hits set foes on fire.',
    freeze: 'Hits slow foes down.', knockback: 'Hits knock foes far back.', multishot: 'Swings send out three blade waves.',
  };
  DF.ITEM_TYPES = ['weapon', 'armour', 'trinket'];
  // Spell scrolls. The Mage learns them for good (paid with mana); the Knight gets a few charges to read aloud.
  DF.SPELLS = {
    frost: { name: 'Frost Ring', short: 'Frost', el: 'ice', cost: 20, cd: 1.2, text: 'A ring of ice bursts out around you, hurting and slowing everything close.' },
    chain: { name: 'Chain Lightning', short: 'Chain', el: 'lightning', cost: 18, cd: 0.8, text: 'Lightning strikes the nearest foe and jumps to up to four more.' },
    meteor: { name: 'Meteor', short: 'Meteor', el: 'fire', cost: 30, cd: 1.5, text: 'A falling star crashes down on the nearest foe and sets everything nearby alight.' },
    seekers: { name: 'Seeker Swarm', short: 'Seekers', el: 'shadow', cost: 22, cd: 1, text: 'Five dark sparks fly out and hunt down your foes.' },
    mend: { name: 'Mending', short: 'Mend', el: 'nature', cost: 30, cd: 5, text: 'Heals a quarter of your health and cures poison.' },
    ward: { name: 'Stone Ward', short: 'Ward', el: 'earth', cost: 25, cd: 6, text: 'Nothing can hurt you for two seconds.' },
  };
  DF.SCROLL_CHARGES = 3;
  // Who made the music. Fill in any blanks here: the Credits list in Settings reads from this.
  DF.MUSIC_CREDITS = [
    { use: 'Camp', title: 'Spooky Dungeon', by: 'Memoraphile @ You\u2019re Perfect Studio', license: 'CC0', url: 'https://opengameart.org/content/spooky-dungeon' },
    { use: 'Exploring', title: 'The Catacombs', by: 'Cal McEachern (Trex0n)', license: 'CC-BY 4.0', url: 'https://opengameart.org/content/chiptune-rpg-soundtrack-6-loops' },
    { use: 'Exploring', title: 'Accurate NES looping track 120 bpm C mixolydian', by: 'Hobgoblin', license: 'CC-BY-SA 4.0', url: 'https://opengameart.org/content/accurate-nes-looping-track-120-bpm-c-mixolydian' },
    { use: 'Exploring', title: 'No Enemies Here', by: 'Cal McEachern (Trex0n)', license: 'CC-BY 4.0', url: 'https://opengameart.org/content/chiptune-rpg-soundtrack-6-loops' },
    { use: 'Fights', title: '8-Bit Battle Loop', by: 'Wolfgang_ (Theodore Kerr)', license: 'CC0', url: 'https://opengameart.org/content/8-bit-battle-loop' },
    { use: 'Fights', title: '8-Bit RPG Battle/Encounter Theme', by: 'Wolfgang_ (Ted Kerr)', license: 'CC0', url: 'https://opengameart.org/content/8-bit-rpg-battleencounter-theme' },
    { use: 'Bosses', title: 'Suez Crisis Remade', by: 'Spring Spring (Julie Damsgaard)', license: 'CC0', url: 'https://opengameart.org/content/suez-crisis-remade' },
    { use: 'Boss beaten', title: 'Victory', by: 'celestialghost8', license: 'CC0', url: 'https://opengameart.org/content/victory' },
  ];
  DF.ICONS = {
    weapon: ['sword', 'axe', 'hammer', 'spear', 'dagger', 'mace'],
    armour: ['helm', 'chestplate', 'shield', 'boots', 'cloak', 'gauntlets'],
    trinket: ['ring', 'amulet', 'gem', 'orb', 'charm', 'feather'],
  };
  DF.ALL_ICONS = [].concat(DF.ICONS.weapon, DF.ICONS.armour, DF.ICONS.trinket);
  DF.STATS = ['health', 'attack', 'defence', 'speed', 'luck'];
  DF.RULES = ['darkness', 'slippery floors', 'hazard pools', 'swift foes', 'rich veins', 'healing springs'];
  DF.RULE_TEXT = {
    'darkness': 'Your torch barely reaches.', 'slippery floors': 'The floor is slick; you slide.', 'hazard pools': 'Dangerous pools hurt to stand in.',
    'swift foes': 'Monsters move faster here.', 'rich veins': 'Twice the gold.', 'healing springs': 'Glowing springs heal you.',
  };
  DF.BODIES = ['walker', 'biped', 'blob', 'ghost', 'bat', 'bird', 'serpent', 'spider', 'bug', 'crab', 'octopus', 'jelly', 'frog', 'flame',
    'cloud', 'orb', 'spiky', 'mushroom', 'tree', 'flower', 'fish', 'snail', 'bee', 'flutter', 'star', 'horse',
    'skeleton', 'zombie', 'goblin', 'orc', 'cultist', 'knight', 'imp', 'demon', 'mimic', 'snake', 'bonebeast', 'golem', 'lizardman', 'troll',
    'minotaur', 'vampire', 'mummy', 'lich', 'wizard', 'rogue', 'archer', 'spearman', 'shieldbearer', 'medusa', 'gargoyle', 'harpy', 'wraith',
    'banshee', 'reaper', 'ghoul', 'scorpion', 'beetle', 'centipede', 'worm', 'wasp', 'lobster', 'shark', 'angler', 'mindflayer', 'eyeball',
    'beholder', 'horror', 'flytrap', 'crystal', 'tentacle', 'slug', 'basilisk', 'blade', 'slime'];
  DF.RARITY = ['Common', 'Uncommon', 'Rare', 'Epic', 'Legendary'];
  DF.RAR_COLOR = ['#cfc8d2', '#72e07e', '#5aaaff', '#c873ff', '#ffb43a'];
  DF.RAR_MULT = [1, 1.3, 1.65, 2.05, 2.6];
  DF.POWER_COUNT = [[0, 1], [1, 1], [1, 2], [2, 2], [2, 3]]; // min and max powers per rarity

  /* ---- The fallback pool: six handmade floors so the game never waits for the AI ---- */
  const M = (name, description, colors, element, weakness, tier, behaviour, abilities) => ({ name, description, colors, element, weakness, tier, behaviour, abilities });
  const I = (name, description, type, icon, element, powers, colors, stat) => ({ name, description, type, icon, element, powers, colors, stat: stat || '' });
  DF.FALLBACK_THEMES = [
    {
      name: 'Lava Cave', description: 'Rivers of magma glow between cracked black rocks.', element: 'fire', rule: 'hazard pools',
      colors: { floor: '#3b1f19', wall: '#6e3122', accent: '#ff6a2a', light: '#ffb070' },
      monsters: [
        M('Ember Bat', 'Flaps out of the smoke with burning wings.', ['#ff7a2a', '#ffd23a', '#7a2a12', '#fff3c0'], 'fire', 'ice', 1, 'chaser', []),
        M('Magma Slime', 'A hot glob that splits into smaller globs.', ['#ff5a1a', '#ffb02a', '#7a1a0a', '#fff3c0'], 'fire', 'ice', 2, 'chaser', ['splits when hit']),
        M('Cinder Imp', 'Throws fireballs and leaves burning footprints.', ['#c8402a', '#ff9a3a', '#3a1210', '#ffe14a'], 'fire', 'ice', 2, 'shooter', ['fire trail']),
        M('Ash Beetle', 'Grey beetles that scuttle in hungry packs.', ['#6a5e5a', '#ff7a2a', '#2a2220', '#ffd23a'], 'earth', 'nature', 1, 'swarm', []),
      ],
      boss: M('Molten Golem', 'A walking furnace. It bursts when it falls.', ['#ff5a1a', '#4a2a22', '#ffb02a', '#fff3c0'], 'fire', 'ice', 3, 'tank', ['fire trail', 'explodes on death']),
      loot: [
        I('Ember Blade', 'A sword that never cools.', 'weapon', 'sword', 'fire', ['burn'], ['#ff7a2a', '#ffd23a']),
        I('Obsidian Plate', 'Black glass armour, sharp and strong.', 'armour', 'chestplate', 'earth', [], ['#3a3048', '#9a7aff']),
        I('Cinder Charm', 'A warm stone that makes you fierce.', 'trinket', 'charm', 'fire', [], ['#ff9a3a', '#7a2a12'], 'attack'),
        I('Magma Maul', 'Each swing hits like a landslide.', 'weapon', 'hammer', 'fire', ['knockback'], ['#ff5a1a', '#5a2a1a']),
      ],
    },
    {
      name: 'Frozen Library', description: 'Shelves of icy books stretch into the frost.', element: 'ice', rule: 'slippery floors',
      colors: { floor: '#1c2838', wall: '#3c5878', accent: '#8fe3ff', light: '#cdeeff' },
      monsters: [
        M('Frost Moth', 'Its wings shed snow as it blinks about.', ['#cdeeff', '#8fe3ff', '#3a5a7a', '#ffffff'], 'ice', 'fire', 1, 'trickster', []),
        M('Ink Wisp', 'Spilled ink that waits in the shadows.', ['#3a2a5a', '#b48bff', '#1a1028', '#ffffff'], 'shadow', 'light', 1, 'ambusher', []),
        M('Book Golem', 'Stacked tomes with a shield of old pages.', ['#8a6a4a', '#e8d8b0', '#4a3020', '#8fe3ff'], 'earth', 'fire', 2, 'tank', ['shields']),
        M('Icicle Star', 'Spins and spits shards of ice.', ['#bff0ff', '#5ab8e0', '#2a4a6a', '#ffffff'], 'ice', 'fire', 2, 'shooter', ['freezes floor']),
      ],
      boss: M('The Frost Wizard', 'Keeper of the cold books, guarded by snow.', ['#5a7aff', '#cdeeff', '#2a2a5a', '#ffffff'], 'ice', 'fire', 3, 'summoner', ['freezes floor', 'shields']),
      loot: [
        I('Frostbite Dagger', 'Quick and cold as a winter night.', 'weapon', 'dagger', 'ice', ['freeze'], ['#bff0ff', '#5ab8e0']),
        I('Scholar Cloak', 'Woven with quiet, warming words.', 'armour', 'cloak', 'light', [], ['#5a4a8a', '#ffe9a8']),
        I('Snowglass Ring', 'A ring of ice that never melts.', 'trinket', 'ring', 'ice', [], ['#cdeeff', '#5ab8e0'], 'defence'),
        I('Glacier Spear', 'A long icicle that pierces through.', 'weapon', 'spear', 'ice', ['pierce'], ['#8fe3ff', '#3a5a7a']),
      ],
    },
    {
      name: 'Candy Crypt', description: 'Sugar-glazed tombs that smell sweetly of danger.', element: 'poison', rule: 'rich veins',
      colors: { floor: '#3a2036', wall: '#7a3a68', accent: '#ff8ad8', light: '#ffd0f0' },
      monsters: [
        M('Gumdrop Slime', 'Bouncy and sour. Hit it and it splits.', ['#7aff6a', '#ff8ad8', '#2a7a3a', '#ffffff'], 'poison', 'light', 1, 'chaser', ['splits when hit']),
        M('Licorice Snake', 'A black twisty sweet with a nasty bite.', ['#2a1a2a', '#ff4a8a', '#000000', '#ff8ad8'], 'shadow', 'light', 2, 'chaser', ['poisons']),
        M('Candy Ghost', 'Floats unseen until it grins at you.', ['#ffd0f0', '#ff8ad8', '#8a4a7a', '#3a1a3a'], 'light', 'shadow', 1, 'ambusher', []),
        M('Toffee Golem', 'Chewy, sticky and very hard to hurt.', ['#c8803a', '#ffd08a', '#6a3a1a', '#ffffff'], 'earth', 'fire', 2, 'tank', ['shields']),
      ],
      boss: M('Sugar Skeleton King', 'Rules the crypt and calls sweet servants.', ['#fff0f8', '#ff8ad8', '#8a4a7a', '#7aff6a'], 'poison', 'light', 3, 'summoner', ['poisons', 'heals friends']),
      loot: [
        I('Peppermint Mace', 'A minty club that sends foes flying.', 'weapon', 'mace', 'ice', ['knockback'], ['#ffffff', '#ff3a5a']),
        I('Gingerbread Shield', 'Crunchy, but it holds.', 'armour', 'shield', 'earth', [], ['#c8803a', '#ffffff']),
        I('Sour Drop Gem', 'A lucky sweet that never dissolves.', 'trinket', 'gem', 'poison', [], ['#a6ff4a', '#2a7a3a'], 'luck'),
        I('Candy Cane Spear', 'Throws three sugary waves at once.', 'weapon', 'spear', 'light', ['multishot'], ['#ffffff', '#ff3a5a']),
      ],
    },
    {
      name: 'Clockwork Tomb', description: 'Brass gears tick in the dark like a heartbeat.', element: 'lightning', rule: 'swift foes',
      colors: { floor: '#26231c', wall: '#5c4a2a', accent: '#ffcf4a', light: '#ffe9a8' },
      monsters: [
        M('Cog Spider', 'A wind-up spider that pops when broken.', ['#c8a04a', '#6a5a3a', '#3a2a1a', '#ffe14a'], 'lightning', 'earth', 1, 'chaser', ['explodes on death']),
        M('Tick Beetle', 'Tiny brass bugs that come in swarms.', ['#d8b04a', '#7a5a2a', '#2a1a0a', '#ffffff'], 'lightning', 'earth', 1, 'swarm', []),
        M('Brass Sentinel Bot', 'Fires sparks and hides behind a shield.', ['#b8903a', '#ffe14a', '#4a3a1a', '#5affff'], 'lightning', 'earth', 2, 'shooter', ['shields']),
        M('Spark Bat', 'Zaps from place to place in a flash.', ['#ffe14a', '#5a4a8a', '#2a2a3a', '#ffffff'], 'lightning', 'earth', 1, 'trickster', []),
      ],
      boss: M('The Gear Mummy', 'Wrapped in springs, it drags you close.', ['#c8b88a', '#ffcf4a', '#4a3a2a', '#5affff'], 'lightning', 'earth', 3, 'tank', ['pulls you in', 'shields']),
      loot: [
        I('Volt Hammer', 'Lightning leaps from every hit.', 'weapon', 'hammer', 'lightning', ['chain'], ['#ffe14a', '#5a4a3a']),
        I('Gearplate Helm', 'Ticks softly when danger is near.', 'armour', 'helm', 'earth', [], ['#c8a04a', '#5a4a3a']),
        I('Ticking Amulet', 'Makes your feet move faster.', 'trinket', 'amulet', 'lightning', [], ['#ffcf4a', '#5affff'], 'speed'),
        I('Arc Spear', 'A spear that crackles with sparks.', 'weapon', 'spear', 'lightning', ['pierce'], ['#5affff', '#ffe14a']),
      ],
    },
    {
      name: 'Mushroom Hollow', description: 'Giant glowing mushrooms light a damp green cave.', element: 'nature', rule: 'healing springs',
      colors: { floor: '#1e2a1c', wall: '#3c4c2a', accent: '#9cff6a', light: '#d6ffb0' },
      monsters: [
        M('Spore Mushroom', 'Puffs poison spores from afar.', ['#c84a8a', '#ffd0e0', '#5a2a3a', '#ffffff'], 'poison', 'fire', 1, 'shooter', ['poisons']),
        M('Moss Frog', 'Hops out of the moss to bite.', ['#5fe07a', '#c8ff8a', '#1a4a2a', '#ffe14a'], 'nature', 'fire', 1, 'chaser', []),
        M('Glow Snail', 'Slow and kind to its friends, not to you.', ['#9cff6a', '#d6ffb0', '#3a5a2a', '#ffffff'], 'nature', 'fire', 2, 'tank', ['heals friends']),
        M('Spore Mite', 'Little mites that tumble out in clouds.', ['#c8b84a', '#9cff6a', '#3a3a1a', '#ffffff'], 'poison', 'light', 1, 'swarm', []),
      ],
      boss: M('The Rotwood Tree', 'An old tree that heals its forest.', ['#5a4a2a', '#9cff6a', '#2a1a0a', '#ffe14a'], 'nature', 'fire', 3, 'summoner', ['poisons', 'heals friends']),
      loot: [
        I('Thornwood Axe', 'Drinks a little life with each chop.', 'weapon', 'axe', 'nature', ['lifesteal'], ['#5fe07a', '#6a4a2a']),
        I('Bark Cloak', 'Rough bark that turns aside blows.', 'armour', 'cloak', 'nature', [], ['#6a4a2a', '#9cff6a']),
        I('Spore Charm', 'A tough little mushroom that keeps you going.', 'trinket', 'charm', 'poison', [], ['#c84a8a', '#ffd0e0'], 'health'),
        I('Sporeling Dagger', 'Each stab throws three spore waves.', 'weapon', 'dagger', 'poison', ['multishot'], ['#a6ff4a', '#5a2a3a']),
      ],
    },
    {
      name: 'Sunken Temple', description: 'Water drips through ruins swallowed by the sea.', element: 'shadow', rule: 'darkness',
      colors: { floor: '#15232b', wall: '#1f4452', accent: '#4ae0d0', light: '#a8fff4' },
      monsters: [
        M('Drowned Jellyfish', 'Drifts and blinks, tugging you near.', ['#b48bff', '#4ae0d0', '#3a2a6a', '#ffffff'], 'shadow', 'light', 2, 'trickster', ['pulls you in']),
        M('Coral Crab', 'Hides behind a shell of hard coral.', ['#ff6a5a', '#ffb0a0', '#6a2a2a', '#ffffff'], 'earth', 'nature', 2, 'tank', ['shields']),
        M('Abyss Eel', 'A long dark eel that hunts fast.', ['#1a3a4a', '#4ae0d0', '#0a1a2a', '#ffe14a'], 'shadow', 'light', 1, 'chaser', []),
        M('Lantern Fish', 'Its light switches off until it bites.', ['#2a4a6a', '#fff1b0', '#0a1a2a', '#fff1b0'], 'light', 'shadow', 1, 'ambusher', []),
      ],
      boss: M('The Tide Kraken', 'Ink and ice pour from its arms.', ['#5a2a8a', '#4ae0d0', '#2a1040', '#ffe14a'], 'shadow', 'light', 3, 'shooter', ['pulls you in', 'freezes floor']),
      loot: [
        I('Trident of Tides', 'Sends three waves at once.', 'weapon', 'spear', 'ice', ['multishot'], ['#4ae0d0', '#1f4452']),
        I('Shell Shield', 'A big shell, smooth and hard.', 'armour', 'shield', 'earth', [], ['#ffb0a0', '#6a2a2a']),
        I('Pearl Amulet', 'A sea pearl that keeps you alive.', 'trinket', 'amulet', 'light', [], ['#ffffff', '#4ae0d0'], 'health'),
        I('Abyssal Dagger', 'Steals a little life with each cut.', 'weapon', 'dagger', 'shadow', ['lifesteal'], ['#b48bff', '#1a1028']),
      ],
    },
  ];
  // What you start every run with.
  DF.STARTERS = {
    knight: {
      weapon: I('Old Sword', 'Your trusty, slightly rusty sword.', 'weapon', 'sword', 'none', [], ['#c8c8d8', '#8a6a4a']),
      armour: I('Padded Tunic', 'Better than nothing. Just.', 'armour', 'chestplate', 'none', [], ['#5a6ab8', '#c8c8d8']),
    },
    mage: {
      weapon: I('Apprentice Wand', 'A twig that hums with a little magic.', 'weapon', 'wand', 'none', [], ['#c9a8ff', '#8a5a32']),
      armour: I('Apprentice Robe', 'Soft cloth stitched with tiny stars.', 'armour', 'cloak', 'none', [], ['#4a35a8', '#ffd66a']),
    },
    ranger: {
      weapon: I('Hunting Bow', 'Yew and gut string. It has seen a lot of rabbits.', 'weapon', 'bow', 'none', [], ['#a0703a', '#e8e0c8']),
      armour: I('Leaf Cloak', 'Green, quiet, and smells of the woods.', 'armour', 'cloak', 'none', [], ['#3a8a4a', '#c8a040']),
    },
    tinkerer: {
      weapon: I('Pipe Wrench', 'Fixes things. Also unfixes them.', 'weapon', 'wrench', 'none', [], ['#9aa4b8', '#c84a2a']),
      armour: I('Work Apron', 'Thick leather, full of pockets, full of bolts.', 'armour', 'chestplate', 'none', [], ['#8a5a32', '#c8a040']),
    },
  };
  DF.STARTER = DF.STARTERS.knight;
  // The heroes you can play. More can join later.
  DF.CLASSES = {
    knight: { name: 'Knight', hp: 30, atk: 4, spd: 42, mana: 0,
      blurb: 'Sword and shield. Strong up close; a shield bash knocks foes back and blocks shots.',
      moves: ['Swing: a sword arc, auto-aimed', 'Bash: charge with your shield'] },
    mage: { name: 'Mage', hp: 22, atk: 5, spd: 44, mana: 40,
      blurb: 'Fights from range with magic bolts and slips out of danger. Fragile, so keep moving.',
      moves: ['Cast: a magic bolt, auto-aimed', 'Blink: teleport a short hop', 'Nova: a ring of shards (25 mana)'] },
    ranger: { name: 'Ranger', hp: 26, atk: 4, spd: 48, mana: 0,
      blurb: 'The quickest hero. Long-range arrows, a dodge roll, and a volley that fills the air.',
      moves: ['Shoot: a fast arrow, auto-aimed', 'Roll: dodge, nothing can hit you mid-roll', 'Volley: a fan of seven arrows (every 4s)'] },
    tinkerer: { name: 'Tinkerer', hp: 28, atk: 4, spd: 42, mana: 0,
      blurb: 'Builds little turrets that fight for you, and throws bombs. Clever, not tough.',
      moves: ['Whack: a wrench swing, auto-aimed', 'Turret: build one that shoots foes (2 at once)', 'Bomb: lob a bomb that blasts a crowd (every 3.5s)'] },
  };
  // Words that steer each theme the AI dreams up, so the shared cache fills with varied floors.
  DF.THEME_SEEDS_A = ['lava', 'frost', 'candy', 'clockwork', 'mushroom', 'sunken', 'crystal', 'bone', 'library', 'storm', 'honey', 'mirror',
    'garden', 'sand', 'cloud', 'toy', 'ink', 'moon', 'swamp', 'iron', 'jungle', 'glass', 'coral', 'ember', 'ghost', 'star', 'pumpkin', 'circus',
    'amber', 'thunder', 'moss', 'salt', 'velvet', 'copper', 'ash', 'pearl', 'thorn', 'snow', 'gold', 'shadow'];
  DF.THEME_SEEDS_B = ['cave', 'tomb', 'temple', 'vault', 'kitchen', 'mine', 'castle', 'hollow', 'sewer', 'garden', 'forge', 'catacomb', 'museum',
    'market', 'ship', 'tower', 'den', 'palace', 'cellar', 'bath', 'workshop', 'nest', 'chapel', 'prison', 'lab', 'arena', 'grotto', 'archive'];

  /* ---- Room shapes: 13 x 9 inside the walls. # = block, ~ = pit, h = hazard spot (only on hazard floors), * = spring/torch spot ---- */
  DF.ROOMS = [
    ['.............', '.............', '.............', '.............', '.............', '.............', '.............', '.............', '.............'],
    ['.............', '.#.........#.', '.............', '.............', '......h......', '.............', '.............', '.#.........#.', '.............'],
    ['.............', '.............', '...#.....#...', '.............', '.....hhh.....', '.............', '...#.....#...', '.............', '.............'],
    ['.............', '..##.....##..', '..#.......#..', '.............', '......*......', '.............', '..#.......#..', '..##.....##..', '.............'],
    ['.............', '.............', '..~~~...~~~..', '..~~~...~~~..', '.............', '..~~~...~~~..', '..~~~...~~~..', '.............', '.............'],
    ['.............', '.h.........h.', '....#...#....', '....#...#....', '.............', '....#...#....', '....#...#....', '.h.........h.', '.............'],
    ['.............', '.............', '.....###.....', '.....#*#.....', '.....#.#.....', '.............', '.............', '.............', '.............'],
    ['.............', '.#.#.....#.#.', '.............', '.#.......#.h.', '.............', '.#.......#...', '.............', '.#.#.....#.#.', '.............'],
    ['.............', '.............', '..hh.....hh..', '..h.......h..', '......#......', '..h.......h..', '..hh.....hh..', '.............', '.............'],
    ['.............', '.~~.......~~.', '.~~.......~~.', '.............', '.....*.*.....', '.............', '.~~.......~~.', '.~~.......~~.', '.............'],
    ['.............', '.............', '.#####.#####.', '.............', '.............', '.............', '.#####.#####.', '.............', '.............'],
    ['.............', '...#.....#...', '.............', '#...#...#...#', '.............', '#...#...#...#', '.............', '...#.....#...', '.............'],
  ];

  /* ---- Pixel pictures. Letters are colours, "." is see-through. ---- */
  // The Knight, front view, two walking frames. a steel, b dark steel, c plume, d visor, e tunic, f boots, g skin of the visor glint.
  DF.KNIGHT = [
    ['..cc..', '.aaaa.', '.adda.', '.abba.', 'eeeeee', 'beaaeb', '.eeee.', '.a..a.', '.f..f.'],
    ['..cc..', '.aaaa.', '.adda.', '.abba.', 'eeeeee', 'beaaeb', '.eeee.', '.a..a.', 'f....f'],
  ];
  DF.KNIGHT_COLORS = { a: '#cfd6e6', b: '#7d88a3', c: '#e2483f', d: '#1a1c2a', e: '#3d63c8', f: '#6a4632' };
  // The Mage: pointed hat (c), face (a) and eyes (d), robe (e) with gold trim (b), boots (f).
  DF.MAGE = [
    ['..c...', '.ccc..', '.cccc.', 'cccccc', '.dada.', 'eeeeee', '.ebbe.', '.eeee.', '.e..e.', '.f..f.'],
    ['..c...', '.ccc..', '.cccc.', 'cccccc', '.dada.', 'eeeeee', '.ebbe.', '.eeee.', '.e..e.', 'f....f'],
  ];
  DF.MAGE_COLORS = { a: '#f0c8a0', b: '#ffd66a', c: '#6a4ad8', d: '#1a1c2a', e: '#4a35a8', f: '#2a2040' };
  DF.RANGER = [
    ['.ccr..', '.cccc.', 'cccccc', '.kadad', 'geeeee', 'geebee', '.hhhh.', '.h..h.', '.f..f.'],
    ['.ccr..', '.cccc.', 'cccccc', '.kadad', 'geeeee', 'geebee', '.hhhh.', '.h..h.', 'f....f'],
  ];
  // Leather hat (c) with a white feather (r), hair (k), face (a) and eyes (d), green tunic (e), gold buckle (b), brown pants (h), boots (f), quiver (g).
  DF.RANGER_COLORS = { a: '#e3b48a', b: '#c89a3a', c: '#9a7040', d: '#1a1c2a', e: '#3f7a3a', f: '#3a2614', g: '#8a5a32', h: '#7a5232', k: '#6a4a2a', r: '#f0e8d0' };
  // The Tinkerer: leather cap (b), brass goggles (g), shirt (c), a big apron (e), boots (f).
  DF.TINKERER = [
    ['.bbbb.', 'bbbbbb', '.gagg.', '.aaaa.', 'ceeeec', 'ceeeec', '.eeee.', '.c..c.', '.f..f.'],
    ['.bbbb.', 'bbbbbb', '.gagg.', '.aaaa.', 'ceeeec', 'ceeeec', '.eeee.', '.c..c.', 'f....f'],
  ];
  DF.TINKERER_COLORS = { a: '#e8b890', b: '#6a4a2a', c: '#4a6a9a', d: '#1a1c2a', e: '#8a5a32', f: '#3a2a1a', g: '#ffcf4a' };
  DF.HEROES = { knight: { rows: DF.KNIGHT, colors: DF.KNIGHT_COLORS }, mage: { rows: DF.MAGE, colors: DF.MAGE_COLORS },
    ranger: { rows: DF.RANGER, colors: DF.RANGER_COLORS }, tinkerer: { rows: DF.TINKERER, colors: DF.TINKERER_COLORS } };
  // Item icons, 8 x 8. a main colour, b second colour, c handle (wood), d dark edge, e shine.
  DF.ICON_PIX = {
    sword: ['......ea', '.....eaa', '....eaa.', '...eaa..', '.b.aa...', '..bb....', '.c.b....', 'c.......'],
    axe: ['....aa..', '...aaab.', '...aacb.', '....c.b.', '...c....', '..c.....', '.c......', 'c.......'],
    hammer: ['...aaaa.', '...aeaa.', '...aaaa.', '....cc..', '...c....', '..c.....', '.c......', 'c.......'],
    spear: ['.....eaa', '......ab', '.....b.a', '....c...', '...c....', '..c.....', '.c......', 'c.......'],
    dagger: ['........', '.....ea.', '....eaa.', '...eaa..', '..baa...', '..bb....', '.c......', '........'],
    mace: ['....a.a.', '...aaaaa', '....aea.', '...aaaaa', '...cbab.', '..c.....', '.c......', 'c.......'],
    helm: ['..aaaa..', '.aeaaaa.', 'aaaaaaaa', 'aadddda.', 'aadddda.', 'aa.bb.aa', 'a......a', '........'],
    chestplate: ['.aa..aa.', 'aaaaaaaa', 'aaeaaaaa', '.aaabaa.', '.aaabaa.', '.aaabaa.', '.aaaaaa.', '..dddd..'],
    shield: ['aaaaaaaa', 'abbbbbba', 'abbebbba', 'abbbbbba', '.abbbba.', '.abbbba.', '..abba..', '...aa...'],
    boots: ['..aa....', '..aa....', '..aa....', '..aa....', '..aab...', '..aaaaa.', '.aaaaaa.', '.dddddd.'],
    cloak: ['...bb...', '..aaaa..', '.aaaaaa.', '.aeaaaa.', 'aaaaaaaa', 'aaaaaaaa', 'aaaaaaaa', 'a.a..a.a'],
    gauntlets: ['.a.a.a..', '.a.a.a..', '.aaaaa.a', '.aeaaaaa', '.aaaaaa.', '.aaaaa..', '.bbbbb..', '.bbbbb..'],
    ring: ['...bb...', '..beeb..', '..aaaa..', '.a....a.', '.a....a.', '.a....a.', '..aaaa..', '........'],
    amulet: ['.c....c.', '..c..c..', '...cc...', '..aaaa..', '.aebbaa.', '.abbbba.', '..aaaa..', '...aa...'],
    gem: ['........', '..aaaa..', '.aeaaab.', 'aeaaaabb', '.aaaabb.', '..aabb..', '...ab...', '........'],
    orb: ['..aaaa..', '.aeeaaa.', 'aaeaaaab', 'aaaaaaab', 'aaaaaabb', '.aaabbb.', '..cccc..', '.cccccc.'],
    charm: ['...c....', '..c.c...', '..aaa...', '.aaeaa..', '.abbba..', '..aba...', '...a....', '........'],
    feather: ['......ea', '.....eaa', '....eaab', '...eaab.', '..aaab..', '..abb...', '.c......', 'c.......'],
    bow: ['....aa..', '...a..b.', '..a...b.', '.a....b.', '.a....b.', '..a...b.', '...a..b.', '....aa..'],
    wrench: ['.....aa.', '....a..a', '.....a.a', '....aaa.', '...a....', '..b.....', '.b......', 'b.......'],
    wand: ['......e.', '.....eae', '......e.', '....c...', '...c....', '..c.....', '.c......', 'c.......'],
    scroll: ['........', '.bbbbbb.', '.aaaaaa.', '.adaada.', '.aaaaaa.', '.addaaa.', '.bbbbbb.', '........'],
    potion: ['...dd...', '...bb...', '..b..b..', '.baaaab.', 'baeaaaab', 'baaaaaab', '.baaaab.', '..bbbb..'],
    coin: ['.aaaa.', 'aeaaab', 'aaebab', 'aabaab', 'aaaaab', '.abbb.'],
  };
}(window.DF));
