# SNK — Grande stratégie (application web locale)

Jeu de grande stratégie dans l'univers de *L'Attaque des Titans*, avec des mécaniques inspirées de
Hearts of Iron IV. Projet personnel non commercial. Les spécifications de référence sont dans
`docs/` :

| Document | Autorité |
|---|---|
| `docs/cahier_des_charges_snk_hoi4.pdf` | vision globale, architecture, plan en phases |
| `docs/LORE_BIBLE.md` | faits du monde, règles de texte (aucun personnage nommé) |
| `docs/MECHANICS_SPEC.md` | formules et valeurs numériques |
| `docs/FEATURES_SPEC.md` | écrans, interactions, API |
| `docs/HISTORICAL_EVENT_CHAIN_845_854.md` | évènements datés 845-854 (Mode historique) |
| **`docs/PHASE1_GAPS.md`** … **`PHASE4_GAPS.md`** | **données manquantes et points à trancher** |

## Lancer

Il faut Node.js 20 ou plus récent.

```bash
npm install
npm start            # démarre le serveur (port 5173, ou le suivant s'il est pris) et ouvre le navigateur
npm run start:no-open
npm test
npm run validate-map # vérifie le masque de la carte et sa table (data/map/)
```

Le launcher affiche l'adresse locale et l'adresse sur le réseau local. Les sauvegardes vont dans
`saves/` (JSON) et les réglages dans `settings.json`.

Pour voir les moteurs tourner sans la vraie carte ni les vraies données, qui ne sont pas encore
fournies : `npm run start:fixture`. Carte, usines, technologies et coûts sont alors des **données
de test abstraites** (`tests/fixtures/`), pas du contenu de jeu.

## Contenu de la Phase 1 (cahier des charges §12)

- Launcher (FEATURES §0.1), menu principal (§0.2) et réglages FR/EN (§0.3).
- Sélection de la nation parmi 4 cartes, et choix **Mode historique / Mode libre** (historique par
  défaut) sur le même écran (§0.4). `GameSettings.historicalMode` est ensuite figé pour toute la
  partie.
- Carte par masque de couleur : politique et brouillard de guerre (celui-ci pour Paradis
  seulement), tracé des Murs, hachures des zones de Titans purs, infobulle, panneau de province,
  zoom et déplacement (souris, pincement, flèches) (§2).
- Brouillard asymétrique pour Paradis, filtré **côté serveur** (MECHANICS §10).
- Horloge et vitesses 0 à 4, avec les raccourcis Espace et 1 à 4 (MECHANICS §1).
- Sauvegarde, chargement et suppression, avec confirmation si le nom existe déjà, et sauvegarde
  automatique tous les 5 jours sur 3 emplacements tournants. Une version de format incompatible
  est refusée (§16, §17).
- Fiche pays minimale (§3).

## Contenu de la Phase 2 (cahier des charges §12)

- **Économie** (MECHANICS §3) : rendement des gisements par état, lignes de production
  (production quotidienne, rampe d'efficacité, pénalité de réaffectation), file de construction
  alimentée par les usines civiles, conversion civile → militaire, équipements verrouillés pour
  Paradis.
- **Écran Production** (FEATURES §4) et compteurs de ressources et d'effectifs dans la barre
  supérieure (§1), avec le bilan du jour en infobulle.
- **Recherche** (MECHANICS §4 ; FEATURES §5) : slots (Paradis = 3), durée
  `baseCostDays / (1 + bonus)`, prérequis, catégories fermées pour Paradis (aviation, marine),
  annulation avec perte de la progression, notification de fin.
- **Modes de carte** Ressources et Ravitaillement (`supply_value`, §3.4).
- Données absentes (catalogue de technologies, coûts d'usine, stocks initiaux, etc.) : voir
  `docs/PHASE2_GAPS.md`.

## Contenu de la Phase 3 (cahier des charges §12)

- **Écran Divisions** (FEATURES §8) : ordre de bataille par front, puis divisions (organisation,
  effectif, ordre en cours), puis bataillons. Éditeur de modèles par glisser-déposer, avec la
  largeur max de 20 contrôlée et les statistiques §6.2 recalculées en direct. Formation d'une
  division avec aperçu des coûts et blocage explicite si le stock est insuffisant.
- **Ordres** depuis l'écran ou par clic droit sur la carte : assigner au front, avancer vers une
  province voisine, tenir, se replier.
- **Combat terrestre** (MECHANICS §6.3) résolu chaque jour : capture de province, repli ou
  destruction des défenseurs, bonus du Mur, facteur aléatoire déterministe.
- **Mode de carte Fronts** (FEATURES §13) : lignes de front, pions de divisions, icône de combat.
  Un clic sur l'icône ouvre le détail chiffré du calcul.
- **Titans purs** (§6.4) : −2 points d'effectif par jour en zone hachurée.
- `supply_value` recalculé avec les divisions de front (§3.4).
- Données absentes et choix d'interprétation : voir `docs/PHASE3_GAPS.md`.

## Contenu de la Phase 4 (cahier des charges §12)

- **Focus nationaux** (MECHANICS §5 ; FEATURES §6) : arbres des 4 nations, contenu **[EXTENSION]**
  rédigé pour ce projet (`data/focuses.json`), états des nœuds, effets en langage clair, raisons de
  blocage, focus d'évitement de la chaîne historique.
- **Évènements** (§5.3 ; FEATURES §14.2) : conditions de la table évaluées chaque jour derrière le
  verrou `historicalMode`, modale bloquante, choix, effets. **Mode libre = aucun évènement scripté**.
- **Diplomatie** (§8 ; FEATURES §9) : relations, actions avec seuils et coûts (boutons désactivés
  avec la raison), but de guerre sur 90 jours puis déclaration, alliés et garants entraînés, score
  de guerre et paix à 100, historique filtrable.
- **Brouillard progressif** (§10) : focus `EXPLORATION_`, contact diplomatique, brèche de 845 (qui
  révèle Marley), découverte de l'océan (contours du monde).
- **Journal** (FEATURES §14.3) filtrable par catégorie et par dates, cloche avec compteur de non-lus.
- Contenu [EXTENSION], manques et choix : `docs/PHASE4_GAPS.md`.

## Structure

```
server/launcher/   démarrage, choix du port, ouverture du navigateur
server/state/      GameState, brouillard, sauvegardes, réglages
server/simulation/ horloge, tick, économie, recherche, militaire, focus, évènements, diplomatie
server/app.js      API REST + WebSocket
client/            interface (JS natif, Canvas 2D), theme.css, polices OFL auto-hébergées
shared/            constantes MECHANICS_SPEC, calendrier
data/              nations.json ; data/map/ (carte à fournir, voir README)
tools/             validateur de carte
tests/             tests node:test + carte de test abstraite
```
