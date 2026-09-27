# Phase 4 (focus, diplomatie, brouillard progressif, évènements) : contenu [EXTENSION], manques, choix

## 0. Autorisation et périmètre

À la fin de la phase 3, le commanditaire a répondu « Oui fais » à la question : « fournir les arbres
de focus, ou m'autoriser à les rédiger en [EXTENSION] (LORE §0.6) ». Tout le contenu rédigé à ce
titre est **marqué [EXTENSION]** et regroupé dans deux fichiers faciles à relire et à corriger :

| Fichier | Contenu rédigé | Ce qui vient des specs |
|---|---|---|
| `data/focuses.json` | 42 focus (Paradis 21, Marley 10, Alliance 5, Hizuru 6) : noms, descriptions, coûts en jours, montants des effets | Branches (cahier §7) ; identifiants des focus d'évitement et de retardement (HISTORICAL_EVENT_CHAIN, MECHANICS §5.3) ; préfixe `EXPLORATION_` (§10) ; branche optionnelle de fin de partie liée au Fondateur (cahier §5.7) |
| `data/events.json` | Textes des 7 évènements de la chaîne, libellés des choix, montants des effets | Identifiants et conditions de déclenchement **mot pour mot** (MECHANICS §5.3) ; nature des effets (révéler Marley, drapeau de lignée royale, découverte partielle du monde, guerre Marley/Alliance, Grondement décrit par ses seuls effets) |

Règles respectées : aucun personnage nommé (LORE §0.1), aucune citation (§0.3), ton sobre, et
chaque focus mentionne un coût ou une contrepartie (§0.5). Le programme des Guerriers n'est pas
présenté comme positif et son statut « honoraire » est décrit comme creux (§3.4).

**Je n'ai pas inventé** les valeurs de départ des nations (stabilité, soutien de guerre, capital
politique, relations), car elles ne relevaient pas de cette autorisation. Voir section A.

## 1. Mode historique / Mode libre (fonctionnalité centrale)

- Chaque évènement de la table est évalué avec
  `GameSettings.historicalMode == true AND (<condition de §5.3>) AND NOT <focus d'évitement terminé>`.
  C'est le seul verrou (§5.3 : pas d'interrupteur par évènement).
- **Mode libre** : un test parcourt 845, 850, 851, 854 et 860 et vérifie que **rien** ne se déclenche
  et que la catégorie `historical_chain` du journal reste vide (FEATURES §14.3).
- **Mode historique** : la chaîne complète est testée de bout en bout. Brèche en 845, révélation de
  Marley, puis en 850 Trost, perte des Titans marleyens, coup d'État, océan et guerre
  Marley/Alliance. La guerre se termine au 01/01/an-854 par une victoire de Marley (fin souple de
  §5.3), ce qui marque l'évènement comme `resolved`. Le Grondement suit si Paradis détient le
  Fondateur.
- **Évitement** : chaque focus d'évitement terminé à temps annule son évènement. Sans brèche, Trost
  et la perte des Titans ne se produisent pas. `DELAY_OCEAN_DISCOVERY` **repousse** la découverte
  d'un an sans l'annuler (valeur de retard : [EXTENSION]).
- Les nations IA ne cherchent pas à éviter les évènements (HISTORICAL_EVENT_CHAIN §0). Leurs
  évènements prennent automatiquement le premier choix.
- Le joueur reçoit une **modale bloquante** : la partie se met en pause, Échap ne la ferme pas, et
  toute reprise de la vitesse est refusée côté serveur (`EVENT_PENDING`) tant qu'il n'a pas choisi.

## A. Valeurs absentes des specs (non inventées)

| # | Manque | Conséquence |
|---|---|---|
| A1 | Stabilité et soutien de guerre de départ (PHASE1 B1-B2). | Les effets `modifyStability` et `modifyWarSupport` ne s'appliquent pas. L'infobulle l'indique (« sans effet tant que la valeur de départ est N/D ») et le journal le signale. |
| A2 | Capital politique de départ et **taux d'accumulation** (§2 : « accrues over time »). | Toutes les actions diplomatiques payantes (alliance, non-agression, garantie, embargo) sont désactivées avec la raison affichée. **Justifier un but de guerre et déclarer la guerre restent possibles**, car §8 ne leur donne aucun coût en capital. Valeurs à renseigner dans `data/diplomacy.json` et `data/nations.json`. |
| A3 | Relations initiales entre nations. | 0 (neutre) par défaut, modifiables dans `data/diplomacy.json`. |
| A4 | **Quels Titans** passent à Paradis en 850 (HISTORICAL_EVENT_CHAIN §1.3 : « two… ») et liste des Titans de Marley en 844. | Transfert non appliqué, signalé dans le journal. Le champ `titanIds` de `events.json` est prévu pour le renseigner. |
| A5 | Territoire perdu lors de la brèche de 845. | L'effet cible les états de Paradis marqués `"wallRing": "outer"` dans la carte, qui n'existe pas encore. Il est ignoré et signalé tant que la carte ne le porte pas. |
| A6 | Population (pertes démographiques de la brèche et du Grondement). | Aucun modèle de population n'existe dans les specs. |
| A7 | Règles d'IA : choix de focus, acceptation des propositions, déclarations de guerre. | Les IA ne choisissent aucun focus et ne déclarent pas la guerre. Les propositions diplomatiques sont acceptées dès que les seuils de §8 sont remplis. |
| A8 | Opérations de renseignement (troisième déclencheur de levée du brouillard, §10). | L'écran Renseignement n'est rattaché à aucune phase (PHASE1 C10) : non implémenté. |

## B. Interprétations à valider

| # | Point | Choix fait |
|---|---|---|
| B1 | Effets des accords (§8 ne donne que coûts et seuils). | **Alliance** : l'allié entre en guerre si son partenaire est attaqué. **Garantie** : le garant entre en guerre si la nation garantie est attaquée. **Non-agression** : interdit de justifier un but de guerre entre les deux signataires (l'alliance aussi). **Embargo** : enregistré seulement, faute de système commercial. |
| B2 | « Objective » dans `warscore_per_objective_captured`. | Une province prise vaut +10 pour le camp qui la prend. À 100, la paix est imposée : les états occupés en entier sont cédés au vainqueur, le reste est rendu. |
| B3 | `resourceBonus`. | Ajout ponctuel au stock ; un montant négatif est une dépense, sans descendre sous 0. |
| B4 | `unlockTech` pour ouvrir aviation et marine (§4 : « corresponding unlockTech focus effect »). | `techId` égal au nom d'une catégorie ouvre cette catégorie ; tout autre `techId` donne la technologie. |
| B5 | Étendue de chaque révélation `EXPLORATION_` (§10 ne donne que le préfixe). | Précisée focus par focus dans `data/focuses.json` (champ `reveal`). Une révélation n'abaisse jamais un niveau déjà acquis. |
| B6 | « Mid-East Alliance nation(s) » (§5.3). | Une seule nation : `mideast_alliance`. |
| B7 | Grondement déclenché par focus (cahier §5.7) en Mode libre. | Autorisé : c'est un choix du joueur, pas un évènement scripté. Il exige de détenir le Fondateur et la date du 01/01/an-854, et il exclut le focus « Renoncer à l'arme des Murs ». |
| B8 | Conditions à date exacte (`date == …`). | Évaluées chaque jour. Une sauvegarde chargée après la date ne rattrape pas l'évènement. |
| B9 | `PARADIS_COUP_850` : §5.3 ne pose pas de prérequis, HISTORICAL_EVENT_CHAIN §1.4 en « recommande » un. | Selon vos règles de priorité, la condition suit MECHANICS : pas de prérequis. |

## C. Messages ajoutés au catalogue FEATURES §18

`focus/start` et `event/resolve` y figurent déjà. `diplomacy/action` couvre aussi
`justify_wargoal` et `declare_war`, deux actions du flux décrit en §9 qui n'ont pas de message
propre. Les routes REST suivent la forme `POST /api/nation/{id}/focus/start` de FEATURES §6.

## D. Sauvegarde

Ajouts : `warInfo`, `relations`, `agreements`, `wargoals`, `diplomacyLog`, `eventLog`,
`pendingEvents`, `journal`, `dynamicHazards`. Un évènement en attente survit à la sauvegarde et
au rechargement.
