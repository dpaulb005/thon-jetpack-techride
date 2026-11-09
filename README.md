# THON Jetpack TECHride

A THON-themed side-scrolling jetpack game made by the THON TECH committee.
Fly through, dodge zappers, lasers and rockets, collect gold Four Diamonds
fundraising coins
and power-ups. **FOR THE KIDS.**

Controls: hold **Space** to fly up, release to fall. You fly as TECHBOT by default;
pick another runner and the difficulty in **Settings**. Beat your best
distance and the end screen says **NEW BEST** with a confetti burst. The
celebration clip plays on every end screen. **Play Again** starts a new run
right away; **Menu** goes back to the home screen.

**Top 10:** the home screen shows the 10 best runs. When a run makes the
board, type a name on the game-over screen and press **Enter** (clicking
Menu/Play Again also saves it, as "DANCER" if no name was typed). Scores are
kept in `leaderboard.txt` next to the .exe, or in the browser's storage for
the web version (survives refreshes; clearing site data resets it). To reset
the board, delete `leaderboard.txt` and `best_distance.txt`, or clear the
site data for localhost in the browser.

---

## Play it

### In a browser (localhost)
```sh
brew install emscripten     # one time
make game                   # builds web/ and serves it
```
Open http://localhost:8000.

### As a website
`make web` puts everything in `web/` (`index.html`, `index.js`,
`index.wasm`, `index.data`). Upload that folder to any static host:
GitHub Pages, Netlify, an S3 bucket, or a Penn State web space.
It must be served over http(s). Opening `index.html` straight from disk
won't work.

### As a Windows .exe
```sh
brew install mingw-w64      # one time
make exe
```
This creates `dist/THON-Jetpack-TECHride-Windows.zip`. Unzip it on any Windows PC and
double-click `THON-Jetpack-TECHride.exe`. Keep the DLLs and the `assets` folder next to
the .exe. The first run downloads the SDL libraries into `build/win/`.

---

## Website menu (web version)

The web build's page (`tools/shell.html`, built into `web/index.html`) is the
game's menu: Home, Play, Characters, Power-Ups, Hazards, Backgrounds, Asset
Library, Top 10 and Settings. **Play** shows the real game; leaving the Play
page or picking **Menu** on the end screen returns to the site. The page
talks to the game through the `web_*` functions at the bottom of
`demo/game.c` (start/stop a run, character, difficulty, background,
particles, Top 10 name) and reads the Top 10 straight from the game's save
folder. `make web` copies `assets/` next to the page, so every preview is the
same file the game loads. The Windows .exe keeps its built-in menus.

## Sprite sheets -> game sprites

The concept sheets in `new_assets/` are cut into frames by

```sh
python3 tools/extract_sheets.py
```

It handles light sheets (characters) and dark glowing sheets (hazards,
coins, accessories, effects); it finds each drawing on a row, removes the
sheet background, aligns the
frames on a shared canvas and writes `assets/techride/characters/...` plus
`assets/techride/manifest.txt` (frames, fps, size, anchor per animation).
It also builds the full-width lasers and the THON Arena parallax layers,
and measures head anchors so accessories sit on each character. Rows and
crop boxes are listed at the top of the script. Characters use
them via `characters.txt` lines like `TECHBOT|@techbot`.

## Testing

The web build has hooks for automated checks: `web_stats()` returns the run
state as JSON (distance, coins, power-up, TUB smashes, runner position,
hazards on screen). Test builds add `web_test_powerup(type)` and
`web_test_spawn(kind)`:

```sh
make web CFLAGS="-Iinclude -Wall -O2 -DGAME_TEST" TEST_EXPORTS=',"_web_test_powerup","_web_test_spawn","_web_test_probe"'
```

`-DGAME_SOAK_TEST` turns off crashing for long performance runs.

**Hitboxes:** turn on Settings → *Show hitboxes (for testing)* to outline
every collision shape (green runner, red hazards, yellow coins, cyan
power-ups). The runner's broad oval is only a first check: a hit counts
only if a hazard touches the traced outline of the frame being shown (tilt
included), generated per frame by `tools/extract_sheets.py` (the jetpack
flame never counts). Each hazard collides only on its dangerous part (the
zapper's beam, the missile's person rather than its flame, the spike tips).
Coins and power-ups are never placed within `HAZARD_CLEARANCE` px of a
hazard, and a new hazard clears any coins it lands on.

**Speed:** the world starts at 165 px/s and speeds up with distance to 260
(`BACKGROUND_SCROLL_SPEED`, `WORLD_SPEED_*` in `library/constants.c`).

**Hazards by difficulty:** Easy adds drones, mines, floor spikes and crates;
Medium adds the dual laser, moving laser and falling block; Hard adds the
rotating laser and homing rocket.

**Full automated check:** `tools/playtest.mjs` plays through the site and game
in headless Chrome on an emulated 2x screen (instructions at the top of the file).

**Sharpness:** sprites are enlarged by `tools/extract_sheets.py` (`UPSCALE`),
frames are lined up by the head so bodies don't jump, and the game fades
briefly between animation frames. Enlarging can't add detail the sheets don't
have; truly sharper characters need the art redrawn at a larger size.

## Adding characters

Characters are listed in [`assets/characters/characters.txt`](assets/characters/characters.txt):

```
TECHBOT|@techbot                  <- first line = default runner (animated set)
Nittany Lion|@lion
Real TECH Robot|robot.png         <- a single photo sprite
Dancer|dancer/|15                 <- animated: folder of 15 frames (00.png ... 14.png)
```

The **Character** button in Settings cycles through them in this order. To
add one:

```sh
# a photo of a person (background removed automatically on macOS)
python3 tools/make_character.py photo.jpg "Captain Name" --remove-bg

# a short video -> animated character (background removed from every frame)
python3 tools/make_character.py clip.mov "Dancer Name"

# a PNG that's already cut out (transparent background)
python3 tools/make_character.py cutout.png "Mascot Name"
```

The tool trims the image, adds a jetpack flame, saves a 256×256 sprite, and
adds the line to `characters.txt`. Then rebuild (`make web` / `make exe`).
You can also edit `characters.txt` by hand to rename or reorder characters,
or drop a line to hide one.

Tips:
- Automatic background removal (`tools/cutout.swift`) uses macOS's built-in
  person detection. It works well for people. For costumes it can miss
  (e.g. the Nittany Lion), so cut the photo out yourself and pass the PNG.
  [`tools/color_key_cutout.py`](tools/color_key_cutout.py) is what made the
  lion cutout; it keys on fur color.
- Keep videos short (1–3 s). Every frame ends up in the download.
- `pip install pillow` is needed for the Python tools.

## Power-ups

Each power-up has its own pickup icon, so you can see what you're grabbing.
Picking one up shows a banner at the top of the screen with its name and what it does, and a
countdown bar (with its icon) appears under the score. The effect around
the runner blinks in the last few seconds before it runs out. Each lasts
10 seconds; grabbing a new one replaces the current one.

| Pickup | Name | What it does |
|--------|------|--------------|
| Blue shield | **SHIELD** | Zappers, lasers and rockets can't hurt you |
| Red magnet | **COIN MAGNET** | Pulls nearby coins straight to you |
| Gold coins "x2" | **FUNDRAISING RUSH** | Way more fundraising coins show up |
| Green TUB robot | **TECH ULTRA BOT** | Giant robot mode: invincible, smashes hazards, pulls in coins |

Names, descriptions and colors are in `library/constants.c`
(`POWERUP_NAMES`, `POWERUP_DESCRIPTIONS`, `POWERUP_COLORS`); the art is drawn
by `tools/make_theme_assets.py`. To test them quickly, build with
`make web CFLAGS="-Iinclude -Wall -O2 -DPOWERUP_TEST"` (pickups then arrive at
floor level every 5 seconds) -- delete `out/*.wasm.o` and run `make web`
again afterwards for the normal game.

## Body rockets

After the warning sign, a committee member comes flying in as a rocket: cut
out of their photo, laid flat head first, with a jetpack flame from their
feet. Each launch picks one at random from
[`assets/rockets/rockets.txt`](assets/rockets/rockets.txt). To add someone:

```sh
python3 tools/make_rockets.py photo.jpg                 # cut out, turn sideways
python3 tools/make_rockets.py photo.jpg --faces 0,1     # keep two people
python3 tools/make_rockets.py photo.jpg --erase X0 Y0 X1 Y1   # blank out a bystander
python3 tools/make_rockets.py --list                    # see current rockets
python3 tools/make_rockets.py --remove body_03.png      # take one out
```

Background removal and face finding use macOS's built-in Vision
(`tools/cutout.swift`, `tools/faces.swift`). Only the person attached to the
main face is kept; if someone in the background still sneaks in, use
`--erase` with a rectangle around them (pixels from the photo's top-left).
Original photos are kept in `art_src/rockets/`.

## End-screen clip

The end screen plays the animation in `assets/celebration/` (frames `00.png`, `01.png`, ... plus
`celebration.txt` holding the frame count). To swap it for another clip:

```sh
python3 tools/make_character.py clip.mov --celebration
```

The best distance is saved alongside the top 10 (see above).

## Changing the look

All THON art (arena background, obstacles, coins, power-ups, buttons, menu
screens) is generated by [`tools/make_theme_assets.py`](tools/make_theme_assets.py)
into `assets/theme/`. Edit the palette or shapes there and run:

```sh
python3 tools/make_theme_assets.py
```

The gameplay background is a neutral metal corridor by default. Set
`BACKGROUND_STYLE = "arena"` in the script for the drawn THON arena instead.

To use a **photo as the gameplay background**, save it as
`art_src/background_photo.jpg` (or `.png`) and re-run the script. It's
cropped to fit, blended at the edges so it scrolls seamlessly, and darkened
slightly so obstacles stay visible. Use a photo the committee owns or has
permission to use, e.g. ask Onward State before using one of theirs.

Font note: the title/button font (`NewAthleticM54.ttf`) only draws letters,
digits, spaces and periods. Symbols like `! # - : '` render as blanks, so
keep in-game text to those characters.

Source files (logos, original photos, video) live in `art_src/`. The arena
photo that was tried as a background is parked in `art_src/alt_backgrounds/`. They're kept
out of `assets/` so they aren't bundled into the game.

## Project layout

| Path | What |
|------|------|
| `demo/` | Screens: home, settings, game play, game over |
| `library/` | Engine: physics, rendering, assets, achievements, `character.c` |
| `assets/theme/` | Generated THON art |
| `assets/characters/` | Character sprites and `characters.txt` |
| `art_src/` | Original logos, photos, video |
| `tools/` | Art generators, character tool, Windows build, web page shell |

## Credits

Game engine based on an open-source C student project by Adarsh Kumarappan,
Dhruv Sheth and Rayhan Zirvi (Caltech CS 3). All art in this version was
replaced with THON TECH committee art and photos.
