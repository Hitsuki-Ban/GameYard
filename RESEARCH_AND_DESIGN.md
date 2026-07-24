# TUMBLEDRUM — research synthesis and product design

## 0. Product thesis

**TUMBLEDRUM** is a one-axis arcade game in which a lacquered festival drum-cart keeps a brass ball aloft and tears down hand-built paper parade floats. The game is designed so that a player can touch the pointer, see the cart follow, and begin having fun before reading anything.

The central product rule is:

> Every spectacular effect must explain a successful action, reveal a system state, or foreshadow a consequence.

This excludes indiscriminate particle noise. The spectacle is dense, but causal.

The target experience has three layers:

1. **Immediate:** wide forgiving paddle, obvious center target, material-specific impacts, automatic serving.
2. **Masterable:** contact point controls angle; center hits charge the ball; brick systems create planned cascades.
3. **Replayable:** bounded run upgrades, authored stage grammar, a boss, endless generation, score mastery, persistent stamps.

There is no monetization, waiting timer, daily obligation, or loss-aversion economy. Retention is built from competence, curiosity, expressive control, and compact goals.

---

## 1. Breakout-family research

### Breakout (Atari, 1976)

The original establishes the durable atom: a single horizontal control protects a ball while the wall visibly depletes. Its clean progress display and one-dimensional input are ideal for immediate comprehension. Its weaknesses are equally instructive: low intervention between paddle contacts, repetitive one-brick attrition, harsh loss from a small paddle, and tedious cleanup of isolated final bricks.

**Extracted rule:** preserve the one-axis clarity, but increase agency, hit density, and end-of-stage acceleration.

### Arkanoid and modern classicist revivals

Arkanoid’s lasting expansion is the readable power-up drop: a broken block changes the paddle, ball count, or offensive capability. Modern revivals such as *Breakout: Recharged* add challenge sets, endless scoring, co-op, and overtly transformative power-ups. *Arkanoid – Eternal Battle* demonstrates that the core can support alternate modes and competitive pressure.

**Extracted rule:** power-ups should visibly alter play rather than merely add a percentage. However, a large random drop table can obscure causality, so TUMBLEDRUM uses authored gift bricks and a small stable vocabulary.

### Shatter

*Shatter* gives the player continuous influence through “suck and blow,” turns brick fragments into a resource, varies playfield geometry, and culminates in bosses. It proves that the genre benefits when the player can do more than wait for the next paddle contact.

**Extracted rule:** add an active layer without destroying the one-axis readability. TUMBLEDRUM does this through a visible paddle sweet spot and a player-triggered, clearly charged Parade state rather than persistent two-button airflow.

### Peggle

*Peggle* narrows the completion target to the orange pegs, uses limited attempts, offers a bottom bucket as a dramatic save, and treats the final required hit as a theatrical climax. The player can understand the objective from color and staging before understanding the score model.

**Extracted rule:** do not require every object to be cleared. Required float pieces carry a white knot stamp, the last few targets pulse, and the finale pauses before the collapse.

### holedown

*holedown* combines ricochet prediction, limited shots, fixed blocks, crystals, upgrades, and procedural planets. Its appeal comes from making a chaotic bounce field sufficiently legible that the player can form a plan, then enjoy deviations.

**Extracted rule:** uncertainty should be reducible. Geometry, ropes, cracks, fuse markings, and projected motion teach what is likely to happen; randomness selects arrangements and upgrade offers, not arbitrary collision outcomes.

### Peglin

*Peglin* converts the ball/peg interaction into run-level buildcraft through orbs, relics, bosses, and a generated route. It demonstrates that physics play can support long-term synergy decisions.

**Extracted rule:** give upgrades qualitative identities and caps. TUMBLEDRUM offers three animated talismans after selected stages; each has a visible mechanical consequence and three levels at most.

### Wizorb and Strikey Sisters

These games wrap brick breaking in a world structure, magic attacks, bosses, secrets, co-op, and characterful art. They demonstrate that the genre benefits from authored destinations rather than an undifferentiated level list.

**Extracted rule:** campaign stages belong to three visual acts and end in a bespoke parade-float boss. Progress is shown as knots on one rope, not a menu grid.

### Ricochet Infinity

The Ricochet series adds optional rings, unlocks, extensive brick vocabulary, and community level creation. The key lesson is that optional mastery goals can coexist with basic completion.

**Extracted rule:** score, no-miss clears, combo stamps, and Endless depth are optional mastery layers. They never block campaign continuation.

### Breakout Beyond

*Breakout Beyond* rotates the play direction, includes 72 levels, offers a score-costing focus mode, and ramps procedural audiovisual intensity with combo length.

**Extracted rule:** effects should have a systemic intensity curve. TUMBLEDRUM’s percussion, crowd layer, paper density, camera impulse, and parade ornamentation increase in discrete combo bands so the player can read escalation.

### Against Great Darkness and other roguelite hybrids

Recent hybrids use persistent bouncing to trigger relics, combine the core with bosses and hostile patterns, and create run-to-run synergies.

**Extracted rule:** build depth can sit on top of the bounce loop, but combat clutter must not steal visual priority from the ball. TUMBLEDRUM keeps hazards secondary and uses the same material language as bricks.

---

## 2. Game-feel and motivation synthesis

### Response and predictability

Steve Swink’s game-feel framework distinguishes challenge from interference: a difficult result is acceptable when the same input produces a predictable consequence; ambiguous or delayed control breaks the player’s belief in the system. TUMBLEDRUM therefore:

- reads pointer and keyboard input every frame;
- uses a fixed high-frequency physics step;
- clamps degenerate ball angles;
- expands the paddle collision volume slightly beyond the visible art;
- maps contact position monotonically to outgoing angle;
- reserves camera movement for short impact impulses and never moves the playfield origin.

### Juicy feedback: success-dependent, differentiated, bounded

A 2024 preregistered CHI study with 1,699 participants found that curiosity was the strongest predictor of enjoyment and the only measured construct directly associated with voluntary playtime. Success-dependent feedback supported competence, while indiscriminate amplification could reduce agency by obscuring action–outcome links.

Implementation consequences:

- paddle motion alone is quiet;
- a normal hit, center hit, brick break, chain collapse, and boss wound have different sound/shape grammars;
- material particles originate at the collision point and inherit momentum;
- large camera impulses occur only on rare high-value events;
- random visual variants never change the meaning of an event;
- the player can learn why a large effect occurred.

### Flow is not “always perfectly matched”

Recent flow research suggests high challenge and high perceived skill matter, and flow can be higher when skill slightly exceeds challenge than when challenge exceeds skill. TUMBLEDRUM therefore biases early play toward competence rather than intimidation. Difficulty increases through composition and speed only after the player demonstrates stable returns and combo maintenance.

The assist system is deliberately hidden and reversible:

- repeated drains slightly widen the paddle and reduce serve speed;
- a failure grants one visible paper safety fan on the retry;
- strong performance removes assistance and raises speed within a capped range;
- campaign score is treated as a personal record rather than a strict competitive ranking; Endless omits campaign retry assistance so wave depth remains the clearer mastery comparison.

### Engagement architecture

**Micro loop (seconds):** position → contact → angle → break → material feedback → fragment intake.

**Meso loop (one stage):** identify structural rule → open route → trigger cascade → finish marked targets → spectacle payoff.

**Run loop (10–25 minutes):** choose talismans → form synergies → face denser compositions → defeat the float boss.

**Mastery loop:** improve center-hit rate, no-miss clears, combo records, Endless depth, and stamps.

This is “sticky” because the player repeatedly resolves learnable uncertainty and sees competence expressed, not because the game withholds rewards behind timers or purchases.

---

## 3. Anti-“AI slop” design audit

The phrase “AI slop” is subjective and culturally unstable, but 2026 design discussion has converged on a useful heuristic cluster: default Inter/Geist typography, lavender gradients, permanent low-contrast dark mode, glows, glassmorphism, identical icon cards, centered hero templates, numbered steps, generic rounded components, emoji navigation, and motion applied as a universal decoration. Adrian Krebs’ deterministic audit of 1,590 recent Show HN pages found that 54% triggered at least two of a 16-pattern checklist; the author correctly notes that these patterns are not inherently bad, but become a sign of unexamined defaults.

TUMBLEDRUM explicitly rejects the cluster:

- no purple/blue gradient, neon, sci-fi dashboard, glass panel, or glow halo;
- no Inter, Roboto, Space Grotesk, or generic SaaS type pairing;
- no card grid or badge-above-hero landing page;
- no Lucide-style outline icon set;
- no universal 16 px radius;
- no dark grey text on dark grey panels;
- no decorative particles detached from physical events;
- no perfectly repeated geometric surfaces.

Instead it commits to one physical product language:

- **materials:** rice paper, lacquered wood, clay, bamboo, rope, brass;
- **palette:** soot indigo, paper cream, vermilion, ochre, weathered green, plum, dark wood;
- **shape:** cut paper, tied banners, hanging charms, stamped seals, carved rails;
- **type:** local serif/mincho stacks with imperfect letterpress shadow, used sparingly;
- **layout primitive:** objects hang from or sit on the same wooden festival frame;
- **motion:** paper flutters, clay chips, wood splinters, rope pulls, brass rings;
- **imperfection:** seeded edge wobble, print misregistration, grain, asymmetric ornament.

The result is not “anti-polish.” It is a polished system with a specific material thesis.

---

## 4. Product design language

### 4.1 Semantics by material

| Material | Gameplay meaning | Shape cue | Motion cue | Sound cue |
|---|---|---|---|---|
| Paper lantern | one-hit target | soft rectangle / lantern ribs | implodes then flutters | dry pop |
| Clay tile | two-hit armour | heavy slab / scored crack | chips, then splits | ceramic tick + thud |
| Bamboo crate | three-hit mass | bound slats | splinters and recoils | hollow knock |
| Firecracker drum | radial chain | circular face + fuse | compresses before burst | rising fizz + drum |
| Pinwheel | trajectory modifier | four-blade rotor | rotates with impact | wooden clack |
| Rope anchor | structural support | knot stamp + visible ropes | linked group sags/falls | rope snap |
| Brass bell | score / Parade charge | bell silhouette | swings and rings | pitched chime |
| Gift parcel | stable power-up source | wrapped paper + pictogram | unfolds | two-note flourish |

Color is redundant. Every type has a unique silhouette, internal mark, motion, and sound.

### 4.2 Feedback hierarchy

1. **Contact:** 1–3 particles, tiny squash, positional sound.
2. **Break:** material burst, score chip, short camera nudge.
3. **Center hit:** gold drum ring, ball charge, low-frequency “DON,” stronger nudge.
4. **Chain event:** rope propagation, sequential timing, wider audio interval.
5. **Parade:** added percussion layer, extra balls, broad paper streamers, expanded paddle.
6. **Stage clear:** 120 ms anticipation pause, target collapse, paper curtain transition.
7. **Boss defeat:** multi-stage tear-down, full-frame confetti, final cadence.

### 4.3 Text policy

The title, score numerals, and optional settings tooltips may use text. Core play, goals, upgrades, health, mode choice, and tutorialization use spatial motion and pictograms. The first playable title screen acts as the tutorial.

### 4.4 Localization and accessibility

All player-facing document metadata, accessible names, status announcements, and canvas text are available in Japanese, Simplified Chinese, and English. The default preference follows the browser/system locale: Japanese and Chinese language families select their matching catalog, while every other locale uses English. A visible language row in Settings can override that choice at any time.

Localization must not alter gameplay geometry or weaken the zero-reading play surface. Locale-specific system serif/mincho stacks preserve the physical festival-print language without adding network font dependencies. Reduced-motion mode lowers and caps particle work, suppresses streamers, and retains the causal cues required to understand contact, breakage, and progression.

---

## 5. Core mechanics

### One-axis paddle

Pointer/touch position or left/right keys move the drum-cart. The visible gold center is the sweet spot. Contact position controls angle continuously.

### Center “DON”

A center return charges the ball. Charged balls pierce several weak targets and emit a small first-impact shockwave. The center is generous at first and becomes a mastery target rather than a required timing test.

### Parade meter

Successful breaks and center returns pull material scraps into the drum. At full charge, the large bottom gong pulses. A click/press activates Parade; after a short delay it auto-activates so a non-reading player cannot strand the mechanic. Parade temporarily widens the paddle, adds charged multiballs, and raises the audio/visual layer.

### Structural cascades

Anchor blocks visibly support rope-linked groups. Breaking an anchor makes linked pieces fall and damage neighbours. This creates authored “aha” moments and high spectacle without random screen clears.

### Marked completion targets

Only pieces bearing the white knot stamp are required. When three remain, they pulse and balls gain a mild delayed bias toward them, eliminating low-energy final-brick cleanup.

### Talismans

At selected stage boundaries, three large hanging paper charms appear. The player selects one by touching/clicking it. Each icon animates its consequence. Possible upgrades include paddle width, sweet-spot width, charge pierce, explosion radius, Parade duration, Parade ball count, reserve beads, and a safety fan.

---

## 6. Content structure

### Campaign

Three acts, twelve authored stages, one final boss. Each act introduces no more than two new concepts before recombining them.

- **Act I — Lantern Lane:** basic return, clay, bombs, first anchor cascade.
- **Act II — Paper Menagerie:** moving shapes, pinwheels, gifts, linked structures.
- **Act III — Grand Procession:** dense combinations, vertical motion, multiball control, boss rehearsal.
- **Finale — The Great Mask:** break four support drums, expose the face core, survive three readable phases, collapse the entire float.

### Endless

Procedural waves use the same authored grammar: mirrored rows, arches, hanging clusters, staircases, rings, and offset columns. Difficulty scales through density, HP mix, movement, and speed, not by hiding the ball or shrinking it below readability.

### Persistence

Local storage saves the language preference, accessibility/audio settings, best campaign score, best Endless wave, clear status, and six mastery stamps. No account or network is required.

---

## 7. Source notes

Primary and high-value references consulted during design:

- Atari, *Breakout: Recharged*: https://atari.com/products/breakout-recharged
- Atari / Choice Provisions, *Breakout Beyond*: https://atari.com/products/breakout-beyond
- Microids, *Arkanoid – Eternal Battle*: https://www.microids.com/game-arkanoid-eternal-battle/
- PikPok, *Shatter Remastered Deluxe*: https://pikpok.com/news/shatter-remastered-deluxe-brings-you-classic-brick-breaking-action-like-you-have-never-seen-it-before-smashing-onto-console-and-steam-in-late-2022/
- grapefrukt games, *holedown*: https://holedown.com/
- PopCap / EA, *Peggle Deluxe* product description: https://store.steampowered.com/app/3480/Peggle_Deluxe/
- Red Nexus Games, *Peglin*: https://store.steampowered.com/app/1296610/
- Tribute Games, *Wizorb*: https://store.steampowered.com/app/207420/Wizorb/
- DYA Games, *Strikey Sisters*: https://store.steampowered.com/app/643880/
- Hitreg Studios, *Against Great Darkness*: https://store.steampowered.com/app/2302150/
- Kao et al. (CHI 2024), “How does Juicy Game Feedback Motivate?”: https://doi.org/10.1145/3613904.3642656
- Hicks et al. (DiGRA 2018), “Good Game Feel”: https://doi.org/10.26503/dl.v2018i1.936
- Swink, *Game Feel: A Game Designer’s Guide to Virtual Sensation*.
- Wojtasiński et al. (2025), skill–challenge interaction and flow: https://doi.org/10.1007/s10902-024-00846-4
- Adrian Krebs (2026), deterministic AI-design-pattern audit: https://www.adriankrebs.ch/blog/design-slop/

The research supports design decisions; it does not imply that any single cited title or paper endorses TUMBLEDRUM’s full synthesis.
