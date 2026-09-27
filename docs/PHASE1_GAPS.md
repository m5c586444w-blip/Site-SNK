# Phase 1 : données manquantes et points à trancher

> **Mise à jour (phase 5)** : à la demande du commanditaire (« Réalise tout en fonction du lore »), les données
> manquantes listées ici ont été complétées en **[EXTENSION]**. Détail et justification : `docs/PHASE5_GAPS.md`.


Consigne suivie : ne rien inventer. Quand une valeur manque, le jeu affiche « N/D » avec une
infobulle, ou un message explicite pour la carte, et le manque est listé ici. Chaque point dit ce
qui manque, où cela bloque, et ce que j'ai fait en attendant.

---

## A. Bloquant : la carte des provinces

| # | Manque | Source vérifiée | Conséquence |
|---|---|---|---|
| A1 | **Aucun masque couleur des provinces.** La seule image fournie fait **233×180 px** : les noms de provinces sont illisibles, la frontière Marley / Alliance est indiscernable et l'emplacement de Paradis n'est pas identifiable avec certitude. | image jointe | L'écran carte affiche « Carte des provinces indisponible » avec l'image de référence. Tout le moteur est prêt (lecture du masque, brouillard, Murs, hachures) : il suffit de déposer les fichiers décrits dans `data/map/README.md`. |
| A2 | **Liste complète des provinces.** LORE_BIBLE §2 renvoie au « HOI4 mechanics document §4 », qui n'a pas été fourni. Le cahier des charges §4 ne donne que des listes ouvertes : Marley « Nidereldia, Obereldia, Patria, Sudennland, **etc.** », Alliance « Naranema, Menoriana, Sentari, Rannia**...** », Hizuru « Njetni, Daqomo, îles Hizuzi ». | LORE §2, cahier §4 | Aucune province n'a été créée. |
| A3 | **Découpage de Paradis.** Les noms sont connus (Murs Maria, Rose, Sina ; capitale Mitras ; zones « ancien territoire des Titans purs » au nord et au sud), mais pas leur géométrie ni leur découpage en états. | cahier §4, LORE §2.1 | Le format prévoit `isWallState` (fortification 8/10 par défaut, MECHANICS §6.5) et `formerPureTitanTerritory`. |
| A4 | **Emplacement des zones « Uncharted by Eldia ».** | LORE §2.5, cahier §4 | Pas bloquant : pour Paradis, tout ce qui n'est pas sur son île est de toute façon `hidden`. |
| A5 | **Valeurs par état** : `infrastructureLevel`, `resourceDeposits`, usines, terrain. | MECHANICS §2 (schéma sans valeurs) | Affichées « N/D » dans l'infobulle et le panneau de province. |
| A6 | **Nations non jouables.** MECHANICS §1 parle de « 15+ nations », mais seules 4 sont nommées (Paradis, Marley, Alliance, Hizuru). Le cahier §4 dit que les provinces internes ne sont **pas** des nations. | MECHANICS §1, cahier §4 | Seules les 4 nations nommées existent. |

**Ce dont j'ai besoin pour A :** une carte de fond en haute définition, plus soit le masque PNG
avec sa table, soit la liste complète des provinces (nom, nation, état, île/continent, Mur, zone de
Titans purs), accompagnée d'une carte lisible pour que je trace le masque moi-même.

## B. Valeurs de départ des nations (01/01/an 844)

| # | Champ | Paradis | Marley | Alliance | Hizuru |
|---|---|---|---|---|---|
| B1 | `stability` (0-100) | N/D | N/D | N/D | N/D |
| B2 | `warSupport` (0-100) | N/D | N/D | N/D | N/D |
| B3 | `politicalCapital` | N/D | N/D | N/D | N/D |
| B4 | Libellé de régime (FEATURES §3) | « Monarchie sous influence militaire » (LORE §2.1/§4.1) | **N/D** (LORE ne donne que « Empire », administration coloniale) | « Fédération » (défaut fourni par LORE §2.3) | **N/D** |
| B5 | `titanPowersHeld` | `TITAN_FOUNDING` (**déduit**, voir ci-dessous) | **N/D** : LORE dit seulement « most of the Nine Titans » | N/D | N/D |
| B6 | `eldianStatusPolicy` initiale | — | **N/D** (strict, moderate ou relaxed ?) | — | — |
| B7 | Nations majeures ou mineures (`RESEARCH_SLOTS_DEFAULT` 4 ou 2) | 3 (override §4) | N/D | N/D | N/D |

B5 : j'ai déduit Paradis = `TITAN_FOUNDING` de LORE §1/§3.3 (le Fondateur est lié à la lignée
royale de Paradis) et de la condition de `RUMBLING_854` (« Paradis *still* holds
TITAN_FOUNDING »). **À confirmer.** Il faut aussi savoir si Paradis détient un autre Titan en 844.

## C. Trous ou contradictions entre documents

| # | Point | Choix provisoire, à valider |
|---|---|---|
| C1 | **SaveFile (MECHANICS §11) ne contient ni `GameSettings`, ni la date courante, ni l'état du brouillard.** Sans eux, une partie rechargée perdrait le mode historique/libre (pourtant immuable) et repartirait au 01/01/an-844. | Ajout de `settings`, `currentDate` et `visibility` au format `1.0`. Les champs de §11 sont tous présents et inchangés. |
| C2 | FEATURES §18 : `game/new { nationId }`. FEATURES §0.4 : `POST /api/game/new { nationId, historicalMode }`. | Je suis §0.4 : `historicalMode` est obligatoire (booléen), sinon erreur `INVALID_HISTORICAL_MODE`. |
| C3 | **Longueur des mois non spécifiée** (MECHANICS §1 ne donne que le format de date). | 12 mois de longueur usuelle, pas d'année bissextile (365 j). Tout est dans `shared/calendar.js`. |
| C4 | Couleurs de la jauge de stabilité « par seuil selon MECHANICS §9 », mais §9 ne définit qu'un seuil (30, troubles). | Deux états : < 30 rouge, ≥ 30 vert. |
| C5 | FEATURES §3 : la liste des Titans renvoie à « l'écran §9 », qui est la Diplomatie. L'écran des Titans est le §7. | Lien vers l'écran Neuf Titans (§7), désactivé jusqu'à la phase 5. |
| C6 | Rien ne dit où l'on accède aux écrans Sauvegarder/Charger en cours de partie. FEATURES §0.2 interdit d'autres éléments dans le menu principal, mais ne parle pas du jeu. | Bouton « Menu » dans la barre supérieure : Sauvegarder / Charger / Menu principal. |
| C7 | Comment définir « home island » pour `DEFAULT_VISIBILITY` (MECHANICS §10) ? | Champ `landmass` sur chaque province, plus `homeLandmass: { paradis: "…" }` dans `provinces.json`. |
| C8 | Titre du jeu non spécifié. | Titre neutre « SNK — Grande stratégie ». |
| C9 | Noms français des Neuf Titans. | Ceux du cahier §5.2 (Fondateur, Attaque, Colossal, Cuirassé, Féminin, Bestial, Charrette, Mâchoire, Marteau de Guerre). |
| C10 | Les écrans Renseignement et Journal, ainsi que le multijoueur (FEATURES §11, §14.3, §15), ne figurent dans **aucune phase** du plan du cahier §12. | Boutons présents mais désactivés, avec la mention « phase non attribuée ». |
| C11 | `PARADIS_COUP_850` : MECHANICS §5.3 n'impose pas de prérequis, alors que HISTORICAL_EVENT_CHAIN §1.4 recommande de conditionner l'évènement à `WALL_BREACH_845` ou `TROST_CRISIS_850`. | Rien d'implémenté en Phase 1. À trancher avant la phase des évènements (selon vos règles de priorité, c'est MECHANICS qui fait foi pour la condition). |

## D. Manques repérés pour les phases suivantes (non bloquants en Phase 1)

Je les signale dès maintenant pour qu'ils ne bloquent pas plus tard :

- **Effets chiffrés des évènements historiques** : aucune valeur pour les pertes de territoire et
  de population de `WALL_BREACH_845` et `RUMBLING_854`, pour la variation de stabilité de
  `PARADIS_COUP_850`, ni pour la « période fixe » de `DELAY_OCEAN_DISCOVERY`. Les coûts (jours) des
  focus d'évitement (`AVERT_BREACH_845`, etc.) manquent aussi, de même que les textes
  `titleKey`/`bodyKey`.
- **Contenu des arbres de focus** : le cahier §7 indique que « le détail exact reste à écrire ».
- **Catalogue des technologies** (`baseCostDays`, prérequis) : absent.
- **Vitesse des bataillons** : MECHANICS §6.2 utilise `battalion_speeds`, mais §6.1 ne les définit
  pas. `TERRAIN_MODIFIER` n'a pas de table.
- **Coûts et temps de construction** : usines (§3.4 ne donne que l'infrastructure) et divisions.

## E. Limites connues de l'implémentation Phase 1

- **Brouillard** : le serveur ne transmet jamais le nom, le propriétaire ni les statistiques d'une
  province ou d'une nation `hidden` (vérifié par test). En revanche, l'**image** du masque est la
  même pour tous les joueurs : la forme du monde est techniquement présente dans le fichier. Si
  c'est gênant, il faudra générer un masque expurgé côté serveur pour chaque nation.
- **Barre supérieure** : pas encore de compteurs de ressources ni d'effectifs (économie en phase 2),
  ni de cloche de notifications (le journal n'est rattaché à aucune phase, voir C10).
- **Blasons** : ce sont des cartouches provisoires aux couleurs de chaque faction. Les blasons
  originaux (cahier §9) et les textures libres (cahier §10) sont prévus pour la passe artistique de
  la phase 5.
- **Mode historique** : le choix est fait à la création, stocké dans `GameSettings`, immuable,
  affiché en jeu et conservé dans les sauvegardes. La table des évènements et le verrou global
  (MECHANICS §5.3) seront branchés avec le moteur d'évènements, qui n'est pas dans la Phase 1.
