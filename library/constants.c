#include "constants.h"

// MISC:
const vector_t MIN = {0, 0};
const vector_t MAX = {1000, 500};
const vector_t CENTER = {500, 250};
const double ZERO = 0;
const size_t ONE = 1;
const size_t INITIAL_ASSET_CAPACITY = 10;
const size_t TEXT_SIZE = 50;
const size_t FONT_SIZE = 50;
const size_t OBSTACLE_HEIGHT = 30;
const size_t SCALE = 2;
const size_t INITIAL_CAPACITY = 5;
const size_t INITIAL_LIST_CAPACITY = 10;
const size_t LIST_START_INDEX = 0;
const size_t INITIAL_NUM_BODIES = 0;
const size_t INITIAL_BODY_CAPACITY = 10;
const size_t INITIAL_FORCE_CREATOR_CAPACITY = 5;
const double ROTATION_SPEED = 0.0;
const double INITIAL_ANGLE = 0.0;
const double ANGLE_90 = M_PI * 0.5;
const double HALF = 0.5;
const double MIN_DIST = 5;
const double DEFAULT_FORCE_CONSTANT = 0.0;
const double GRAVITY = 9.8;
const double G_CONSTANT = 2500.0;
const char WINDOW_TITLE[] = "THON Jetpack TECHride";
const int WINDOW_WIDTH = 1000;
const int WINDOW_HEIGHT = 500;
const int TOP_BAR_HEIGHT = 64; // status bar above the playfield
const double MS_PER_S = 1e3;
const double MAX_TICK_SECONDS = 0.1;
const double SCREEN_FADE_SECONDS = 0.25;
const double TEXT_RENDER_SCALE = 2;
const char *ERROR_MESSAGE_STATE = "Invalid state. Exiting...";
const char *EASY_DIFFICULTY_TEXT = "Easy";
const char *MEDIUM_DIFFICULTY_TEXT = "Medium";
const char *HARD_DIFFICULTY_TEXT = "Hard";
const char *UNKNOWN_DIFFICULTY_TEXT = "Unknown";
const char *ERROR_MESSAGE_ASSET = "Invalid asset. Exiting...";
const double REMOVE_OFFSET = 50;

// WALLS:
const double WALL_DIM = 1;
const double CEILING_OFFSET = 50;
const double GROUND_OFFSET = 50;
// the drawn floor/ceiling surfaces (world y, up is positive)
const double FLOOR_Y = 50;
const double CEILING_Y = 450;

// BACKGROUND:
const double BACKGROUND_SCROLL_SPEED = 165;
// world speed (px/s): starts at BACKGROUND_SCROLL_SPEED, ramps up with distance
const double WORLD_SPEED_MAX = 260;
const double WORLD_SPEED_RAMP = 0.012;   // extra px/s per meter traveled
const double MISSILE_EXTRA_SPEED = 220;  // missiles fly this much faster
const double HOMING_EXTRA_SPEED = 120;
const double BACKGROUND_OFFSET = 0;

// COLORS:
const rgb_color_t BLACK = (rgb_color_t){0, 0, 0};
const rgb_color_t RED = (rgb_color_t){255, 0, 0};
const rgb_color_t GREEN = (rgb_color_t){0, 255, 0};
const rgb_color_t BLUE = (rgb_color_t){0, 0, 255};
const rgb_color_t YELLOW = (rgb_color_t){255, 255, 0};
const rgb_color_t GOLD = (rgb_color_t){245, 197, 24};
const rgb_color_t WHITE = (rgb_color_t){255, 255, 255};
const double COLOR_MAX = 255;
const double WHITE_MIX = 1;

// USER:
const double USER_RADIUS = 20;  // (legacy; the runner's hitbox is RUNNER_HIT_*)
// Runner: drawn as a RUNNER_SPRITE square standing on its feet; collides as an
// upright oval fitted just inside the visible body (forgiving at the edges).
const double RUNNER_SPRITE = 112;      // photo runners
const double RUNNER_BODY_HEIGHT = 100; // animated runners: their body height on screen
// The runner's body is a broad oval around the whole sprite (first check);
// a hit only counts if the hazard also touches the current frame's traced
// outline (or, for photo characters, the smaller fitted oval below).
const double RUNNER_HIT_HALF_W = 36;
const double RUNNER_HIT_HALF_H = 54;
const double RUNNER_PRECISE_HALF_W = 21;
const double RUNNER_PRECISE_HALF_H = 43;
const size_t USER_NUM_POINTS = 20;
const vector_t USER_VEL = {0, 200};
const rgb_color_t user_color = (rgb_color_t){0.1, 0.9, 0.2};
const double USER_MASS = 10000;
const double USER_FOOT_OFFSET = 2; // sprite canvases keep 2px under the feet

// ZAPPER:
const double ZAPPER_WIDTH = 116;  // drawn size (frames are square)
const double ZAPPER_HEIGHT = 116;
const double ZAPPER_HIT_W = 22;   // the energy column
const double ZAPPER_HIT_H = 96;
const double MIN_ZAPPER_GENERATION_TIME_EASY = 3;
const double MAX_ZAPPER_GENERATION_TIME_EASY = 5;
const double MIN_ZAPPER_GENERATION_TIME_MEDIUM = 2;
const double MAX_ZAPPER_GENERATION_TIME_MEDIUM = 3;
const double MIN_ZAPPER_GENERATION_TIME_HARD = 1;
const double MAX_ZAPPER_GENERATION_TIME_HARD = 2;
const vector_t ZAPPER_VEL = {-100, 0};
const double ZAPPER_REMOVE_OFFSET = 50;
const double ZAPPER_CEILING_OFFSET = 100;
const double ZAPPER_GROUND_OFFSET = 100;
const double ZAPPER_Y_POS_BUFFER = 100;
const double ZAPPER_X_POS_BUFFER = 15;

// LASERS:
const double LASER_WIDTH_ACTIVE = 990;
const double LASER_X = 500;
const double LASER_HEIGHT_ACTIVE = 42.14;
const double LASER_GENERATION_TIME_EASY = 20;
const double LASER_GENERATION_TIME_MEDIUM = 12;
const double LASER_GENERATION_TIME_HARD = 8;
const double LASER_ACTIVATION_TIME = 3;
const double LASER_ON_TIME = 3;
const size_t MIN_NUM_LASERS = 1;
const size_t MAX_NUM_LASERS = 4;
const double NUM_LASERS = 10.0;
const int16_t LASER_INITIAL_X = -2000;
const int16_t LASER_INITIAL_Y = 0;
const double LASER_OFFSET_BOTTOM = 60;
const double LASER_OFFSET_BETWEEN = 42.5;
const double LASER_Y_OFFSET = 28;
const double LASER_H_OFFSET = 56;

// ROCKETS:
const double ROCKET_WIDTH = 150;  // drawn size (person + flame)
const double ROCKET_HEIGHT = 52;
const double ROCKET_HIT_W = 96;   // the person, not the flame trail
const double ROCKET_HIT_H = 36;
const double WARNING_WIDTH = 50;
const double WARNING_HEIGHT = 50;
const double ROCKET_GENERATION_TIME_EASY = 12;
const double ROCKET_GENERATION_TIME_MEDIUM = 8;
const double ROCKET_GENERATION_TIME_HARD = 5;
const vector_t ROCKET_VEL = {-300, 0};
const double ROCKET_MASS = 1;
const int16_t ROCKET_INITIAL_X = -2000;
const int16_t ROCKET_INITIAL_Y = 0;
const double ROCKETS_REMOVE_OFFSET = 50;
const double ROCKETS_Y_OFFSET = 100;
const double ROCKETS_Y_POS_BUFFER = 50;
const double ROCKETS_X_POS_BUFFER = 50;
const double ROCKETS_ACTIVATION_TIME = 3;

// COINS:
const size_t NUM_COINS = 20;
const size_t COIN_TEXT_SIZE = 50;
const size_t COIN_FONT_SIZE = 30;
const size_t MIN_COIN_GRID_SIZE = 2;
const size_t MAX_COIN_GRID_SIZE = 4;
const double COIN_RADIUS = 10;
const double MIN_COIN_GENERATION_TIME = 3;
const double MAX_COIN_GENERATION_TIME = 6;
const double COIN_GENERATION_TIME_POWERUP = 1;
const SDL_Rect COIN_BOX = (SDL_Rect){25, 75, 0, 0};
const vector_t COIN_VEL = {-100, 0};
const double COIN_MASS = 1;
const int16_t COIN_OFFSET = -1000;
const double COIN_REMOVE_OFFSET = 50;
const double COIN_CEILING_OFFSET = 100;
const double COIN_GROUND_OFFSET = 100;
const double COIN_X_POS_BUFFER = 15;
const double MAX_COIN_DEVIATION_POWERUP = 200;
const double MIN_COIN_DEVIATION_POWERUP = 100;
const double COIN_SPACING_Y_SHIFT = 40;
const double COIN_SPACING_X_SHIFT = 40;
const double COIN_FORCE_CONSTANT = 0;
const char *COINS_TEXT = "FUNDRAISING";

// POWERUPS:
const size_t NUM_POWERUPS = 4;
const double POWERUP_SIZE = 60;
const double POWERUP_DURATION = 10;
const double MIN_POWERUP_GENERATION_TIME = 16;
const double MAX_POWERUP_GENERATION_TIME = 12;
const vector_t POWERUP_VEL = {-100, 0};
const double POWERUP_MIN_DIST = 100.0;
const double MAGNET_RANGE = 260;      // coin magnet reach (px)
const double MAGNET_RANGE_TUB = 320;
const double MAGNET_PULL_SPEED = 620; // how fast pulled coins fly to you
const int16_t POWERUP_OFFSET = -1000;
const double POWERUP_REMOVE_OFFSET = 50;
const int16_t POWERUP_INITIAL_X = -2000;
const double POWERUP_CEILING_OFFSET = 100;
const double POWERUP_GROUND_OFFSET = 100;
const double POWERUP_Y_POS_BUFFER = 100;
const double POWERUP_X_POS_BUFFER = 15;
const double POWERUP_FORCE_CONSTANT = 0;

// DISTANCE:
const size_t DISTANCE_TEXT_SIZE = 50;
const size_t DISTANCE_FONT_SIZE = 30;
const SDL_Rect DISTANCE_BOX = (SDL_Rect){25, 25, 0, 0};
const SDL_Rect HUD_PANEL_BOX = (SDL_Rect){10, 0, 290, 108};
const double UPDATE_INTERVAL = 0.5;
const char *DISTANCE_TEXT = "M";

// PATH:
const char *BACKGROUND_PATH = "assets/theme/background.png";
// selectable gameplay backgrounds (Settings / web Backgrounds page).
// Each theme is up to two layers: {image, y, height, width, parallax factor}.
const char *BACKGROUND_NAMES[] = {"Metal Corridor", "THON Arena", "THON Arena Classic"};
const char *BACKGROUND_PATHS[] = {"assets/theme/background.png",
                                  "assets/techride/backgrounds/arena/far.png",
                                  "assets/theme/background_arena.png"};
const size_t NUM_BACKGROUNDS = 3;
const bg_layer_spec_t BACKGROUND_LAYERS[][2] = {
  {{"assets/theme/background.png", 0, 500, 1000, 1.0}, {NULL, 0, 0, 0, 0}},
  {{"assets/techride/backgrounds/arena/far.png", 0, 413, 2602, 0.5},
   {"assets/techride/backgrounds/arena/near.png", 413, 87, 2602, 1.0}},
  {{"assets/theme/background_arena.png", 0, 500, 1000, 1.0}, {NULL, 0, 0, 0, 0}}};
const char *BACKGROUND_SAVE_FILENAME = "background.txt";
const char *DIFFICULTY_SAVE_FILENAME = "difficulty.txt";
const char *ZAPPER_PATH = "assets/techride/hazards/zapper/00.png";
// extra hazards from the hazards sheet: drone, mine, floor spikes
const double DRONE_WIDTH = 84;    // drawn sizes (frames are square)
const double DRONE_HEIGHT = 84;
const double MINE_SIZE = 62;
const double SPIKES_WIDTH = 124;
const double SPIKES_HEIGHT = 124;
const double DRONE_HIT_W = 50;    // collision sizes
const double DRONE_HIT_H = 28;
const double MINE_HIT = 38;
const double SPIKES_HIT_W = 104;
const double SPIKES_HIT_H = 22;
// keep coins and power-ups at least this far (px) from hazards
const double HAZARD_CLEARANCE = 26;
// more hazards from the sheet (drawn size, then collision size)
const double DUAL_LASER_W = 140, DUAL_LASER_H = 140, DUAL_LASER_HIT_W = 30, DUAL_LASER_HIT_H = 116;
const double MOVING_LASER_W = 116, MOVING_LASER_H = 116, MOVING_LASER_HIT_W = 16;
const double MOVING_LASER_HIT_H = 96, MOVING_LASER_SPEED = 95;
const double ROTATING_LASER_DRAW = 136, ROTATING_ARM_LEN = 118, ROTATING_ARM_THICK = 12;
const double ROTATING_LASER_SPIN = 1.7; // radians per second
const double HOMING_W = 92, HOMING_H = 92, HOMING_HIT_W = 50, HOMING_HIT_H = 22;
const double HOMING_SPEED = 250, HOMING_TURN = 150;
const double CRATE_SIZE = 64, CRATE_HIT = 54;
const double FALLING_W = 96, FALLING_H = 96, FALLING_HIT = 46;
const double FALLING_TRIGGER = 330, FALLING_SPEED = 360;
const double COIN_FLOOR_GAP = 18; // coins stay this far from floor/ceiling
// seconds between extra hazards [easy, medium, hard] (min, max)
const double EXTRA_HAZARD_MIN_TIME[] = {9, 6, 4};
const double EXTRA_HAZARD_MAX_TIME[] = {14, 10, 7};
const double RUNNER_SWAP_SECONDS = 0.08;
const double RUNNER_TILT_UP = 12;
const double RUNNER_TILT_DOWN = 8;
const char *COIN_PATH = "assets/techride/collectibles/coin/00.png";
const char *POWERUP_PATH = "assets/theme/powerup.png";
const char *LASER_PATH_INACTIVE = "assets/techride/hazards/laser_inactive.png";
const char *LASER_PATH_ACTIVE = "assets/techride/hazards/laser_active.png";
const char *ROCKET_WARNING_PATH = "assets/theme/warning.png";
const char *ROCKET_PATH = "assets/techride/hazards/missile_body/00.png";
const char *ROCKET_LIST_PATH = "assets/rockets/rockets.txt";
const char *ROCKET_DIR = "assets/rockets/";
const char *SHIELD_PATH = "assets/theme/shield.png";
const char *MAGNETIC_PATH = "assets/theme/magnet.png";
const char *MORE_COIN_PATH = "assets/theme/money.png";
const char *TUB_PATH = "assets/theme/tub.png";
// indexed by powerup_type_t: SHIELD, MAGNETIC, MORE_COIN, TECH_ULTRA_BOT
const char *POWERUP_PICKUP_PATHS[] = {
  "assets/theme/pickup_shield.png", "assets/theme/pickup_magnet.png",
  "assets/theme/pickup_cans.png", "assets/theme/pickup_tub.png"};
const char *POWERUP_NAMES[] = {"SHIELD", "COIN MAGNET", "FUNDRAISING RUSH",
                                "TECH ULTRA BOT"};
const char *POWERUP_DESCRIPTIONS[] = {
  "Zappers, lasers and rockets can't hurt you", "Pulls nearby coins straight to you",
  "Way more fundraising coins show up", "Giant robot mode. Smash through everything"};
const rgb_color_t POWERUP_COLORS[] = {
  {110, 200, 255}, {240, 70, 90}, {245, 197, 24}, {70, 235, 110}};
const double POWERUP_WARN_TIME = 2.5;
// jetpack physics (pixels/second, pixels/second^2)
const double THRUST_ACCEL = 1550;
const double FALL_ACCEL = 1180;
const double MAX_RISE_SPEED = 390;
const double MAX_FALL_SPEED = 490;
const double DEATH_DURATION = 0.9;   // crash moment before the end screen
const double TUB_SPRITE = 330;       // TECH ULTRA BOT: big! (drawn size, px)
const double TUB_SMASH_WIDTH = 0.38; // smash zone half-width, as a fraction of TUB's height
const double EFFECT_DURATION = 0.45; // impact sprites  // smashes zappers/rockets this close
const char *FONT_PATH = "assets/NewAthleticM54.ttf";
const char *ACHIEVEMENTS_FONT_PATH = "assets/Roboto-Regular.ttf";
const char *BUTTON_PATH = "assets/theme/button.png";
const double BUTTON_TEXT_MAX_WIDTH = 0.72;
const double BUTTON_TEXT_MAX_HEIGHT = 0.5;
const double BUTTON_FACE_HEIGHT = 0.93;
const double BUTTON_HOVER_GROW = 1.06;

// CHARACTERS:
const char *CHARACTER_LIST_PATH = "assets/characters/characters.txt";
const char *CHARACTER_DIR = "assets/characters/";
const char *CHARACTER_SAVE_FILENAME = "character.txt";
const char *COSMETIC_SAVE_FILENAME = "cosmetic.txt";
const char *MANIFEST_PATH = "assets/techride/manifest.txt";
const char *TECHRIDE_DIR = "assets/techride/";
const char *DEFAULT_CHARACTER_NAME = "Tech Robot";
const char *DEFAULT_CHARACTER_SPRITE = "robot.png";
const size_t CHARACTER_TEXT_SIZE = 96;
const double CHARACTER_ANIMATION_FPS = 12;

// CELEBRATION (plays on the game over screen after a new best distance):
const char *CELEBRATION_LIST_PATH = "assets/celebration/celebration.txt";
const char *CELEBRATION_DIR = "assets/celebration/";
const int CELEBRATION_HEIGHT = 330;
const int CELEBRATION_RIGHT = 985;
const int CELEBRATION_TOP = 150;
const char *NEW_BEST_TEXT = "NEW BEST";
const char *GAME_OVER_TEXT = "Game Over...";
const SDL_Rect SCORE_BOX = (SDL_Rect){64, 205, 0, 0};
const int NAME_ROW_Y = 258;
const int NAME_BOX_WIDTH = 250;
const size_t SCORE_FONT_SIZE = 30;
const size_t SCORE_TEXT_SIZE = 64;

// SAVES (best distance + top 10). On the web the save folder is backed by
// the browser's IndexedDB so it survives page refreshes.
#ifdef __EMSCRIPTEN__
const char *SAVE_DIR = "/save/";
#else
const char *SAVE_DIR = "";
#endif
const char *BEST_DISTANCE_FILENAME = "best_distance.txt";
const char *LEADERBOARD_FILENAME = "leaderboard.txt";
const size_t LEADERBOARD_SIZE = 10;
const size_t NAME_MAX_LEN = 12;
const char *DEFAULT_PLAYER_NAME = "DANCER";
const size_t LEADERBOARD_FONT_SIZE = 22;
const int LEADERBOARD_LEFT = 640;
const int LEADERBOARD_RIGHT = 962;
const int LEADERBOARD_TOP = 148;
const int LEADERBOARD_ROW_HEIGHT = 32;
const SDL_Rect CHARACTER_NAME_BOX = (SDL_Rect){50, 255, 0, 0};
const SDL_Rect CHARACTER_PREVIEW_BOX = (SDL_Rect){410, 140, 110, 110};

// TEXT:
const size_t DIFFICULTY_TEXT_SIZE = 50;
const size_t DIFFICULTY_FONT_SIZE = 50;
const size_t ACHIEVEMENTS_FONT_SIZE = 25;
const SDL_Rect DIFFICULTY_BOX = (SDL_Rect){300, 325, 0, 0};

// ACHIEVEMENTS:
const size_t INITIAL_ACHIEVEMENTS = 3;
#ifdef __EMSCRIPTEN__
const char *ACHIEVEMENTS_FILENAME = "/achievements.txt";
#else
const char *ACHIEVEMENTS_FILENAME = "achievements.txt";
#endif
const char *FIRST_ACHIEVEMENT = "Fundraise 50 Coins|0|50|false";
const char *FIRST_ACHIEVEMENT_NAME = "Fundraise 50 Coins";
const char *SECOND_ACHIEVEMENT = "Dance 1000 Meters In A Game|0|1000|false";
const char *SECOND_ACHIEVEMENT_NAME = "Dance 1000 Meters In A Game";
const char *THIRD_ACHIEVEMENT = "Dodge 5 Spotlights|0|5|false";
const char *THIRD_ACHIEVEMENT_NAME = "Dodge 5 Spotlights";
const size_t INITIAL_NUM_OBSERVERS = 10;
const size_t CHAR_TO_READ = 256;
const char *PIPE = "|";
const char *NEWLINE = "\n";
const char *SPACE = " ";
const char *SLASH = "/";
const char *TRUE_TEXT = "true";
const char *FALSE_TEXT = "false";