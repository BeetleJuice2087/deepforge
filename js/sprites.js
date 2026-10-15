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
    // The creature word that ends last wins (on a tie, the later list), so "Bone Hound" is a bone beast and "Ember Snake" a snake.
    for (const [k, re] of BODY_WORDS) { re.lastIndex = 0; let m; while ((m = re.exec(text))) { const end = m.index + m[0].length; if (end >= at) { at = end; best = k; } } }
    return best;
  }
  DF.bodyFromWords = (text) => lastBody(String(text || '').toLowerCase()); // '' when no creature word is found
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
  // Monster shapes redrawn from the ChatGPT and Gemini sheets (4 colours: a body, b second, c dark, d eyes/teeth).
  const MORE_SHAPES = {
    skeleton: [["..aaa...", ".aaaaa..", ".adada.b", "..aaa..b", ".aaaaaab", "a.cac..c", "..aca...", "..a.a...", ".aa.aa.."]],
    zombie: [["..aaa...", ".aaaa...", ".adad...", ".aaaaaaa", ".bbbb...", ".bcbb...", ".cccc...", ".c..c...", "cc.cc..."]],
    goblin: [["a.aaa.a.", ".aaaaa..", ".adaad..", "..aaa..c", ".bbbbbac", ".bbbb...", "..c.c..."]],
    orc: [["..aaaa...", ".aaaaaa..", ".adaada..", ".abaaba.c", "aabbbbaac", "a.bbbb..c", "..bccb..c", "..c..c...", ".cc..cc.."]],
    cultist: [["..aaa..b.", ".aaaaa.bb", ".acdcda.c", ".accca..c", ".aaaaaaac", ".aaaaa..c", "aaaaaaa.c", "aaaaaaa.."]],
    knight: [["...bb...", "..aaaa..", "..addc..", "bbaaaa.a", "bbaaaaaa", "bbaaaa.c", "..a..a..", ".cc..cc."]],
    imp: [[".b...b.", ".aaaaa.", ".adada.", "aaaaaaa", "c.aaa.c", "..a.a..", "..c.c.."]],
    demon: [["b.......b", ".b.aaa.b.", "..aaaaa..", "..adada..", "caaaaaaac", "cc.aaa.cc", "c..aaa..c", "...a.a...", "..cc.cc.."]],
    slime: [["...aa...", "..abaa..", ".aaaaaa.", ".adaada.", "aaaaaaaa", "aaaaaaaa", ".cccccc."]],
    mimic: [[".bbbbbbb.", "baaaaaaab", "adcdcdcda", "ccccccccc", "adcdcdcda", "baaaaaaab", "bbbbbbbbb"]],
    snake: [["..aaaa.", ".aaadac", ".aa....", "..aaa..", "....aa.", ".....aa", "a...aa.", ".aaaa.."]],
    bonebeast: [["......aaa", "......ada", "a....aa.c", ".aaaaaa..", ".acacac..", ".a..a.a..", "a...a..a."]],
    golem: [["...aaa...", "..adada..", ".aaaaaaa.", "aaabbbaaa", "aa.bbb.aa", "aa.aaa.aa", "...a.a...", "..aa.aa.."]],
    lizardman: [[".....aa.", "....aada", "....aaa.", "..baaaa.", ".bbaaaac", "a.baa..c", "aa.a.a.c", "...c.c.."]],
    troll: [["..aaaa...", ".aadada..", ".aaaaaa..", "aaaaaaaa.", "aabbbbaa.", "a.bbbb.ac", "a.cccc..c", "..a..a...", ".aa..aa.."]],
    minotaur: [["b......b.", ".baaaab..", "..adda...", "..aaaa...", ".aaaaaaa.", "aa.ccc.aa", "...a.a...", "..cc.cc.."]],
    vampire: [["...cc....", "..caac...", "..adad...", ".bcaaab..", "ccbbbbcc.", "c.bbbb.c.", "c.bbbb.c.", "..c..c..."]],
    mummy: [["..aaa..", ".adada.", ".acaca.", "aaaaaaa", ".acaca.", ".aaaaa.", ".a...a.", ".c...c."]],
    lich: [["..aaa...", ".adada.b", "..aaa..c", "..cac..c", ".bbbbbbc", "bb.bb..c", ".bbbbb..", "bbbbbbb."]],
    wizard: [["...b...d", "..bbb..c", ".bbbbb.c", "..ada..c", "..aaaa.c", ".bbbbbbc", ".bbbbb.c", "bbbbbbb."]],
    rogue: [["..ccc...", ".cccaa..", ".ccada..", "..aaaaab", ".aaaa...", "aa..aa..", "c....c.."]],
    archer: [["a.aaa.b.", ".aaaaa.b", ".adaad.b", "..aaacab", ".ccccc.b", ".cccc.b.", "..a.a..."]],
    spearman: [["..bb...b", ".aaaa..c", ".addc..c", ".aaaa..c", "aaaaaaac", ".aaaa..c", ".a..a..c", "cc..cc.."]],
    shieldbearer: [["..aaa...", ".aaaa...", ".adabbb.", "aaaabbbb", ".aaabdbb", ".aaabbbb", ".a.a.bb.", "cc.cc..."]],
    medusa: [["a.a.a.a", ".aaaaa.", "a.bdbd.", "..bbb..", ".bcccb.", "..ccc..", ".ccccc.", ".c...c."]],
    gargoyle: [[".b.....b.", "..aaaaa..", "c.adada.c", "cc.aaa.cc", "ccaaaaacc", "c.aaaaa.c", "..a...a..", ".aa...aa."]],
    harpy: [["a.......a", "aa.bbb.aa", "aa.bdb.aa", ".aaaaaaa.", "..aaaaa..", "...aaa...", "..c...c.."]],
    wraith: [["..aaa..", ".aaaaa.", "aacccaa", "aadcdaa", "aaaaaaa", "aaaaaaa", "a.a.a.a", ".a...a."]],
    banshee: [["...aaa.", "..aabba", ".aaabdb", "aaaabbb", ".aaaaa.", "aa.aaa.", "a...aa.", ".....a."]],
    reaper: [["..aaabbbb", ".aaaaa.c.", ".acdcd.c.", ".aaaaaac.", "aaaaaa.c.", "aaaaaa.c.", "a.a.a..c."]],
    ghoul: [[".....aa.", "....aada", ".aaaaaa.", "aaaa..aa", ".a.a..ac", "a..a...."]],
    scorpion: [[".aa......", "a..a.....", "a...a..cc", "....aaaac", "...aaadaa", "...c.c.c."]],
    beetle: [[".c...c.", "..aaa..", ".adada.", "caabaac", ".aabaa.", "caabaac", "..aaa.."]],
    centipede: [[".......a.", "abababaad", "abababaaa", "c.c.c.c.c", ".c.c.c.c."]],
    worm: [[".....aa.", "....aada", "aaa.aa..", ".aaaa..."]],
    wasp: [[".bb.bb.", "..bbb..", "c.acaad", ".acaca.", "..c.c.."]],
    lobster: [["a.....a", "aa...aa", ".aaaaa.", "..ada..", "c.aaa.c", "..aaa..", ".c.a.c.", "..aaa.."]],
    shark: [["...a.....", "..aa.....", "a.aaaaaa.", "aaaaaaada", "a.bbbbbc.", "....a...."]],
    angler: [[".......b", "..aaaac.", ".aaaaaa.", "a.aaaada", "aaaadcdd", ".aaaaaa."]],
    mindflayer: [["..aaa..", ".aaaaa.", ".adada.", ".aaaaa.", "a.a.a.a", ".bbbbb.", ".b...b."]],
    eyeball: [["..aaa..", "cabbbac", "cabcbac", "cabbbac", "..aaa..", "..c.c.."]],
    beholder: [["b.b.b.b", ".aaaaa.", "aabbbaa", "aabcbaa", "aabbbaa", ".acdca.", "..aaa.."]],
    horror: [["..aaaaa..", ".aadaada.", "aaaaaaaaa", "aadaaadaa", "aaacccaaa", "a.a.a.a.a", ".a.a.a.a."]],
    flytrap: [[".aaaaa.", "adcdcda", "ccccccc", "adcdcda", ".aaaaa.", ".b.b.b.", "..bbb.."]],
    crystal: [["...a....", "..aba.a.", "a.aba.ab", "abaabaab", "abaadaab", "cccccccc"]],
    tentacle: [["...aa", "..a.a", "..a..", "...a.", "...aa", "..aa.", ".aaa.", "ccccc"]],
    slug: [["......a.", "....aaad", ".aaaaaaa", "aaaaaaa.", "ccccccc."]],
    basilisk: [["......aa.", "......ada", "a....aaa.", ".aaaaaaa.", ".bbbbba..", ".c.c..c.c"]],
    blade: [["..a..", "..a..", ".aba.", ".aba.", ".aba.", "ccccc", "..c..", "..c.."]],
  };
  Object.assign(SHAPES, MORE_SHAPES);
  SHAPES.spider = [["...aaa...", "a.aaaaa.a", ".aaddaaa.", "a.aaaaa.a", ".a.c.c.a.", "a.......a"], ["..aaa..", "a.aaa.a", ".adada.", "aaaaaaa", ".a.a.a.", "a.....a"]];
  SHAPES.ghost.push(["..aaaa.", ".aaaaaa", ".aadada", "aaaaaaa", "aaaaaa.", ".a.aa..", "a...a.."]);
  SHAPES.mushroom.push(["..aaaa..", ".abaaba.", "aaaaaaaa", "..bbbb..", "..bdbd..", "..bbbb..", "..b..b.."]);
  // Words that pick the new shapes. They're checked after the older lists, so on a tie they win
  // ("Ember Lizard" now gets the lizard-beast shape, "Bone Skeleton" the skeleton).
  BODY_WORDS.push(
    ['skeleton', /\b(skeletons?|skeletal|skulls?)\b/g],
    ['zombie', /\b(zombies?|undead|corpses?|rotters?|shamblers?)\b/g],
    ['goblin', /\b(goblins?|hobgoblins?|gremlins?|kobolds?)\b/g],
    ['orc', /\b(orcs?|orcish|brutes?|berserkers?|warlords?)\b/g],
    ['cultist', /\b(cultists?|cult|acolytes?|monks?|priests?|zealots?|heretics?)\b/g],
    ['knight', /\b(knights?|guards?|soldiers?|paladins?|wardens?|sentry|sentries|champions?)\b/g],
    ['imp', /\b(imps?|devilkins?)\b/g],
    ['demon', /\b(demons?|devils?|fiends?|hellions?|daemons?)\b/g],
    ['mimic', /\b(mimics?|chests?|coffers?)\b/g],
    ['snake', /\b(snakes?|vipers?|cobras?|asps?|adders?|pythons?)\b/g],
    ['bonebeast', /\bbone ?(beasts?|hounds?|dogs?|wolf|wolves|raptors?|stalkers?)\b/g],
    ['golem', /\b(golems?|colossus|statues?|guardians?|sentinels?|constructs?)\b/g],
    ['lizardman', /\b(lizard ?(men|man|folk|kin)|saurians?|reptilians?)\b/g],
    ['troll', /\b(trolls?|ogres?|giants?|yetis?|cyclops)\b/g],
    ['minotaur', /\b(minotaurs?|bull ?(men|man))\b/g],
    ['vampire', /\b(vampires?|vampiric|nosferatu)\b/g],
    ['mummy', /\b(mumm(y|ies)|pharaohs?)\b/g],
    ['lich', /\b(lich(es)?|necromancers?)\b/g],
    ['wizard', /\b(wizards?|mages?|warlocks?|sorcerers?|sorceress|shamans?|witch(es)?|druids?|magi)\b/g],
    ['rogue', /\b(bandits?|thief|thieves|rogues?|assassins?|ninjas?|outlaws?|cutthroats?)\b/g],
    ['archer', /\b(archers?|bowm[ae]n|hunters?|snipers?)\b/g],
    ['spearman', /\b(spear\w*|lancers?|halberd\w*|pike\w*|hoplites?)\b/g],
    ['shieldbearer', /\b(shield ?bearers?|bulwarks?|defenders?)\b/g],
    ['medusa', /\b(medusa|gorgons?)\b/g],
    ['gargoyle', /\b(gargoyles?)\b/g],
    ['harpy', /\b(harpy|harpies|sirens?)\b/g],
    ['wraith', /\b(wraiths?|shrouds?|hooded)\b/g],
    ['banshee', /\b(banshees?|wailers?)\b/g],
    ['reaper', /\b(reapers?|scythes?)\b/g],
    ['ghoul', /\b(ghouls?|crawlers?|ferals?)\b/g],
    ['scorpion', /\b(scorpions?)\b/g],
    ['beetle', /\b(beetles?|scarabs?|weevils?)\b/g],
    ['centipede', /\b(centipedes?|millipedes?)\b/g],
    ['worm', /\b(worms?|leech(es)?|maggots?|grubs?|larvae?)\b/g],
    ['wasp', /\b(wasps?|hornets?)\b/g],
    ['lobster', /\b(lobsters?|crayfish|crawdads?)\b/g],
    ['shark', /\b(sharks?|piranhas?|barracudas?)\b/g],
    ['angler', /\b(angler\w*|lanternfish)\b/g],
    ['mindflayer', /\b(mind ?flayers?|illithids?)\b/g],
    ['eyeball', /\b(eyeballs?|eyes?|watchers?|peepers?)\b/g],
    ['beholder', /\b(beholders?|gazers?)\b/g],
    ['horror', /\b(horrors?|abominations?|eldritch|aberrations?|spawn|monstrosity)\b/g],
    ['flytrap', /\b(flytraps?|man-?eaters?|chompers?|snappers?|plants?)\b/g],
    ['crystal', /\b(crystals?|geodes?|gems?|shards?|prisms?)\b/g],
    ['tentacle', /\b(tentacles?)\b/g],
    ['slug', /\b(slugs?)\b/g],
    ['basilisk', /\b(basilisks?|hydras?|drakes?|salamanders?|raptors?|lizards?)\b/g],
    ['blade', /\b(blades?|swords?)\b/g],
    ['slime', /\b(slimes?|oozes?|goo|gel|sludge\w*|globs?|gloop|blobs?)\b/g],
    // Two-word names that should beat their last word.
    ['lich', /\bskeleton ?mages?\b/g],
    ['troll', /\bzombie ?brutes?\b/g],
    ['ghoul', /\btroglodytes?\b/g],
    ['flame', /\belementals?\b/g],
    ['spiky', /\bspik(y|es)\b/g],
    ['golem', /\bclockworks?\b/g],
    ['ghost', /\blost ?souls?\b/g],
    ['eyeball', /\beye ?beasts?\b/g],
    ['walker', /\b(stags?|elks?|moose|hinds?|antelopes?|jackals?|hyenas?|panthers?|cougars?|lynx|badgers?)\b/g],
  );

  /* ---- Monster parts, like Starbound's guns: people and floaters are a top, a middle and a bottom
     (7 wide); beasts are a back, a middle and a head (11 wide). The name picks the parts, so a monster
     always looks the same, and each kind only uses parts that suit it (skeletons get skulls and ribs). ---- */
  const PARTS = {
    tops: { 'head': ["..aaa..", ".aaaaa.", ".adada."], 'horns': ["b.....b", ".baaab.", ".adada."], 'hood': ["..ccc..", ".ccccc.", ".cdcdc."], 'helmet': ["...bb..", ".aaaaa.", ".cdddc."], 'skull': [".aaaaa.", ".adada.", "..aca.."], 'hat': ["...b...", "..bbb..", "bbadabb"], 'ears': ["a.aaa.a", ".aaaaa.", ".adada."], 'crown': [".b.b.b.", ".bbbbb.", ".adada."], 'cyclops': ["..aaa..", ".abdba.", "..aaa.."], 'antenna': [".c...c.", "..ccc..", ".cdddc."] },
    mids: { 'plain': ["aaaaaaa", "a.bbb.a", "..bbb.."], 'sword': ["aaaaa.b", "a.bbbab", "..bbb.c"], 'shield': [".aaaabb", "a.bbbbb", "..bbbbb"], 'robe': [".bbbbb.", "bbbbbbb", "bbbbbbb"], 'staff': [".aaaa.d", "abbbbac", "..bbb.c"], 'bow': ["aaaa.b.", "a.bbacb", "..bbb.b"], 'wings': ["c.aaa.c", "ccbbbcc", "c.bbb.c"], 'ribs': [".aaaaa.", "a.cac.a", "..aca.."], 'brute': ["aaaaaaa", "aabbbaa", "a.bbb.a"], 'cape': ["ccaaacc", "c.bbb.c", "c.bbb.c"] },
    bots: { 'legs': ["..a.a..", ".cc.cc."], 'stance': [".a...a.", "cc...cc"], 'hem': ["bbbbbbb", "b.b.b.b"], 'wisp': ["..aaa..", "...a..."], 'tentacles': ["a.a.a.a", ".a.a.a."], 'tail': ["aa.a.a.", "a..c.c."], 'bones': ["..a.a..", "..a.a.."], 'puddle': ["aaaaaaa", ".ccccc."], 'spider': ["c.a.a.c", ".c...c."], 'stumps': [".aa.aa.", ".cc.cc."] },
    backs: { 'tail up': ["a...", "a...", "a...", ".aaa", "aaaa", ".cc."], 'long tail': ["....", "....", "....", "aaaa", ".aaa", ".cc."], 'spines': ["....", "....", ".b.b", "baaa", ".aaa", ".cc."], 'bushy': ["....", "bb..", "bbb.", ".baa", ".aaa", ".cc."], 'stinger': ["aa..", "a.a.", "..a.", ".aaa", ".aaa", ".cc."], 'fin': ["....", "....", "..a.", ".aaa", "aaaa", "..c."], 'club': ["....", "....", "....", "b.aa", "baaa", ".cc."] },
    middles: { 'plain': ["...", "...", "...", "aaa", "aaa", "..."], 'spikes': ["...", "...", "b.b", "aaa", "aaa", "..."], 'wings': ["c..", "cc.", "ccc", "aaa", "aaa", "..."], 'plates': ["...", "...", "bbb", "aba", "aaa", "..."], 'ribs': ["...", "...", "...", "aca", "aca", "..."], 'stripes': ["...", "...", "...", "aba", "aba", "..."], 'hump': ["...", "...", ".a.", "aaa", "aaa", "..."], 'shell': ["...", "...", "bbb", "bbb", "aaa", "..."] },
    fronts: { 'dog': ["..a.", ".aaa", ".aad", "aaaa", "aa..", ".c.."], 'horned': ["...b", "..ab", ".aad", "aaaa", "aa..", ".c.."], 'beak': ["....", ".aa.", ".adb", "aaa.", "aa..", ".c.."], 'tusks': ["....", ".aaa", "aaad", "aaab", "aa..", ".c.."], 'jaws': ["....", ".aad", ".a..", "aadd", "aa..", ".c.."], 'long neck': ["..aa", "..ad", "..a.", ".aa.", "aa..", ".c.."], 'skull': ["....", ".aaa", ".adc", "aaca", "aa..", ".c.."], 'antlers': ["b.b.", ".bb.", ".aad", "aaaa", "aa..", ".c.."] },
  };
  const ALL = (k) => Object.keys(PARTS[k]);
  // [tops, middles, bottoms] each kind may use, and how often it uses parts instead of its hand-drawn shape.
  const PART_KINDS = {
    biped: [ALL('tops'), ALL('mids'), ['legs', 'stance', 'hem', 'tail', 'bones', 'stumps', 'wisp', 'tentacles'], 1],
    skeleton: [['skull', 'helmet', 'crown', 'hood'], ['ribs', 'sword', 'shield', 'bow', 'staff', 'cape'], ['bones', 'legs', 'stance'], 0.6],
    zombie: [['head', 'ears'], ['plain', 'brute', 'cape'], ['legs', 'stance', 'stumps'], 0.5],
    goblin: [['ears'], ['plain', 'sword', 'bow', 'shield'], ['legs', 'stance'], 0.6],
    orc: [['head', 'horns', 'helmet'], ['brute', 'sword', 'shield'], ['stance', 'legs', 'stumps'], 0.6],
    cultist: [['hood', 'horns', 'crown', 'skull'], ['robe', 'staff', 'cape', 'plain'], ['hem', 'legs', 'wisp'], 0.6],
    knight: [['helmet', 'horns', 'crown', 'skull'], ['sword', 'shield', 'plain', 'cape', 'staff'], ['legs', 'stance', 'stumps'], 0.6],
    imp: [['horns', 'ears', 'head', 'antenna'], ['wings', 'plain', 'sword', 'staff'], ['tail', 'legs', 'stance'], 0.6],
    demon: [['horns', 'crown'], ['wings', 'brute', 'cape'], ['tail', 'stance'], 0.5],
    lich: [['skull', 'crown', 'hood'], ['robe', 'staff'], ['hem', 'wisp'], 0.6],
    wizard: [['hat', 'hood'], ['robe', 'staff'], ['hem'], 0.6],
    rogue: [['hood'], ['sword', 'cape', 'plain'], ['legs', 'stance'], 0.6],
    archer: [['hood', 'ears', 'head', 'helmet'], ['bow'], ['legs', 'stance'], 0.6],
    spearman: [['helmet', 'head'], ['staff', 'shield'], ['legs', 'stance'], 0.4],
    shieldbearer: [['helmet', 'head', 'horns'], ['shield'], ['legs', 'stance'], 0.5],
    vampire: [['head', 'crown'], ['cape'], ['legs'], 0.5],
    ghost: [['head', 'hood', 'cyclops'], ['robe', 'cape', 'plain'], ['wisp', 'tentacles'], 0.4],
    wraith: [['hood'], ['robe', 'cape'], ['wisp', 'tentacles'], 0.5],
    banshee: [['head', 'hood'], ['robe', 'cape'], ['wisp'], 0.4],
    reaper: [['hood', 'skull'], ['robe', 'staff'], ['wisp', 'hem'], 0.5],
    troll: [['head', 'horns', 'cyclops'], ['brute'], ['stance', 'stumps'], 0.6],
    minotaur: [['horns'], ['brute', 'sword'], ['stance', 'stumps'], 0.5],
    gargoyle: [['horns', 'ears'], ['wings'], ['stance', 'tail'], 0.5],
    mindflayer: [['cyclops', 'head', 'antenna'], ['robe', 'cape'], ['tentacles'], 0.5],
    golem: [['head', 'cyclops', 'helmet'], ['brute', 'plain'], ['stance', 'stumps'], 0.5],
    lizardman: [['head', 'ears'], ['sword', 'shield', 'plain'], ['tail'], 0.5],
    mummy: [['head', 'cyclops'], ['plain', 'brute'], ['legs', 'stumps'], 0.4],
  };
  // Beasts: [backs, middles, heads] and how often.
  const BEAST_KINDS = {
    walker: [ALL('backs'), ALL('middles'), ['dog', 'horned', 'tusks', 'jaws', 'antlers'], 1],
    basilisk: [['long tail', 'spines', 'club', 'fin'], ['plain', 'spikes', 'plates', 'stripes'], ['long neck', 'jaws', 'horned'], 0.6],
    bonebeast: [['tail up', 'long tail', 'spines'], ['ribs'], ['skull'], 0.6],
    horse: [['long tail', 'bushy'], ['plain', 'hump', 'stripes'], ['long neck', 'horned'], 0.5],
  };
  // The first word that matches picks a head for beasts ("Boar" gets tusks).
  const BEAST_HEADS = [[/boar|pig|hog/, 'tusks'], [/deer|stag|elk|moose/, 'antlers'], [/bull|goat|ram|ox\b/, 'horned'], [/wolf|hound|dog|fox|jackal|rat|mouse/, 'dog'],
    [/croc|gator|shark|maw|jaw/, 'jaws'], [/bird|raptor|griffin/, 'beak']];
  function prefer(list, wish, r) { const w = list.filter((x) => wish.includes(x)); return w.length && r(10) < 7 ? w[r(w.length)] : list[r(list.length)]; }
  function partRows(kind, spec, r) {
    const ab = spec.abilities || [], el = spec.element, beh = spec.behaviour, name = String(spec.name || '').toLowerCase();
    if (PART_KINDS[kind]) {
      const [ts, ms, bs] = PART_KINDS[kind];
      // What it does shows in what it carries.
      const midWish = ab.includes('armoured') || ab.includes('shields') ? ['shield'] : beh === 'shooter' || ab.includes('rapid fire') ? ['bow', 'staff']
        : beh === 'summoner' || ab.includes('heals friends') ? ['staff', 'robe'] : beh === 'tank' ? ['brute', 'shield'] : ab.includes('charges') ? ['sword'] : [];
      const topWish = el === 'fire' || el === 'shadow' ? ['horns', 'hood'] : el === 'light' ? ['crown', 'helmet'] : el === 'lightning' ? ['antenna', 'cyclops'] : [];
      const botWish = beh === 'ambusher' || beh === 'trickster' ? ['wisp', 'tentacles'] : beh === 'tank' ? ['stance', 'stumps'] : [];
      return PARTS.tops[prefer(ts, topWish, r)].concat(PARTS.mids[prefer(ms, midWish, r)], PARTS.bots[prefer(bs, botWish, r)]);
    }
    const [bk, md, fr] = BEAST_KINDS[kind];
    let head = fr[r(fr.length)];
    for (const [re, h] of BEAST_HEADS) if (re.test(name) && fr.includes(h)) { head = h; break; }
    const midWish = ab.includes('armoured') ? ['plates', 'shell'] : el === 'fire' || el === 'earth' ? ['spikes', 'plates'] : [];
    const back = PARTS.backs[bk[r(bk.length)]], mid = PARTS.middles[prefer(md, midWish, r)], front = PARTS.fronts[head];
    return back.map((row, y) => row + mid[y] + front[y]).filter((row, y) => y > 0 || /[^.]/.test(row));
  }
  function creatureRows(spec) {
    const name = String(spec.name || 'Monster'), r = seeded(name), kind = DF.bodyType(spec);
    // Built from parts some of the time (always for plain people and four-legged beasts).
    const pk = PART_KINDS[kind] || BEAST_KINDS[kind];
    if (pk) { const pr = seeded(name + '|parts'); if (pr(100) < pk[3] * 100) return partRows(kind, spec, pr); }
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
  DF.creatureRows = creatureRows;
  DF.monsterSprite = function (spec, kind) {
    const key = 'm|' + spec.name + '|' + (spec.colors || []).join() + '|' + (kind || '');
    if (cache.has(key)) return cache.get(key);
    const rows = creatureRows(spec); // always from the name, so old saves get new shapes too
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
      const rows = creatureRows(spec);
      cv = paint(rows, monsterPalette(spec), spec.elite ? '#ffcf4a' : '#0c0a10', scale);
    } else if (kind === 'knight' || kind === 'hero') { const h = DF.HEROES[spec.cls || 'knight']; cv = paint(h.rows[0], h.colors, '#0c0a10', scale); }
    else cv = paint(DF.ICON_PIX[spec.icon] || DF.ICON_PIX.gem, DF.iconPalette(spec.colors, spec.element), '#0c0a10', scale);
    const url = cv.toDataURL();
    cache.set(key, url); return url;
  };
}(window.DF));
