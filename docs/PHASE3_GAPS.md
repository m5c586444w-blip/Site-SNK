# Phase 3 (divisions, fronts, combat, Titans purs) : données manquantes et choix à valider

> **Mise à jour (phase 5)** : à la demande du commanditaire (« Réalise tout en fonction du lore »), les données
> manquantes listées ici ont été complétées en **[EXTENSION]**. Détail et justification : `docs/PHASE5_GAPS.md`.


Les formules de MECHANICS_SPEC §6.1-§6.4 sont implémentées telles quelles et testées :
statistiques des bataillons, statistiques de modèle, puissances offensive et défensive, bonus du
Mur (+50 %), seuils 1,15 / 0,85, pertes d'organisation −25 / −10, regain +5 par jour, attrition des
Titans purs. Le voisinage des provinces est **calculé à partir du masque de couleur** : ce n'est pas
une donnée inventée.

**Deux verrous rendent le combat inaccessible dans une vraie partie :**
1. **Pas de carte**, donc pas de provinces (voir PHASE1_GAPS A).
2. **Pas de guerre possible** : en 844 aucune guerre n'est ouverte (LORE §2.3, `data/scenario.json`),
   et la déclaration de guerre relève de la diplomatie, prévue en phase 4. Le combat ne s'exerce
   donc aujourd'hui qu'avec le scénario de test (`npm run start:fixture` : guerre Paradis–Marley,
   divisions et effectifs de test).

## A. Valeurs absentes des specs

| # | Manque | Où le renseigner | Comportement actuel |
|---|---|---|---|
| A1 | **Vitesse des bataillons** : §6.2 calcule `speed = min(battalion_speeds)`, mais §6.1 ne donne aucune vitesse. | `data/military_rules.json` → `battalionSpeeds` | Vitesse affichée « N/D ». |
| A2 | **Règle de déplacement** : durée pour passer d'une province à une autre, et rôle de la vitesse dans ce calcul. | `military_rules.json` → `movementDaysPerProvince` | Seule la **victoire au combat** fait avancer une division (§6.3 : « attacker wins province »). Le **repli est refusé** avec un message. Il est implémenté et fonctionne dès que la valeur est renseignée (testé avec 2 jours). |
| A3 | **Réserve d'effectifs** des nations (déjà A8 en phase 2). | `nations.json` → `manpower` | « Former une division » est bloqué avec un message explicite. |
| A4 | **Ordre de bataille de départ** (modèles et divisions de chaque nation en 844). | `data/scenario.json` | Aucune division. LORE §2.1 décrit « une petite armée de campagne », sans chiffres. |
| A5 | **Table TERRAIN_MODIFIER** et terrain de chaque province. | `military_rules.json` → `terrainModifiers`, `provinces.json` → `terrain` | 1,0 partout, comme le prévoit §6.3 par défaut. |
| A6 | **Attrition de ravitaillement** : §3.4 annonce une pénalité quand `supplyValue < 0.5` et renvoie à §6.4, qui ne la chiffre pas. | `military_rules.json` → `supplyAttritionPerDay` | Aucune attrition de ravitaillement. Le calcul existe et s'active dès que la valeur est renseignée. |
| A7 | **Renforts** : comment une division regagne de l'effectif, et à quel coût. | — | L'effectif ne remonte jamais. |
| A8 | **Durée d'entraînement** d'une nouvelle division. | — | La division est opérationnelle immédiatement, avec organisation et effectif à 100. |
| A9 | **Armées** : FEATURES §8 demande un arbre « Armées → Divisions → Bataillons », mais aucune entité Armée n'existe dans le schéma. | — | Les divisions sont regroupées **par front** (« Réserve » s'il n'y en a pas), et l'écran le signale. |
| A10 | **Entité Front** : `Division.frontId` existe, pas l'objet Front. | — | `frontId = "front:<nationA>|<nationB>"` (paire de nations en guerre). |

## B. Interprétations à valider

| # | Point | Choix fait |
|---|---|---|
| B1 | Plusieurs divisions sur la même province : §6.3 est écrit pour **une** division. | Les puissances offensive et défensive sont **additionnées** sur toutes les divisions engagées, avec un seul facteur aléatoire par province et par jour. Les pertes d'organisation s'appliquent à chacune. |
| B2 | Province sans défenseur. | Appliqué tel quel : `max(defender_power, 0.01)` donne un ratio très élevé, donc victoire de l'attaquant. |
| B3 | Sort des défenseurs quand la province tombe. | Ils se replient vers une province voisine amie. S'il n'y en a aucune (encerclement), ils sont **détruits**. |
| B4 | L'attaquant victorieux. | Il entre dans la province, puis passe en « tenir ». |
| B5 | Contrôle : la victoire prend une **province**, mais `controllerId` est défini sur l'**État** (§2). | Le contrôle est suivi par province. L'état change de contrôleur quand une même nation contrôle toutes ses provinces. L'économie suit le contrôleur de l'état (voir PHASE2 B4). |
| B6 | « 2 % strength loss/day » (§6.4). | −2 points d'effectif par jour (2 % de l'effectif plein), pas −2 % de l'effectif restant. Une division à 0 est détruite. |
| B7 | Ordre de résolution d'une journée. | Mouvements, puis combats, puis regain d'organisation hors combat, puis attrition, puis recalcul de `supply_value` (§3.4) avec le nombre de divisions de front par état. |
| B8 | Facteur aléatoire. | PRNG déterministe initialisé par `rngSeed` (§11 : « deterministic replay »). Son état est sauvegardé. |
| B9 | Brouillard et militaire. | Paradis ne reçoit ni les divisions ni les combats situés en province inconnue. Il peut ordonner une attaque vers une province voisine inconnue, affichée « Territoire inconnu ». |

## C. Ajouts au catalogue de messages (FEATURES §18)

| Message | Pourquoi |
|---|---|
| `template/delete { nationId, templateId }` | Bouton « Delete template » de FEATURES §8, sans message associé. Refusé si des divisions utilisent le modèle. |
| `division/create { nationId, templateId, provinceId }` | Pour former une division depuis un modèle (§8), sans message associé. |
| `division/setFront { nationId, divisionId }` | Pour « Set front here » (§2). `division/order` ne couvre que hold, advance et retreat. |

## D. Sauvegarde

Ajouts à SaveFile §11 (les divisions y figuraient déjà) : `templates`, `provinceControl`, `wars`,
`rngState`, `lastCombats`.

## E. Hors périmètre de la phase 3 (plan du cahier §12)

- Déclaration de guerre et objectifs de guerre : phase 4 (diplomatie). Le moteur lit déjà
  `state.wars`.
- Neuf Titans (bonus de siège, de vitesse, etc. §7.3) : phase 5.
- Combat naval et aérien (cahier §6) : MECHANICS ne définit que le combat terrestre (§6.3).
