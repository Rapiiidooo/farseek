# Farseek glossary: French (`fr`)

Source of truth for `game/i18n/fr.js`. Translations live in `outputs/i18n/work-fr/parts/*.json`, keyed by a hash of the English key; `node outputs/i18n/work-fr/tool.mjs build` writes `fr.json` and the module, applying the typography rules below.

## Register and voice

| Speaker or surface                                       | Register                         | Notes                                                                                                                                 |
| -------------------------------------------------------- | -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| Interface, hints, objectives, tips                       | `tu`                             | Objective titles in the infinitive (they sit under the label "Objectif"); objective subtitles and hint bodies in the `tu` imperative. |
| HUD prompts after a key (`{interact} …`) and relic verbs | infinitive                       | `{interact} Prendre l’orbe relais de Mira`. A prompt key that is also an objective stays infinitive.                                  |
| Controls screen and kit wheel descriptions               | infinitive                       | "Sauter, se hisser", "Canaliser la lumière vers les mécanismes".                                                                      |
| Nyra (subtitles, relic reflections)                      | first person, `je`               | Terse, wry, determined.                                                                                                               |
| Mira, recorded messages for whoever follows              | `vous`                           | Generic listener: "Si vous avez franchi la porte après nous, écoutez."                                                                |
| Mira, notes and speech addressed to Nyra                 | `tu`                             | Warm, curious, dry. Signs "M."                                                                                                        |
| Wardens and the Clerk                                    | `vous`                           | Comic bureaucrats: "Veuillez", "Circulez", "Affaire classée", "Outrage à agent !".                                                    |
| Journal pages and field notes                            | `nous`, present or passé composé | Short field-note sentences, "Jour 9."                                                                                                 |

## Worlds

| English                                                                                     | French                                                                                                                                                                                                           |
| ------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| The Sunken Court                                                                            | La Cour enfouie                                                                                                                                                                                                  |
| The Checkpoint                                                                              | Le Poste-frontière                                                                                                                                                                                               |
| The Dawn Isles                                                                              | Les Îles de l’Aube                                                                                                                                                                                               |
| The Frozen Reach                                                                            | Les Confins gelés                                                                                                                                                                                                |
| The Wildwood (the wildwood)                                                                 | La Forêt sauvage (la forêt sauvage)                                                                                                                                                                              |
| The Drowned Archive (the drowned archive)                                                   | Les Archives englouties (les Archives englouties)                                                                                                                                                                |
| The Builders' Vault                                                                         | La Voûte des Bâtisseurs                                                                                                                                                                                          |
| bay (of the vault)                                                                          | alcôve                                                                                                                                                                                                           |
| Relayed light, The keeper, A bridge of light, Sliding ice, Sinking stones, The flooded well | Le relais de lumière, Le Veilleur, Un pont de lumière, La glace glissante, Les pierres qui sombrent, Le puits inondé (each keeps its article: the vault lowercases it into "suis la lumière de Mira vers {bay}") |

## Characters

| English                                       | French                                                     |
| --------------------------------------------- | ---------------------------------------------------------- |
| Nyra, Nyra Varen, Mira, Oldtusk               | unchanged                                                  |
| the builders                                  | les bâtisseurs (capital only in "La Voûte des Bâtisseurs") |
| the first expedition, the previous expedition | la première expédition, l’expédition précédente            |
| the Wardens, a Warden                         | les douaniers, un douanier (masculine, "il")               |
| Warden Crescent, Warden Wave, Warden Disc     | Douanier Croissant, Douanier Vague, Douanier Disque        |
| the clerk                                     | le préposé ("Le Préposé, guichet un")                      |
| the Tide Guardian, the guardian               | le Gardien des marées, le gardien                          |
| the keeper (vault)                            | le Veilleur, le veilleur                                   |
| frost lynx                                    | lynx du givre                                              |
| boar, Wildwood boars                          | sanglier, sangliers de la forêt                            |

## Places and things

| English                                 | French                                             |
| --------------------------------------- | -------------------------------------------------- |
| gate, gate address                      | portail, adresse du portail                        |
| door, the far door                      | porte, la porte lointaine                          |
| ring, the great ring                    | anneau, le grand anneau                            |
| the network                             | le réseau                                          |
| address, glyph                          | adresse, glyphe (m.)                               |
| crescent, waves, disc, spiral           | croissant, vagues, disque, spirale                 |
| stela, stelae                           | stèle, stèles                                      |
| bronze mirror                           | miroir de bronze                                   |
| stone block, ice block                  | bloc de pierre, bloc de glace                      |
| crystal, prism, lens, pylon             | cristal, prisme, lentille, pylône                  |
| bridge of light, light bridge           | pont de lumière                                    |
| seal, medallion, mask, channel          | sceau, médaillon, masque, canal                    |
| plate (checkpoint floor, vault floor)   | dalle                                              |
| plate (pistol target)                   | plaque                                             |
| register (small checkpoint plate)       | registre                                           |
| ledger                                  | grand livre                                        |
| stamp, to stamp, clean stamp            | tampon, tamponner, tampon net                      |
| stamp review                            | contrôle des tampons                               |
| window, booth, queue                    | guichet, guichet, file                             |
| confiscation bin                        | coffre des saisies                                 |
| confiscated property                    | biens confisqués                                   |
| offence, offender                       | infraction, contrevenant                           |
| barrier, barrier lamp                   | barrière, lampe de la barrière                     |
| drifting isle, wandering isle           | île dérivante, île errante                         |
| ferry (the drifting isle), ferry survey | bac, relevé du bac                                 |
| measuring station, bank                 | station de mesure, rive                            |
| crumbling stones                        | pierres friables                                   |
| rope swing, gantry                      | corde, portique                                    |
| frozen fall, scarred ice                | cascade gelée, glace entaillée                     |
| thin ice, ice sheet, floe               | glace fine, plaque de glace, radeau de glace       |
| cairn, red ribbon cairn                 | cairn, cairn au ruban rouge                        |
| pond, lake, channel, notch              | étang, lac, chenal, encoche                        |
| spore pod, spore bog, spore water       | capsule de spores, marais de spores, eau de spores |
| grove, giant tree                       | bosquet, arbre géant                               |
| thick ivy, bastion, outer wall          | lierre épais, bastion, rempart extérieur           |
| control desk, console                   | pupitre de commande, console                       |
| air shield, island of air               | bouclier d’air, îlot d’air                         |
| causeway, pressure causeway             | chaussée, chaussée de pression                     |
| pressure seal, pressure vent            | sceau de pression, évent de pression               |
| current, pier, landing, plaza           | courant, pilier, palier, esplanade                 |
| flooded stair                           | escalier inondé                                    |
| core, cracked core, open core           | cœur, cœur fêlé, cœur ouvert                       |
| amber mark, cyan vent, low wave         | marque ambre, évent cyan, vague basse              |
| trail, trail lantern, trail refuge      | piste, lanterne de la piste, refuge de la piste    |
| ledge, shelf                            | corniche                                           |
| far bank, far isle, far landing         | l’autre rive, l’île d’en face, le palier opposé    |

## Expedition gear and relics

| English                                                                            | French                                                                                                                                                    |
| ---------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| relay orb, the orb                                                                 | orbe relais, l’orbe (m.)                                                                                                                                  |
| Relay pull, Relay shield                                                           | Traction relais, Bouclier relais                                                                                                                          |
| twin pistols, Mira's pistols                                                       | pistolets jumeaux, les pistolets de Mira                                                                                                                  |
| field pistols, field kit, field radio, field notes                                 | pistolets de terrain, kit de terrain, radio de campagne, notes de terrain                                                                                 |
| expedition kit, expedition equipment, equipment wheel                              | kit d’expédition, équipement d’expédition, roue d’équipement                                                                                              |
| ice axes                                                                           | piolets                                                                                                                                                   |
| round, magazine, sight                                                             | balle, chargeur, mire                                                                                                                                     |
| pistol craft, Mira's craft                                                         | technique de tir, techniques de Mira                                                                                                                      |
| Steady hands, Fast reload, Quick trigger, Tight grouping, Heavy rounds             | Mains sûres, Rechargement rapide, Détente vive, Groupement serré, Balles lourdes                                                                          |
| relic                                                                              | relique (f.)                                                                                                                                              |
| record (Mira's written record)                                                     | note                                                                                                                                                      |
| record, stone memory (the builders')                                               | mémoire, mémoire de pierre                                                                                                                                |
| The first papyrus, The field radio, Mira's lost page, Mira's scarf, Mira's lantern | Le premier papyrus, La radio de campagne, La page perdue de Mira, L’écharpe de Mira, La lanterne de Mira                                                  |
| Mira's grove sketch, The archive field note, The builders' stone memory            | Le croquis du bosquet de Mira, La note de terrain des Archives, La mémoire de pierre des bâtisseurs                                                       |
| Mira's transit file, Mira's route survey, Mira's winter crossing                   | Le dossier de transit de Mira, Le relevé d’itinéraire de Mira, La traversée d’hiver de Mira                                                               |
| Mira's tide sketch, Mira's tide proof, Mira's camp record                          | Le croquis des marées de Mira, La preuve des marées de Mira (her worked proof of the guardian's pressure lines), La note de camp de Mira |

## Verbs and mechanics

| English                                        | French                                                                                                                                                                                                                                         |
| ---------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| walk, run, pace                                | marcher, courir, allure                                                                                                                                                                                                                        |
| jump, leap                                     | sauter, bondir                                                                                                                                                                                                                                 |
| hang (from an edge), let go                    | s’accrocher, lâcher prise                                                                                                                                                                                                                      |
| shimmy, climb, climb up                        | se décaler, grimper, se hisser                                                                                                                                                                                                                 |
| swing (rope)                                   | se balancer, prendre de l’élan                                                                                                                                                                                                                 |
| grab, turn, push, pull                         | saisir, tourner, pousser, tirer                                                                                                                                                                                                                |
| roll, dodge, sidestep                          | roulade (faire une roulade, esquiver d’une roulade), esquiver, pas de côté                                                                                                                                                                     |
| link (orb to crystal), the link, hold the link | relier l’orbe à, le lien, maintenir le lien                                                                                                                                                                                                    |
| tether pull, drag                              | attirer, tirer vers soi                                                                                                                                                                                                                        |
| charge, charged, recharge                      | charger, chargé, recharger                                                                                                                                                                                                                     |
| pulse (noun), plain pulse, charged pulse       | impulsion, impulsion simple, impulsion chargée                                                                                                                                                                                                 |
| pulse (verb)                                   | a verb that fits the target, with "d’une impulsion" where the mechanic needs naming: activer (lens, pylon, seal), frapper (ice, core, keeper), étourdir (creature), faire taire (spore pod); "envoie une impulsion" when the target is general |
| link (crystal already named)                   | établir le lien ("Vise le cristal et établis le lien pour charger l’orbe")                                                                                                                                                                     |
| wake, awake                                    | réveiller, éveillé                                                                                                                                                                                                                             |
| aim, fire, shoot, reload                       | viser, tirer, tirer sur, recharger                                                                                                                                                                                                             |
| stun, dazzle, wound                            | étourdir, éblouir, blesser                                                                                                                                                                                                                     |
| vent (pressure), surge                         | purger, poussée                                                                                                                                                                                                                                |
| breath, out of air                             | souffle, plus d’air                                                                                                                                                                                                                            |
| health, composure, pips                        | santé, sang-froid, pastilles                                                                                                                                                                                                                   |

## Controls

| English                                               | French                                                     |
| ----------------------------------------------------- | ---------------------------------------------------------- |
| Press {key}, press {key}                              | Appuie sur {key}, appuie sur {key}                         |
| Tap {key}, tap {key}                                  | Touche {key}, touche {key}                                 |
| Hold {key}                                            | Maintiens {key}                                            |
| Jump, Rise, Use, Hang, Dive                           | Sauter, Monter, Utiliser, Prise, Plonger                   |
| Link, Fire, Roll, Shield, Aim, Reload                 | Lien, Tirer, Rouler, Bouclier, Viser, Recharger            |
| Kit, Pace, Stick, Pause, Act, Equipment               | Kit, Allure, Stick, Pause, Agir, Équipement                |
| Walking, Running                                      | Marche, Course                                             |
| Space, Enter, Esc, Tab, Backspace, Caps Lock, Shift   | Espace, Entrée, Échap, Tab, Retour arrière, Verr. Maj, Maj |
| Click, Left click, Right click, Middle click, Mouse 4 | Clic, Clic gauche, Clic droit, Clic milieu, Souris 4       |
| Left {key}, Right {key}                               | {key} gauche, {key} droite                                 |
| Left stick, Right stick, D-pad up, View, Home         | Stick gauche, Stick droit, Croix haut, Affichage, Accueil  |

The touch buttons are circles 44 to 76 px wide in condensed capitals, so their labels stay at eight letters or fewer; "Prise" names the hang button for that reason. The kit badge is 64 px wide: "Au sac" (Stowed), "Vide", "Pas d’orbe", "Chargé {n} s".

Counts avoid plural agreement with a variable: `Lumière restante : {n} s`, `Secondes de souffle : {n}`, `munitions : {ammo}`.

## Interface

| English                                                         | French                                                                        |
| --------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| New game, Continue, Levels, Relics, Settings, Controls, Credits | Nouvelle partie, Continuer, Niveaux, Reliques, Paramètres, Commandes, Crédits |
| Resume, Restart level, Quit to title, Back, Are you sure?       | Reprendre, Recommencer le niveau, Retour au titre, Retour, Vraiment ?         |
| Objective, Gate address, Breath, Composure                      | Objectif, Adresse du portail, Souffle, Sang-froid                             |
| Story, Standard, Hard                                           | Histoire, Standard, Difficile                                                 |
| Hold, Toggle (aim mode)                                         | Maintenir, Basculer                                                           |
| Starring, Type (credits)                                        | Avec, Polices                                                                 |

## Typography

- Apostrophe ’ (U+2019); guillemets « » with U+00A0 inside; ellipsis … (U+2026).
- U+00A0 before `:` and between a number and its unit (`{n} s`); U+202F before `; ! ?`.
- Quoted writing after a colon goes in guillemets.
- No dashes in game copy; no capital after a colon except for names.
- Templates keep inserted names standing alone: `Préparation : {world}…`, `{action} garde ses commandes.`, `Examiner : {name}`.
