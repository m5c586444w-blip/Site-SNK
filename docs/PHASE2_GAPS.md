# Phase 2 (économie, production, recherche) : données manquantes et choix à valider

> **Mise à jour (phase 5)** : à la demande du commanditaire (« Réalise tout en fonction du lore »), les données
> manquantes listées ici ont été complétées en **[EXTENSION]**. Détail et justification : `docs/PHASE5_GAPS.md`.


Même règle qu'en Phase 1 : les **formules** de MECHANICS_SPEC §3-§4 sont implémentées telles
quelles et testées. Les **valeurs** absentes restent `null` dans `data/`. Tant qu'elles manquent,
l'action correspondante est refusée avec un message explicite, et le moteur fonctionne dès qu'on
les renseigne. Les manques de la Phase 1 (carte, états, valeurs de départ) restent ouverts, voir
`PHASE1_GAPS.md`. **Sans carte, aucune nation ne contrôle d'état, donc aucune usine ni
ressource.** Les écrans Production et Recherche s'ouvrent, mais restent vides.

Pour voir les deux systèmes tourner sur des données de test abstraites : `npm run start:fixture`.

## A. Valeurs absentes des specs

| # | Manque | Fichier à compléter | Comportement actuel |
|---|---|---|---|
| A1 | **Catalogue des technologies** (id, catégorie, `baseCostDays`, prérequis). §4 ne donne que les catégories et la formule. | `data/technologies.json` | L'écran Recherche affiche les 7 catégories, avec « catalogue absent ». |
| A2 | **Effets des technologies** : le schéma ne dit pas ce qu'une techno terminée apporte. | — | Une techno terminée s'ajoute à `completedTechIds`, **sans effet**. |
| A3 | **Rang major/minor des nations** (`RESEARCH_SLOTS_DEFAULT = { major: 4, minor: 2 }`). | `data/nations.json` → `researchTier` | Paradis a 3 slots (override §4). Marley, l'Alliance et Hizuru n'ont **pas de slots** : message « nombre de slots inconnu ». |
| A4 | **Coût de construction d'une usine**. FEATURES §4 renvoie à MECHANICS §3.4, qui ne chiffre que l'**infrastructure**. | `data/economy_rules.json` → `factoryBuildCost` | « Construire une usine » ouvre la fenêtre de choix de l'état, mais la confirmation est refusée (`FACTORY_COST_MISSING`). |
| A5 | **Coût de conversion d'une usine civile en militaire**. | `economy_rules.json` → `factoryConversionCost` | Le bouton est désactivé, avec une infobulle d'explication. |
| A6 | **Stocks initiaux** de ressources et d'équipement au 01/01/an 844. | `economy_rules.json` → `startingStockpiles` | **0 par défaut.** À valider, ou à fournir. |
| A7 | **Consommation de ressources** : aucune règle ne dit ce que consomment les lignes de production. | `economy_rules.json` → `resourceConsumption` | La consommation vaut 0. L'infobulle des ressources l'indique (« −0 consommés »). |
| A8 | **Réserve d'effectifs** (compteur Effectifs de la barre supérieure, FEATURES §1). | `nations.json` → `manpower` | Affichée « N/D ». |
| A9 | **Nom du focus qui débloque** chaque équipement verrouillé de Paradis (FEATURES §4 : « unlocked by focus: <focusName> »). Les arbres de focus ne sont pas écrits (cahier §7). | phase 4 | L'infobulle indique « focus non défini dans les specs ». |
| A10 | **Icônes d'équipement** : le cahier §10 prévoit game-icons.net (CC-BY), mais aucune icône n'est choisie. | phase 5 | Pastilles texte provisoires (INF, ART, etc.). |

## B. Interprétations à valider

| # | Point | Choix fait |
|---|---|---|
| B1 | Construction en « civilian-factory-days » (§3.4). | Chaque usine civile fournit 1 jour-usine par jour à la file de construction. La file se traite dans l'ordre, et le surplus d'un projet terminé passe au suivant. Pas de plafond par projet (aucun n'est spécifié). |
| B2 | Pénalité de réaffectation (§3.3) : « flat penalty applied once when assignedFactoryIds changes ». | −0,30 à chaque modification, avec un plancher à 0,15 (la plage de `efficiency` vaut 0.15-1.0 dans le schéma §2). Si la liste ne change pas, pas de pénalité. |
| B3 | Rampe d'efficacité : sur quels jours s'applique-t-elle ? | Uniquement les jours où la ligne a au moins une usine. On produit d'abord au rendement du jour, puis l'efficacité monte de 0,01. |
| B4 | Ressources et usines : propriétaire ou contrôleur de l'état ? | Le **contrôleur**, comme dans HOI4. Cela ne change rien tant qu'il n'y a pas d'occupation (phase 3). |
| B5 | Pendant sa conversion, l'usine civile continue-t-elle de construire ? | Oui, jusqu'à la fin de la conversion. Le message de confirmation le dit. |
| B6 | Fin d'une recherche. | Durée = `research_days` (§4), décomptée de 1 par jour. Si `categoryBonus` change en cours de recherche, la durée n'est pas recalculée. |
| B7 | « +/- » d'une ligne. | Le « + » prend une usine militaire libre, le « − » retire la dernière. Chaque clic demande une confirmation qui annonce la pénalité (« X % → Y % »). |

## C. Ajouts au catalogue de messages (FEATURES §18)

Le catalogue ne prévoit pas certaines actions que l'écran §4/§5 exige. Je les ai ajoutées avec la
même forme que les autres. Elles passent par WebSocket ou par REST
`POST /api/nation/{nationId}/{système}/{action}` :

| Message ajouté | Pourquoi |
|---|---|
| `production/newLine { nationId, equipmentType }` | Aucun message ne permet de **créer** une ligne. `production/assign` suppose qu'elle existe. |
| `production/deleteLine { nationId, lineId }` | Pour supprimer une ligne. |
| `production/convertFactory { nationId, stateId }` | La conversion civile → militaire (§4) n'a pas de message. |
| `research/cancel { nationId, slotIndex }` | L'annulation (§5) n'a pas de message. |

Tous les messages vérifient côté serveur que `nationId` est bien la nation du joueur
(`NOT_YOUR_NATION`), puis appliquent toutes les règles (verrous, prérequis, slots, usines déjà
prises).

## D. Format de sauvegarde

`ProductionLine` (entité §2) et la file de construction ne figurent pas dans SaveFile §11. Ils
sont ajoutés sous `productionLines`, `constructionQueues` et `nextId`, en plus des extensions de
Phase 1. Les stocks, la recherche en cours et les technologies terminées sont des champs de
`Nation`, déjà sauvegardés. Une sauvegarde de Phase 1 se recharge : les champs absents sont
initialisés à vide.

## E. Performance (MECHANICS §1)

Le tick traite d'abord la nation du joueur, puis rend la main à la boucle d'évènements entre
chaque nation IA (`server/simulation/tick.js`). Le cahier §3 recommande un thread ou un processus
séparé pour l'IA. Inutile à 4 nations sans IA décisionnelle : à reprendre si le nombre de nations
augmente.
