// Découpage de la carte du jeu, lu par tools/extract-map.js. Coordonnées en pixels de la carte de
// référence (data/map/source/world_reference.png, 2000 × 1119).
//
// Noms : les régions écrites sur la référence sont reprises (Nidereldia, Obereldia, Patria, Marley,
// Civita, Carri, Timpano, Sudennland, Darvesse, Evrora, Ethœvropa, Niderrosa, Wenderosina,
// Ludennemaria ; Naranema, Terenta, Menoriana, Sentari, Rannia ; Daqomo, Zianea, îles Hizuzi, Njetni,
// Mtelia, Ednokto, Tian, Carxo ; Paradis, Mitras). Les subdivisions (« occidental », « côte »…), le
// découpage en provinces, gisements, infrastructures et usines sont [EXTENSION] (LORE §2.2 à §2.4 :
// « internal provinces per the reference map », sans lore propre).

// Germes des provinces : [x, y, id, nom FR, nom EN, état, terrain]. Chaque province s'étend depuis
// son germe sur la terre de sa nation et s'arrête de préférence sur les frontières tracées.
export const LAND_SEEDS = [
  // ---------------------------------------------------------------- Marley (continent)
  [1055, 543, 'mar_cap', 'Civita (capitale)', 'Civita (capital)', 'patria', 'urban'],
  [1000, 455, 'mar_w', 'Patria', 'Patria', 'patria', 'plains'],
  [880, 300, 'mar_nw', 'Nidereldia occidentale', 'Western Nidereldia', 'nidereldia', 'plains'],
  [960, 300, 'mar_n', 'Nidereldia orientale', 'Eastern Nidereldia', 'nidereldia', 'plains'],
  [1030, 392, 'mar_ne2', 'Côte de Nidereldia', 'Nidereldia coast', 'nidereldia', 'mountain'],
  [880, 425, 'mar_ne', 'Obereldia', 'Obereldia', 'obereldia', 'forest'],
  [935, 485, 'mar_ob2', 'Obereldia méridionale', 'Southern Obereldia', 'obereldia', 'forest'],
  [1092, 520, 'mar_lib', 'District d\'internement', 'Internment district', 'liberio', 'urban'],
  [950, 540, 'mar_mar', 'Marley', 'Marley', 'marley_land', 'plains'],
  [960, 600, 'mar_c', 'Hautes terres de Marley', 'Marley highlands', 'marley_land', 'mountain'],
  [1150, 595, 'mar_carri', 'Carri', 'Carri', 'carri', 'plains'],
  [1090, 625, 'mar_carri2', 'Carri occidental', 'Western Carri', 'carri', 'forest'],
  [1000, 655, 'mar_tim', 'Timpano', 'Timpano', 'timpano', 'plains'],
  [1065, 720, 'mar_tim2', 'Timpano oriental', 'Eastern Timpano', 'timpano', 'forest'],
  [730, 700, 'mar_s1', 'Sudennland occidental', 'Western Sudennland', 'sudennland', 'plains'],
  [850, 700, 'mar_s2', 'Sudennland oriental', 'Eastern Sudennland', 'sudennland', 'forest'],
  [760, 810, 'mar_sw', 'Sudennland méridional', 'Southern Sudennland', 'sudennland', 'plains'],
  [1030, 800, 'mar_d1', 'Darvesse', 'Darvesse', 'darvesse', 'plains'],
  [940, 770, 'mar_d2', 'Darvesse occidental', 'Western Darvesse', 'darvesse', 'desert'],
  [850, 890, 'mar_ts1', 'Timpano du Sud', 'South Timpano', 'timpano_sud', 'desert'],
  [930, 860, 'mar_ts2', 'Timpano du Sud oriental', 'Eastern South Timpano', 'timpano_sud', 'desert'],
  [820, 965, 'eur_1', 'Evrora', 'Evrora', 'evrora', 'plains'],
  [890, 990, 'eur_3', 'Evrora orientale', 'Eastern Evrora', 'evrora', 'mountain'],
  [1014, 959, 'eur_2', 'Ethœvropa', 'Ethoevropa', 'etheoevropa', 'forest'],
  [950, 1000, 'eur_4', 'Ethœvropa occidentale', 'Western Ethoevropa', 'etheoevropa', 'forest'],
  // ---------------------------------------------------------------- Marley (territoires de l'ouest)
  [440, 590, 'west_n', 'Niderrosa', 'Niderrosa', 'niderrosa', 'forest'],
  [385, 640, 'west_c', 'Niderrosa méridionale', 'Southern Niderrosa', 'niderrosa', 'plains'],
  [240, 790, 'west_s', 'Wenderosina', 'Wenderosina', 'wenderosina', 'forest'],
  [290, 762, 'west_s2', 'Wenderosina orientale', 'Eastern Wenderosina', 'wenderosina', 'plains'],
  [175, 925, 'isl_1', 'Îles marleyennes occidentales', 'Western Marleyan isles', 'marley_isles', 'plains'],
  [240, 880, 'isl_2', 'Îles marleyennes orientales', 'Eastern Marleyan isles', 'marley_isles', 'forest'],
  [180, 985, 'lud_1', 'Ludennemaria septentrionale', 'Northern Ludennemaria', 'ludennemaria', 'mountain'],
  [115, 1022, 'lud_2', 'Ludennemaria occidentale', 'Western Ludennemaria', 'ludennemaria', 'plains'],
  [235, 1040, 'lud_3', 'Ludennemaria orientale', 'Eastern Ludennemaria', 'ludennemaria', 'plains'],
  // ---------------------------------------------------------------- Alliance du Moyen-Orient
  [1360, 710, 'me_men1', 'Terenta (capitale)', 'Terenta (capital)', 'menoriana', 'urban'],
  [1460, 690, 'me_men2', 'Menoriana', 'Menoriana', 'menoriana', 'desert'],
  [1420, 600, 'me_men3', 'Péninsule de Menoriana', 'Menoriana peninsula', 'menoriana', 'mountain'],
  [1190, 690, 'me_nar1', 'Naranema', 'Naranema', 'naranema', 'desert'],
  [1160, 780, 'me_nar2', 'Naranema méridionale', 'Southern Naranema', 'naranema', 'desert'],
  [1440, 800, 'me_sen', 'Sentari', 'Sentari', 'sentari', 'mountain'],
  [1320, 780, 'me_sen2', 'Sentari occidentale', 'Western Sentari', 'sentari', 'desert'],
  [1500, 760, 'me_sen3', 'Sentari orientale', 'Eastern Sentari', 'sentari', 'desert'],
  [1170, 865, 'me_ran', 'Rannia', 'Rannia', 'rannia', 'plains'],
  [1245, 840, 'me_ran2', 'Rannia orientale', 'Eastern Rannia', 'rannia', 'plains'],
  [1080, 905, 'me_ran3', 'Rannia occidentale', 'Western Rannia', 'rannia', 'desert'],
  // ---------------------------------------------------------------- Hizuru
  [1880, 712, 'hz_capital', 'Ednokto (capitale)', 'Ednokto (capital)', 'ednokto', 'urban'],
  [1904, 756, 'hz_hiz', 'Côte d\'Hizuru', 'Hizuru coast', 'ednokto', 'plains'],
  [1610, 620, 'hz_njetni', 'Njetni', 'Njetni', 'njetni', 'mountain'],
  [1640, 545, 'hz_nj2', 'Njetni septentrional', 'Northern Njetni', 'njetni', 'forest'],
  [1710, 670, 'hz_mte', 'Mtelia', 'Mtelia', 'mtelia', 'plains'],
  [1755, 725, 'hz_mte2', 'Mtelia orientale', 'Eastern Mtelia', 'mtelia', 'forest'],
  [1705, 790, 'hz_tian', 'Tian', 'Tian', 'tian', 'plains'],
  [1790, 830, 'hz_carxo', 'Carxo', 'Carxo', 'carxo', 'plains'],
  [1845, 880, 'hz_carxo2', 'Carxo méridional', 'Southern Carxo', 'carxo', 'forest'],
  [1590, 450, 'hz_zia', 'Zianea', 'Zianea', 'zianea', 'forest'],
  [1663, 342, 'hz_zia2', 'Zianea septentrionale', 'Northern Zianea', 'zianea', 'forest'],
  [1700, 420, 'hz_daqomo', 'Daqomo', 'Daqomo', 'daqomo', 'forest'],
  [1754, 384, 'hz_daqomo2', 'Daqomo oriental', 'Eastern Daqomo', 'daqomo', 'plains'],
  [1785, 471, 'hz_isl1', 'Îles Hizuzi du nord', 'Northern Hizuzi isles', 'hizuzi', 'forest'],
  [1773, 547, 'hz_isl2', 'Îles Hizuzi du sud', 'Southern Hizuzi isles', 'hizuzi', 'forest'],
];

// Île du Paradis. Sa silhouette vient de la carte de l'île fournie à part
// (data/map/source/paradis_reference.png, carte ancienne illustrée) : contour sombre détouré dans
// `crop`, mis à l'échelle (`height` px de haut) et posé dans la mer à l'emplacement de l'île sur la
// carte du monde (`at` = position de Mitras). Mitras est au symbole des Murs de cette carte (`mitras`).
// Trois Murs concentriques autour de Mitras, à l'intérieur des terres ; au-delà du Mur Maria, les
// terres du nord et du sud de l'île (côtes comprises) sont l'ancien territoire des Titans purs
// (LORE §3.1). Rayons en pixels de la carte du monde.
export const PARADIS = {
  shape: {
    file: 'paradis_reference.png',
    crop: [420, 140, 760, 570],
    mitras: [590, 343],
    at: [1114, 347],
    height: 150,
    // arbres de la carte de l'île (coordonnées de cette carte), redessinés sur le fond
    trees: [[527, 240], [628, 425], [663, 460]],
  },
  rings: { sina: 9, rose: 18, maria: 28 },
  provinces: [
    ['pa_mitras', 'Mitras', 'Mitras', 'mitras', 'urban'],
    ['pa_mitras_e', 'Mitras — districts orientaux', 'Mitras — eastern districts', 'mitras', 'urban'],
    ['pa_rose_nw', 'Mur Rose — secteur nord-ouest', 'Wall Rose — north-west sector', 'rose_n', 'plains'],
    ['pa_rose_ne', 'Mur Rose — secteur nord-est', 'Wall Rose — north-east sector', 'rose_n', 'plains'],
    ['pa_rose_sw', 'Mur Rose — secteur sud-ouest', 'Wall Rose — south-west sector', 'rose_s', 'plains'],
    ['pa_rose_se', 'Mur Rose — secteur sud-est', 'Wall Rose — south-east sector', 'rose_s', 'plains'],
    ['pa_maria_nw', 'Mur Maria — secteur nord-ouest', 'Wall Maria — north-west sector', 'maria_n', 'plains'],
    ['pa_maria_ne', 'Mur Maria — secteur nord-est', 'Wall Maria — north-east sector', 'maria_n', 'forest'],
    ['pa_maria_sw', 'Mur Maria — secteur sud-ouest', 'Wall Maria — south-west sector', 'maria_s', 'plains'],
    ['pa_maria_se', 'Mur Maria — secteur sud-est', 'Wall Maria — south-east sector', 'maria_s', 'plains'],
    ['pa_titan_n', 'Terres du nord', 'Northern lands', 'titan_n', 'forest'],
    ['pa_titan_s', 'Terres du sud', 'Southern lands', 'titan_s', 'plains'],
  ],
};

// États. Pour chaque nation, le premier état listé porte la capitale (sa première province).
// infra : infrastructure 0-5 ; dep : gisements ; civ / mil : usines civiles / militaires.
export const STATES = {
  // Marley
  patria: { fr: 'Patria', en: 'Patria', owner: 'marley', infra: 5, dep: { steel: 2, fuel: 2, rareMaterials: 1 }, civ: 6, mil: 5 },
  nidereldia: { fr: 'Nidereldia', en: 'Nidereldia', owner: 'marley', infra: 3, dep: { steel: 3, fuel: 1, rareMaterials: 0 }, civ: 3, mil: 2 },
  obereldia: { fr: 'Obereldia', en: 'Obereldia', owner: 'marley', infra: 3, dep: { steel: 4, fuel: 1, rareMaterials: 1 }, civ: 2, mil: 3 },
  liberio: { fr: 'Zone d\'internement eldienne', en: 'Eldian internment zone', owner: 'marley', infra: 2, dep: { steel: 0, fuel: 0, rareMaterials: 0 }, civ: 1, mil: 0 },
  marley_land: { fr: 'Marley', en: 'Marley', owner: 'marley', infra: 2, dep: { steel: 5, fuel: 0, rareMaterials: 2 }, civ: 1, mil: 1 },
  carri: { fr: 'Carri', en: 'Carri', owner: 'marley', infra: 3, dep: { steel: 1, fuel: 1, rareMaterials: 0 }, civ: 1, mil: 1 },
  timpano: { fr: 'Timpano', en: 'Timpano', owner: 'marley', infra: 3, dep: { steel: 1, fuel: 1, rareMaterials: 1 }, civ: 1, mil: 1 },
  sudennland: { fr: 'Sudennland', en: 'Sudennland', owner: 'marley', infra: 3, dep: { steel: 2, fuel: 2, rareMaterials: 1 }, civ: 3, mil: 2 },
  darvesse: { fr: 'Darvesse', en: 'Darvesse', owner: 'marley', infra: 2, dep: { steel: 1, fuel: 3, rareMaterials: 0 }, civ: 1, mil: 1 },
  timpano_sud: { fr: 'Timpano du Sud', en: 'South Timpano', owner: 'marley', infra: 1, dep: { steel: 0, fuel: 4, rareMaterials: 1 }, civ: 1, mil: 0 },
  evrora: { fr: 'Evrora', en: 'Evrora', owner: 'marley', infra: 4, dep: { steel: 2, fuel: 1, rareMaterials: 1 }, civ: 2, mil: 1 },
  etheoevropa: { fr: 'Ethœvropa', en: 'Ethoevropa', owner: 'marley', infra: 4, dep: { steel: 1, fuel: 0, rareMaterials: 1 }, civ: 1, mil: 1 },
  niderrosa: { fr: 'Niderrosa', en: 'Niderrosa', owner: 'marley', infra: 1, dep: { steel: 1, fuel: 1, rareMaterials: 1 }, civ: 1, mil: 0 },
  wenderosina: { fr: 'Wenderosina', en: 'Wenderosina', owner: 'marley', infra: 1, dep: { steel: 0, fuel: 1, rareMaterials: 1 }, civ: 0, mil: 0 },
  marley_isles: { fr: 'Îles marleyennes', en: 'Marleyan isles', owner: 'marley', infra: 1, dep: { steel: 0, fuel: 0, rareMaterials: 1 }, civ: 0, mil: 0 },
  ludennemaria: { fr: 'Ludennemaria', en: 'Ludennemaria', owner: 'marley', infra: 1, dep: { steel: 1, fuel: 1, rareMaterials: 0 }, civ: 0, mil: 0 },
  // Alliance du Moyen-Orient
  menoriana: { fr: 'Menoriana', en: 'Menoriana', owner: 'mideast_alliance', infra: 3, dep: { steel: 2, fuel: 3, rareMaterials: 1 }, civ: 3, mil: 2 },
  naranema: { fr: 'Naranema', en: 'Naranema', owner: 'mideast_alliance', infra: 2, dep: { steel: 1, fuel: 5, rareMaterials: 0 }, civ: 2, mil: 2 },
  sentari: { fr: 'Sentari', en: 'Sentari', owner: 'mideast_alliance', infra: 2, dep: { steel: 3, fuel: 2, rareMaterials: 1 }, civ: 1, mil: 2 },
  rannia: { fr: 'Rannia', en: 'Rannia', owner: 'mideast_alliance', infra: 2, dep: { steel: 1, fuel: 3, rareMaterials: 0 }, civ: 2, mil: 1 },
  // Hizuru
  ednokto: { fr: 'Ednokto', en: 'Ednokto', owner: 'hizuru', infra: 3, dep: { steel: 0, fuel: 0, rareMaterials: 1 }, civ: 2, mil: 1 },
  njetni: { fr: 'Njetni', en: 'Njetni', owner: 'hizuru', infra: 3, dep: { steel: 1, fuel: 0, rareMaterials: 2 }, civ: 1, mil: 0 },
  mtelia: { fr: 'Mtelia', en: 'Mtelia', owner: 'hizuru', infra: 2, dep: { steel: 1, fuel: 0, rareMaterials: 1 }, civ: 1, mil: 0 },
  tian: { fr: 'Tian', en: 'Tian', owner: 'hizuru', infra: 1, dep: { steel: 0, fuel: 1, rareMaterials: 1 }, civ: 0, mil: 0 },
  carxo: { fr: 'Carxo', en: 'Carxo', owner: 'hizuru', infra: 1, dep: { steel: 1, fuel: 0, rareMaterials: 1 }, civ: 0, mil: 0 },
  zianea: { fr: 'Zianea', en: 'Zianea', owner: 'hizuru', infra: 1, dep: { steel: 0, fuel: 0, rareMaterials: 1 }, civ: 0, mil: 0 },
  daqomo: { fr: 'Daqomo', en: 'Daqomo', owner: 'hizuru', infra: 2, dep: { steel: 1, fuel: 1, rareMaterials: 2 }, civ: 1, mil: 1 },
  hizuzi: { fr: 'Îles Hizuzi', en: 'Hizuzi Islands', owner: 'hizuru', infra: 1, dep: { steel: 0, fuel: 0, rareMaterials: 2 }, civ: 1, mil: 0 },
  // Paradis : économie préindustrielle (pas de flotte ni d'aviation, LORE §2.1).
  mitras: { fr: 'Mitras (Mur Sina)', en: 'Mitras (Wall Sina)', owner: 'paradis', infra: 3, dep: { steel: 1, fuel: 0, rareMaterials: 1 }, civ: 3, mil: 1, wall: 'inner' },
  rose_n: { fr: 'Mur Rose — nord', en: 'Wall Rose — north', owner: 'paradis', infra: 2, dep: { steel: 1, fuel: 0, rareMaterials: 0 }, civ: 1, mil: 1, wall: 'middle' },
  rose_s: { fr: 'Mur Rose — sud', en: 'Wall Rose — south', owner: 'paradis', infra: 2, dep: { steel: 1, fuel: 1, rareMaterials: 0 }, civ: 1, mil: 1, wall: 'middle' },
  maria_n: { fr: 'Mur Maria — nord', en: 'Wall Maria — north', owner: 'paradis', infra: 1, dep: { steel: 1, fuel: 1, rareMaterials: 0 }, civ: 1, mil: 0, wall: 'outer' },
  maria_s: { fr: 'Mur Maria — sud', en: 'Wall Maria — south', owner: 'paradis', infra: 1, dep: { steel: 1, fuel: 0, rareMaterials: 1 }, civ: 1, mil: 0, wall: 'outer' },
  titan_n: { fr: 'Terres nord (Titans purs)', en: 'Northern lands (Pure Titans)', owner: 'paradis', infra: 0, dep: { steel: 1, fuel: 0, rareMaterials: 1 }, civ: 0, mil: 0 },
  titan_s: { fr: 'Terres sud (Titans purs)', en: 'Southern lands (Pure Titans)', owner: 'paradis', infra: 0, dep: { steel: 0, fuel: 1, rareMaterials: 1 }, civ: 0, mil: 0 },
};

// Écritures qui débordent sur la mer et touchent une côte (non séparables par la couleur) :
// zones rendues à la mer, sauf l'île du Paradis. [x0, y0, x1, y1]
export const TEXT_ERASE = [
  [1024, 334, 1078, 363], // « Mitras »
];

// Routes maritimes ajoutées à la main : la flotte marleyenne rejoint l'île depuis la côte de
// Nidereldia, face au Paradis (canon : débarquements marleyens sur l'île).
export const MANUAL_SEA_LANES = [['mar_ne2', 'pa_titan_s']];
