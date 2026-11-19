# Jetpack TECHride

A side-scrolling jetpack game from the TECH committee, set at a 46-hour
dance marathon.
You are **TECHBOT**. You have one jetpack, 46 hours and zero chairs. Fly the
tunnel around the dance floor, dodge everything the committee forgot to
unplug, collect donations, and stay standing.

Everything in the game is original and generated in code: the art is drawn
as vector shapes on a canvas and the sound is synthesised in the browser.
There are no image or audio files. The dance-marathon theme is carried by
words and original drawings only (dancers, glow sticks, banners, the 46-hour
clock); the game contains no event or organisation names, logos, marks or
mascots. The only bundled asset is the Chakra Petch typeface (SIL
Open Font License, see `fonts/OFL.txt`).

## Play

No build step and no dependencies.

- **Quickest:** double-click `index.html`.
- **Local server:** `python -m http.server 8000` in this folder, then open
  http://localhost:8000.
- **Online:** upload the folder to any static host (GitHub Pages, Netlify,
  an S3 bucket). For GitHub Pages: Settings → Pages → deploy from the branch root.

## Controls

| Input | Action |
|-------|--------|
| Hold **Space** / **↑** / **W** / mouse button / finger | Fire the jetpack |
| Release | Fall |
| **P** or **Esc** | Pause |
| **M** | Mute |
| **Space** or **Enter** | Play / play again |

The game pauses by itself when the window loses focus.

## What's in a run

Every 50 m is one hour of the marathon. The arena changes look every 8 hours,
and reaching hour 46 (2,300 m) earns a celebration and a bonus. After that
it is overtime.

**Hazards** (anything glowing red is dangerous):

- **Live Cables** — electric gates: fixed, diagonal, spinning, sliding, doorways and slaloms.
- **Livestream Drones** — spiked camera drones that bob up and down.
- **Merch Missiles** — a marker tracks you, locks, then the missile launches along that line.
- **Laser Show** — emitters slide in, a tracer shows the exact line, then the beam fires.

**Power-ups:**

| Pickup | Effect |
|--------|--------|
| Moraler Shield | Absorbs one hit |
| Canning Magnet | Pulls nearby donations to you for 10 s |
| Donor Match | Every donation counts double for 10 s |
| Tech Ultra Bot | 7 s as a huge armoured robot (dark plating, cape, twin boosters): faster, invincible, smashes hazards, pulls in donations |

**Spell T-E-C-H, get The F-150.** Four letter tiles appear one after another
from the start of a run; the tracker in the top-right corner shows which ones
you hold. A missed letter comes round again, and they can be collected in any
order. The fourth one calls in **The F-150** for 10 s:

- It is a white crew cab, drawn at 3.2 times the size of everything else,
  with a colour-matched cap over the bed (dark glass, 4X4 decal), chrome
  bumpers and alloy wheels. On top of that: a roof rack with a strapped-down
  spare wheel and fuel can, a light bar, a beacon, air horns, a snorkel, a
  bull bar with spot lamps and a winch, a whip antenna, mud flaps, fuzzy
  dice and neon under-glow.
- Nothing hurts it. It smashes every hazard it touches (+3 each) and scoops
  up donations across a very wide path.
- Tap to hop, tap again in the air to double-jump; hold to float higher.

When it drives off, the letters start over. A clean first set takes about
15 s, so nearly every player gets the truck in a single run; later sets come
more slowly. The timing is `nextLetter` in `spawnAhead` and `TRUCK_T`, both in
`js/game.js`.

**Other rides** appear as pickups once the first F-150 has been earned. They
change the controls and take one hit for you.

| Ride | Controls |
|------|----------|
| Water Buggy | Hold to rise on water jets, release to sink, at a steady speed |
| Moving Van | Tap to flip between driving on the floor and on the ceiling |

These last 14 s or until something hits them. Laser walls don't start while
you are on any ride. The names and blurbs are in `art.POWERUPS` in
`js/art.js`; the drawings are `drawRideBack` / `drawRideFront` in the same
file. The vehicles are drawn as generic types with no logos or badges (the
truck's door says "TECH"). The truck is named "The F-150" in its banner and
the help screen; that is the only manufacturer name in the game.

**Built for one run per person:** every run starts with a Moraler Shield (one
free mistake), the letter hunt starts in the first few seconds, and hazards
are introduced one type at a time.

**Also:** Line Dance stretches (a long hazard-free wave of donations),
close-call bonuses, a marker showing your best distance as you approach it,
a local Top 10, three difficulty levels, and a Hangar where the donations you
have raised unlock five more bots. Each has its own gear and face, not just a
colour: Cold Brew (a cup for a head, a bendy straw, a thermos jetpack), Ice
Bath (snow cap, rubber duck), Glow Stick (neon that changes colour, an
equaliser on its chest), Stage Crew (headset, backstage pass, torch) and
Total Reveal (gold, crowned, twinkling). They all share the same hitbox.

Progress is stored in the browser (`localStorage`); Settings → Reset Progress clears it.

**Jokes** live in three places if you want to add your own: `QUIP` at the
top of `js/game.js` (in-run pop-ups and hour banners), `CAUSES`, `TIPS`
and `hourQuip` at the top of `js/ui.js` (results headlines, menu tips), and
the banner and sign text in `buildFar` / `buildWall` in `js/art.js`.

## Hitboxes

Every collider is a **capsule** (a line segment with a radius), tested with an
exact segment-to-segment distance, so collisions follow the rounded shapes on
screen instead of loose boxes:

- The runner is one capsule along its spine, head to hips, and it tilts with
  the body. Legs, antenna, jetpack and flame never count.
- A live cable is its beam core plus the two emitter housings. The glow never hurts.
- Drones are a circle inside their spikes; missiles are a capsule along the body.
- Lasers only hurt while the beam is at full strength, not while fading in or out.
- Coins use a generous pickup radius.

Turn on **Settings → Show hitboxes** to see all of them drawn over the game.
The radii are in one place: `HB` at the top of `js/game.js`.

## Project layout

| Path | What |
|------|------|
| `index.html` | Page, HUD and menu markup |
| `css/style.css` | Interface styles |
| `js/util.js` | Math, capsule collision, save data |
| `js/audio.js` | Sound effects, jetpack roar and music (Web Audio) |
| `js/art.js` | All drawing: runner, coins, hazards, power-ups, scenery, colour schemes |
| `js/game.js` | Physics, level generation, hazards, collisions, effects, rendering |
| `js/ui.js` | Menus, HUD, results, Hangar, Top 10, settings |
| `js/main.js` | Start-up, input, scaling, frame loop |
| `fonts/` | Chakra Petch (OFL) |

## Tuning

- **Feel and difficulty:** constants at the top of `js/game.js` (gravity, lift,
  speeds, how fast difficulty ramps, power-up durations, the three difficulty presets).
- **Obstacle patterns:** `PATTERNS` in `js/game.js`. Each function places hazards
  and returns how much room it used. Gaps between patterns are measured in
  time, so they stay fair as the speed rises.
- **Bots:** `art.SKINS` in `js/art.js` holds the colours, names and prices. A
  skin's `kit` selects its gear and face, drawn by the `kit*` functions just
  below it.
- **Arena colours:** `art.THEMES` in `js/art.js`. **Hour length:** `HOUR_M` in `js/game.js`.
- **Name:** the title is in `index.html` (`<title>` and the `.logo` block).

## Testing

The game exposes its state as `TR` in the browser console:

```js
TR.game.debug.autopilot = true   // a look-ahead bot flies the run
TR.game.debug.god = true         // no damage
TR.game.grant('ultra')           // or 'shield', 'magnet', 'rush', 'buggy', 'van'
TR.game.grant('truck')           // The F-150, without collecting the letters
```

The same bot flies the demo behind the main menu. It is also how the level
generator was checked for unavoidable hits.

## History

Earlier versions of this repository held a C/SDL build with different art.
That version was replaced by this one; it remains in the git history.
