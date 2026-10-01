# Phase 5 et complétion des données : contenu [EXTENSION] à relire

## 0. Autorisation

Consigne du commanditaire, après la phase 4 : **« Réalise tout en fonction du lore »**. Toutes les
données absentes des spécifications, listées dans `PHASE1_GAPS.md` à `PHASE4_GAPS.md`, ont donc été
**rédigées en [EXTENSION]** d'après LORE_BIBLE.md, HISTORICAL_EVENT_CHAIN_845_854.md, la carte de
référence et la chronologie canon que ces documents résument. Chaque valeur rédigée se trouve dans
un fichier `data/*.json` dont l'en-tête `_source` le signale : on peut tout relire et corriger sans
toucher au code.

Règles tenues partout : aucun personnage nommé (LORE §0.1), seulement des rôles (« Chef du programme
des Guerriers », « Héritier du Titan Fondateur »…) ; aucune citation (§0.3) ; contreparties toujours
présentes (§0.5) ; aucun emblème officiel (cahier §9).

## 1. Où chaque manque a été comblé

| Manque (document d'origine) | Fichier | Contenu [EXTENSION] et justification |
|---|---|---|
| Carte, provinces, états (P1 A1-A5) | `data/map/*` (construit par `tools/extract-map.js` d'après la carte haute résolution fournie) | 72 provinces et 35 états. Contours des nations et frontières intérieures repris de la référence, noms de régions lus sur la référence. Détail en section 9. |
| Valeurs de départ des nations (P1 B, P4 A1-A2) | `data/nations.json` | Paradis : stabilité 60, soutien de guerre 30 (un siècle de paix). Marley : 70 / 65, rang « majeur ». Alliance : 55 / 50. Hizuru : 65 / 25, régime « Shogunat ». Chaque nation a un champ `_startingValuesSource` qui justifie ses valeurs. |
| Titans détenus en 844 (P1 B5, P4 A4) | `data/nations.json`, `data/politics.json` → `titans` | Paradis : Fondateur (lignée royale) et Attaque (porteur réfugié sur l'île). Marley : les sept autres (« la plupart », LORE §1). Position et années restantes suivent le cycle canon de 13 ans (le porteur de l'Attaque arrive en fin de cycle en 845). En 850, Colossal et Mâchoire passent à Paradis. |
| Relations et capital politique (P4 A2-A3) | `data/diplomacy.json` | Marley/Alliance −60 ; Hizuru méfiant envers Marley (−30), favorable aux Eldiens (+10 avec Paradis) ; Marley hostile à l'île (−100). +1 de capital politique par jour. |
| Coûts d'usine, stocks de départ, consommation (P2 A4-A7) | `data/economy_rules.json` | Usine civile 60 et militaire 45 jours-usines, conversion 20. Stocks à l'échelle de chaque puissance. Chaque usine militaire consomme de l'acier, et les blindés, avions et navires du carburant. Si le stock manque, la production baisse au prorata. |
| Catalogue technologique (P2 A1-A2) | `data/technologies.json` | 21 technologies (3 par catégorie), époque fin XIXe – début XXe siècle, dont l'équipement de manœuvre, les canons anti-Titans et la doctrine des Titans. Effets : modificateurs d'attaque, de défense, de rendement, de production et de recherche. |
| Rang de recherche majeur ou mineur (P2 A3) | `data/nations.json` | Marley et l'Alliance « majeurs » (4 slots), Hizuru « mineur » (2 slots), Paradis 3 (valeur fixée par la spec). |
| Vitesses, déplacement, terrain, attrition, renforts (P3 A1-A7) | `data/military_rules.json` | Vitesses : infanterie 4, artillerie 4, blindés légers 8, blindés moyens 6. Un déplacement dure ⌈12 / vitesse⌉ jours. Terrain : forêt ×1,15, montagne ×1,3, ville ×1,2, désert ×0,95. Attrition de ravitaillement : 1 point par jour. Renforts : 2 points par jour, qui consomment équipement et effectifs. |
| Ordre de bataille de départ (P3 A4) | `data/scenario.json` | Paradis : 6 garnisons des Murs, 1 bataillon d'exploration, 1 brigade de police (les trois branches de LORE §4.1). Marley : 8 divisions d'infanterie et 2 blindées. Alliance : 5 divisions. Hizuru : 2 divisions. |
| Lois (MECHANICS §9 : catégories seules) | `data/politics.json` → `laws` | 3 lois par catégorie, avec leurs modificateurs et leurs coûts à l'adoption. Lois de départ selon le lore : Paradis fermé et armée de volontaires, Hizuru libre-échange. |
| Renseignement (FEATURES §11 : « TBD ») | `data/politics.json` → `intel` | Agents par nation. Reconnaissance : 10 de capital, 70 % de réussite, lève le brouillard. Sabotage : −5 % d'équipement. Soutien à une faction : −5 de stabilité chez la cible. |

## 2. Systèmes de phase 5 (valeurs de la spec)

- **Neuf Titans** (MECHANICS §7) : tous les bonus de §7.3 s'appliquent aux formules. Fondateur :
  +1 de stabilité par jour, +0,5 sans le drapeau de lignée royale. Attaque : focus −10 %. Siège :
  Colossal +20 % et Marteau de Guerre +15 %. Colossal : perte d'organisation adverse +5 %. Cuirassé
  +8 % et Mâchoire −5 % en défense. Vitesse : Féminin +10 %, Mâchoire +15 %. Bestial : doctrine
  +10 %. Charrette : ravitaillement +0,1. Cycle de 13 ans (§7.1). Héritage (§7.5) : modale
  `TITAN_INHERITANCE` pour un joueur humain, premier choix automatique pour l'IA.
- **Programme des Guerriers** (§7.4) : vivier de 5, formation de 365 jours, défection
  quotidienne, −2 de stabilité par défection.
- **Statut eldien** (§9.3) : les trois niveaux, avec les valeurs exactes du tableau.
- **Troubles** : 1 % par jour sous 30 de stabilité (§9) ; troubles eldiens selon §9.3.
- **Lois** : délai de 90 jours (§9).

## 3. Interprétations à valider

| # | Point | Choix fait |
|---|---|---|
| B1 | `DEFECTION_CHANCE_PER_DAY = 0.0005 * (1 - marleyEldianStatusModifier)` (§7.4), alors que §9.3 donne un `warriorProgramDefectionMultiplier` explicite. | 0,0005 × multiplicateur de §9.3 : strict ×0,5, modéré ×1, assoupli ×1,5. |
| B2 | `marleyanPopStabilityBonus` (§9.3). | Écart de stabilité appliqué au changement de politique (de strict à assoupli : −10). |
| B3 | « on_shifter_death… killed_by_enemy » (§7.5) alors que les porteurs ne sont pas des divisions. | Un porteur meurt quand sa province est prise par une nation en guerre avec la sienne. Seuls les Eldiens (Paradis, Marley) peuvent hériter ; pour tout autre vainqueur, le pouvoir est perdu. |
| B4 | Fin du cycle de 13 ans (§7.1 ne dit pas ce qui suit). | Le pouvoir passe à un successeur de la même nation. Marley doit disposer d'un candidat formé du programme ; sans candidat, le pouvoir est perdu. |
| B5 | Statut « at-risk » des Titans (FEATURES §7). | Une nation en guerre a ses Titans « en danger ». |
| B6 | Bonus de siège : sur quelles provinces ? | Provinces fortifiées (état de Mur ou niveau de fortification supérieur à 0). |
| B7 | Nations cachées et renseignement : FEATURES §11 veut une reconnaissance possible sur une nation `hidden`, MECHANICS §10 interdit toute entrée « intel » pour une telle nation. | Aucune nation cachée n'apparaît dans la liste. Une cible « Territoire inconnu » révèle une nation cachée au hasard (au niveau `partially_known`). |
| B8 | IA de Marley et programme des Guerriers. | Marley joué par l'IA garde son vivier plein, sinon ses Titans se perdraient à la fin de leur cycle. |
| B9 | Multijoueur : qui règle la vitesse ? (§15 ne le dit pas) | L'hôte seul. La sauvegarde et le chargement sont aussi réservés à l'hôte. |
| B10 | Multijoueur : invité sans nation attribuée. | Il ne reçoit aucune vue de partie, pour ne rien divulguer du monde. |
| B12 | La stabilité ne fait que baisser (troubles §9 et §9.3), sans mécanisme de remontée dans la spec. Sur 11 ans simulés, Marley tombait à 0 même en Mode libre. | [EXTENSION] Dérive de 0,05 par jour vers la stabilité de départ (`data/politics.json` → `stabilityDriftPerDay`). Le bonus du Fondateur (§7.3) s'y ajoute. |
| B11 | Déconnexion (§15.3). | La nation repasse à l'IA et ses évènements en attente prennent le premier choix. Avec le même jeton, le joueur retrouve sa nation en se reconnectant. |

## 4. Messages ajoutés (FEATURES §18)

`law/eldianPolicy`, `warrior/recruit` (FEATURES §12 : « Recruit candidate »), `session/assign`,
`session/ready`, `session/setMode`, `session/start` (flux hôte et salle d'attente de §15), et en
retour `session/joined`. Les messages `law/change` et `intel/operation` suivent exactement le
catalogue.

## 5. Direction artistique (cahier §9-§10)

- Quatre **blasons originaux** en SVG (`client/assets/blasons/`), aux couleurs de faction de §9.
- Carte d'état-major générée par programme : papier, lavis, graticule, Murs tracés à l'encre.
- Les textures CC0 et les icônes CC-BY de §10 ne sont **pas** intégrées (aucun téléchargement
  externe) : les équipements et bataillons restent en pastilles texte. Voir `CREDITS.md`.

## 6. Vérification de bout en bout

Deux simulations de 844 à 855 (4 015 jours, toutes les nations à l'IA) tournent en moins d'une
seconde chacune :

- **Mode historique** : la chaîne se déroule entièrement. Brèche au 01/01/an-845 ; Trost, perte des
  Titans marleyens, coup d'État, découverte de l'océan et guerre Marley/Alliance au 01/01/an-850 ;
  la guerre est résolue en 854 et le Grondement se déclenche. À la fin, Colossal et Mâchoire
  appartiennent à Paradis et le continent a perdu ses usines.
- **Mode libre** : aucun évènement scripté, et le monde de 844 évolue seul.


## 8. Ajouts après la phase 5 : IA, débarquements, équilibrage

| Ajout [EXTENSION] | Fichier | Règle |
|---|---|---|
| **IA décisionnelle** (cahier §6 : « comportement scripté simplifié », sans règles) | `server/simulation/ai.js` | Chaque semaine : premier focus disponible de l'arbre, slots de recherche remplis avec la technologie la plus rapide, une ligne par équipement utilisé par ses modèles, usines militaires libres affectées, construction quand la file est vide, recrutement jusqu'à un plafond (nombre de provinces contrôlées). Chaque jour en guerre : attaque de la province ennemie voisine la moins défendue (organisation ≥ 60), repli sous 30. Sans frontière terrestre, jusqu'à 6 divisions rejoignent le port qui fait face à l'ennemi et débarquent ensemble, à partir de 3, un débarquement à la fois. |
| IA et Mode historique | idem | Conformément à HISTORICAL_EVENT_CHAIN §0, l'IA ne prend **aucun focus d'évitement** et ne déclare **aucune guerre d'elle-même**. En Mode libre, une rivalité forte (relations ≤ −50, soutien de guerre ≥ 60, armée 1,5 fois plus nombreuse) peut mener à un but de guerre, avec 0,5 % de chances par semaine. L'IA ne choisit jamais le focus de fin de partie « Activer les Titans des Murs ». |
| **Débarquements** (MECHANICS ne décrit que le combat terrestre) | `data/map/provinces.json` → `seaLanes`, `data/military_rules.json` → `navalInvasion` | 54 routes maritimes entre provinces côtières (section 9), dont des routes de Marley, de l'Alliance et d'Hizuru vers l'île. Chaque débarquement consomme 2 coques légères, demande 10 jours de transit, et l'assaut se fait à −50 % tant que la tête de pont n'est pas prise ; abandon sous 10 d'organisation. Paradis ne peut pas débarquer tant que sa marine est verrouillée (focus « Chantiers navals côtiers »). |
| **Emplacements d'usines** | `data/economy_rules.json` → `factorySlotsPerState` | 2 + 2 × infrastructure par état. Sans limite, la construction devenait exponentielle : 1 874 usines en 11 ans. |
| **Guerre historique Marley/Alliance** | `server/simulation/diplomacy.js` | Elle se termine au 01/01/an-854 (« soft target end date », §5.3) par la victoire de Marley, quel que soit le score. Sans cela, l'Alliance l'emportait en 5 jours, à l'inverse du canon. |
| **Repli des porteurs de Titans** | `server/simulation/titans.js` | Comme les divisions, un porteur se replie vers une province amie voisine ; il ne tombe que s'il est encerclé. Sans cela, Marley perdait 5 Titans pendant la guerre de 850-854, à l'encontre du canon. |

**Résultat sur 11 ans simulés en Mode historique, toutes nations à l'IA** : en 855, Paradis détient
le Fondateur, l'Attaque, le Colossal et la Mâchoire, et Marley détient le Cuirassé, le Féminin, le
Bestial, la Charrette et le Marteau de Guerre. Cette répartition correspond au canon de la fin de la
période. En Mode libre, l'histoire diverge : Marley, hostile à l'île, y tente des débarquements.

## 9. Carte reconstruite d'après la carte haute résolution

La carte de référence fournie en haute résolution (« Map of the World Known by Residents of Paradis
Island », 2000 × 1119, copiée dans `data/map/source/world_reference.png`) remplace l'ancienne
carte dessinée à la main. `tools/extract-map.js` la convertit ; le découpage est dans
`tools/map-layout.js`.

| Élément | Source | Règle |
|---|---|---|
| Contours des nations | référence | Chaque pixel est classé par la couleur de la nation qui l'occupe (Marley mauve, Alliance ocre, Hizuru vert pâle, Paradis orange). Les écritures et les traits sont rendus à la terre ou à la mer qui les entoure. |
| Terres « Uncharted by Eldia » | référence, LORE §2.5 | Terres neutres **sans province** : ni possédées, ni jouables. Elles restent visibles sur le fond, en papier pâle. |
| Noms des régions | référence | Nidereldia, Obereldia, Patria, Marley, Civita, Carri, Timpano, Sudennland, Darvesse, Evrora, Ethœvropa, Niderrosa, Wenderosina, Ludennemaria ; Naranema, Terenta, Menoriana, Sentari, Rannia ; Daqomo, Zianea, îles Hizuzi, Njetni, Mtelia, Ednokto, Tian, Carxo ; Mitras. |
| Capitales | référence (étoiles) | Civita (Marley), Terenta (Alliance), Ednokto (Hizuru), Mitras (Paradis). |
| Provinces | [EXTENSION] | Chaque région nommée devient un état de 1 à 3 provinces. Une province s'étend depuis un germe placé sur la référence. Franchir une frontière tracée coûte cher, donc les limites suivent ces frontières quand elles existent. Les subdivisions (« occidental », « côte de »…) sont des noms génériques. |
| Murs de Paradis | référence (cercles autour de Mitras) | Trois cercles centrés sur Mitras, de rayons 5,5 / 10,5 / 16 px. La côte la plus proche est à 20 px : les Murs sont à l'intérieur des terres, comme dans le canon, et la bande côtière comme le nord et le sud de l'île forment l'ancien territoire des Titans purs. Le client trace les Murs en vectoriel (`wallRings`) pour qu'ils restent nets à tout zoom. |
| Fond de carte | [EXTENSION] | Redessiné dans le style « carte d'état-major » du jeu (cahier §9) à partir des seuls contours. La référence n'est pas reproduite (la licence de cette carte de fan est inconnue). |
| Routes maritimes | [EXTENSION] | Pour chaque paire (masse terrestre, nation), les 2 couples de provinces côtières les plus proches à moins de 450 px ; entre deux terres d'une même nation, un seul couple à moins de 250 px. S'y ajoute une route manuelle de la côte de Nidereldia vers le sud de l'île. |
| Retouche manuelle | `TEXT_ERASE` | L'étiquette « Mitras », posée sur la mer, touche la côte marleyenne : sa zone est rendue à la mer. |
| Gisements, infrastructures, usines | [EXTENSION] | Repris des anciens états, répartis sur les nouvelles régions. Les totaux par nation sont proches : Marley 42 usines au lieu de 41, l'Alliance 15, Hizuru 8, Paradis 10. |

**Score de guerre** ([CHOIX], MECHANICS §8) : un objectif est une province **de l'adversaire**. Chacune
ne compte qu'une fois par guerre, et reprendre ses propres provinces ne rapporte rien. Sur la
nouvelle carte, une province côtière prise et reprise suffisait sinon à « gagner » une guerre sans
rien occuper.

**Vérification sur 11 ans** : en Mode historique, la chaîne se déroule entièrement. La guerre
Marley/Alliance dure de 850 à 854 et Marley la gagne ; les Titans finissent répartis comme dans le
canon. En Mode libre, Marley débarque en force et s'empare du nord du Mur Maria.

## 7. Limites connues

- **IA** : volontairement simple (section 8). Elle ne fait pas de diplomatie (alliances, garanties)
  et n'a pas de stratégie de front au-delà de la province voisine.
- **Combat naval et aérien** : il n'y a ni batailles navales ni aviation (non spécifiées). Les coques
  servent aux débarquements (section 8), les avions ne sont que des stocks.
- **Population** : aucun modèle. Les pertes démographiques de la brèche et du Grondement ne sont
  représentées que par leurs effets économiques et politiques.
