# Carte des provinces : format attendu

**État actuel** : la carte est construite par `node tools/extract-map.js` à partir de la carte de
référence fournie (`source/world_reference.png`). Les contours des nations, les frontières tracées
et les noms de régions viennent de la référence ; le découpage en provinces est dans
`tools/map-layout.js` (voir `docs/PHASE5_GAPS.md` §9). Les terres blanches « Uncharted by Eldia »
n'ont pas de province (couleur `#ffffff` du masque, ignorée).
Pour la remplacer par une carte dessinée à la main, déposez vos fichiers ici au même format, puis
vérifiez-les avec `npm run validate-map`.

Technique utilisée : cahier des charges §3. On superpose une image de fond (la carte d'état-major)
et une image de masque où chaque province a une couleur RVB unique. Au clic, le jeu lit la couleur
du pixel pour identifier la province.

## Fichiers à déposer dans ce dossier

| Fichier | Obligatoire | Rôle |
|---|---|---|
| `provinces.json` | oui | table couleur → province → état (schéma ci-dessous) |
| `provinces_mask.png` | oui | masque couleur, **PNG sans perte**, sans anticrénelage (couleurs franches) |
| fond (ex. `background.jpg`) | non | visuel de carte, **mêmes dimensions que le masque** |

Pixels du masque dont la couleur n'est dans aucune province (mer, marges) : ils restent
transparents et laissent voir le fond. Déclarez leurs couleurs dans `ignoredColors`.

## Schéma de `provinces.json`

```jsonc
{
  "maskFile": "provinces_mask.png",
  "backgroundFile": "background.jpg",          // optionnel
  "ignoredColors": ["#000000"],                // couleurs sans province (mer…)
  "homeLandmass": { "paradis": "paradis_island" }, // MECHANICS_SPEC §10 : Paradis voit seulement son île
  "wallRings": { "center": [x, y], "rings": [{ "ring": "inner", "radius": 5.5 }] }, // optionnel : Murs tracés en vectoriel
  "seaLanes": [["prov_a", "prov_b"]],          // optionnel : routes de débarquement
  "provinces": [
    {
      "id": "prov_x",
      "name": "…",
      "color": "#RRGGBB",                      // unique
      "stateId": "state_x",
      "landmass": "paradis_island",            // sert au brouillard de guerre
      "formerPureTitanTerritory": false,       // hachures + attrition (LORE §3.1)
      "terrain": null                          // TERRAIN_MODIFIER (MECHANICS §6.3), phase 3
    }
  ],
  "states": [                                  // entité State, MECHANICS_SPEC §2
    {
      "id": "state_x",
      "name": "…",
      "ownerId": "paradis",                    // id de data/nations.json
      "controllerId": "paradis",               // optionnel, = ownerId par défaut
      "provinceIds": ["prov_x"],
      "isWallState": true,                     // tracé des Murs ; fortification 8/10 par défaut (§6.5)
      "wallRing": "outer",                     // outer | middle | inner : sert à l'évènement WALL_BREACH_845
      "fortificationLevel": null,              // null → WALL_FORTIFICATION_LEVEL_DEFAULT si isWallState
      "infrastructureLevel": null,             // 0-5 — donnée à fournir
      "resourceDeposits": null,                // { steel, fuel, rareMaterials } — donnée à fournir
      "factories": []
    }
  ]
}
```

Pour vérifier la cohérence masque ↔ table : `npm run validate-map`.
Pour tester le moteur sans vraie carte : `SNK_MAP_DIR=tests/fixtures/map npm start`. Ce dossier
contient une grille abstraite de test, **ce n'est pas du contenu de jeu**.
