#include <assert.h>
#include <state.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <time.h>
#include <math.h>

#include "collision.h"
#include "forces.h"
#include "game_play.h"
#include "character.h"
#include "particles.h"
#include "manifest.h"
#include "cosmetics.h"
#include "game_settings.h"
#include "asset_cache.h"
#include "asset.h"
#include "constants.h"
#include "asset_cache.h"
#include "sdl_wrapper.h"
#include "subject.h"
#include "observer.h"
#include "achievement.h"

struct zapper_state
{
  double time_until_zapper;
  double min_zapper_generation_time;
  double max_zapper_generation_time;
  double zapper_time;
};

struct laser_state
{
  double time_laser;
  double time_laser_spawn;
  double time_laser_activate;
  double laser_generation_time;
  bool laser_inactive;
  bool laser_active;
  list_t *laser_inactive_assets;
  list_t *laser_active_assets;
  list_t *laser_centers;
  list_t *laser_spawn_positions;
  laser_spawn_t laser_spawn_bool;
};

struct coin_state
{
  double time_until_coin;
  double coin_time;
  size_t coin_count;
  vector_t prev_center;
};

struct powerup_state
{
  double time_until_powerup;
  double powerup_time;
  double powerup_start_time;
  bool powerup_active;
  image_asset_t *powerup_img;
  powerup_type_t powerup_type;
  powerup_type_t next_type; // what the pickup currently on screen will give
};

struct rocket_state
{
  double time_rocket;
  double time_rocket_spawn;
  double time_rocket_activate;
  double rocket_generation_time;
  bool rocket_inactive;
  bool rocket_active;
  asset_t *rocket_inactive_asset;
  vector_t rocket_spawn_position;
};

struct game_play_state
{
  double time;
  double last_update_time;
  double distance_traveled;
  TTF_Font *distance_font;
  TTF_Font *coins_collected_font;
  zapper_state_t *zapper;
  laser_state_t *laser;
  coin_state_t *coin;
  powerup_state_t *powerup;
  rocket_state_t *rocket;
  state_type_t curr_state;
  subject_t *subject; // this is useful for achievements
  state_temp_t *state;
  size_t last_coin_count; // to spot pickups for the sparkle effect
  bool thrusting;            // Space held
  const char *anim_state;    // "run", "fly", "land" for animated characters
  double anim_state_start;
  double anim_clock;         // runner animation time, advanced at the current pace
  size_t anim_frame;         // frame on screen (the hitbox follows this)
  SDL_Texture *swap_from;    // last picture before a run/fly/land change
  double swap_start;
  bool was_airborne;
  double tub_smash_time;     // last time the TECH ULTRA BOT smashed something
  size_t tub_smashes;        // hazards smashed this run (tests read this)
  double extra_time;         // drones / mines / spikes spawn timer
  double extra_next;
  difficulty_type_t difficulty;
  bool dying;                // crash moment playing
  double death_time;
  double user_angle;      // current tilt of the runner sprite
};

/**
 * Shows an animation on an image at the given time, fading between frames.
 *
 * @param image the image
 * @param anim the animation
 * @param time seconds into the animation
 * @return the current frame
 */
static size_t show_anim(image_asset_t *image, const anim_t *anim, double time)
{
  size_t frame, next;
  double fade;
  anim_blend_at(anim, time, &frame, &next, &fade);
  image->texture = asset_cache_obj_get_or_create(ASSET_IMAGE, anim_frame_path(anim, frame));
  image->next_texture = fade > 0
      ? asset_cache_obj_get_or_create(ASSET_IMAGE, anim_frame_path(anim, next)) : NULL;
  image->blend = fade;
  return frame;
}

/**
 * World-space bounding box of a body's shape.
 */
static void body_box(body_t *body, double *x0, double *y0, double *x1, double *y1)
{
  list_t *points = body_get_shape(body);
  *x0 = *y0 = INFINITY;
  *x1 = *y1 = -INFINITY;
  for (size_t i = 0; i < list_size(points); i++)
  {
    vector_t *v = list_get(points, i);
    *x0 = fmin(*x0, v->x);
    *y0 = fmin(*y0, v->y);
    *x1 = fmax(*x1, v->x);
    *y1 = fmax(*y1, v->y);
  }
  list_free(points);
}

static bool is_hazard(body_type_t t)
{
  return t == ZAPPER || t == ROCKET || t == LASER || t == LASER_ACTIVE || t == DRONE ||
         t == MINE || t == SPIKES || t == DUAL_LASER || t == MOVING_LASER ||
         t == ROTATING_LASER || t == HOMING_ROCKET || t == CRATE || t == FALLING;
}

/**
 * @return whether point p is inside (or within `margin` of) any hazard
 */
static bool near_hazard(scene_t *scene, vector_t p, double margin)
{
  for (size_t i = 0; i < scene_bodies(scene); i++)
  {
    body_t *body = scene_get_body(scene, i);
    if (body_is_removed(body) || !is_hazard(get_type(body)))
    {
      continue;
    }
    double x0, y0, x1, y1;
    body_box(body, &x0, &y0, &x1, &y1);
    if (p.x > x0 - margin && p.x < x1 + margin && p.y > y0 - margin && p.y < y1 + margin)
    {
      return true;
    }
  }
  return false;
}

/**
 * Removes coins that a newly spawned hazard landed on, so coins are never
 * inside obstacles.
 */
static void clear_coins_near(state_temp_t *state, body_t *hazard, double margin)
{
  double x0, y0, x1, y1;
  body_box(hazard, &x0, &y0, &x1, &y1);
  size_t num_assets = list_size(state->body_assets);
  for (size_t i = 0; i < num_assets; i++)
  {
    asset_t *asset = list_get(state->body_assets, i);
    if (asset_get_type(asset) != ASSET_IMAGE)
    {
      continue;
    }
    body_t *coin = image_asset_get_body((image_asset_t *)asset);
    if (coin == NULL || body_is_removed(coin) || get_type(coin) != COIN)
    {
      continue;
    }
    vector_t c = body_get_centroid(coin);
    if (c.x > x0 - margin && c.x < x1 + margin && c.y > y0 - margin && c.y < y1 + margin)
    {
      body_remove(coin);
      asset_update_bounding_box_x(asset, COIN_OFFSET);
    }
  }
}

/**
 * Short-lived impact sprites from the hazards sheet (crash, TUB smash).
 */
#define MAX_EFFECTS 12
typedef struct effect
{
  bool alive;
  size_t frame;      // which drawing of fx.impacts
  double x, y, start, size;
} effect_t;
static effect_t effects[MAX_EFFECTS];

static void effect_spawn(size_t frame, double x, double y, double size, double now)
{
  for (size_t i = 0; i < MAX_EFFECTS; i++)
  {
    if (!effects[i].alive)
    {
      effects[i] = (effect_t){true, frame, x, y, now, size};
      return;
    }
  }
}

static void effects_render(double now)
{
  const anim_t *impacts = anim_get("fx.impacts");
  for (size_t i = 0; i < MAX_EFFECTS && impacts; i++)
  {
    effect_t *e = &effects[i];
    double age = now - e->start;
    if (!e->alive || age > EFFECT_DURATION)
    {
      e->alive = false;
      continue;
    }
    double k = age / EFFECT_DURATION;
    double size = e->size * (0.5 + 0.8 * k);           // pops outward
    SDL_Texture *tex = asset_cache_obj_get_or_create(ASSET_IMAGE,
                                                     anim_frame_path(impacts, e->frame));
    render_copy_alpha(tex, (SDL_Rect){(int)(e->x - size / 2), (int)(e->y - size / 2),
                                      (int)size, (int)size},
                      k * 40, (Uint8)(255 * (1 - k)));
  }
}


/**
 * Holding Space fires the jetpack; the physics in apply_jetpack() turns that
 * into smooth acceleration.
 *
 * @param key the character of the key pressed
 * @param type event type connected to key
 * @param held_time how long the key has been held
 * @param game_play_state the current state of game
 */
void on_key(char key, key_event_type_t type, double held_time,
            game_play_state_t *game_play_state)
{
  if (key == SPACE_BAR && !game_play_state->dying)
  {
    game_play_state->thrusting = type == KEY_PRESSED;
  }
}

/**
 * Initialize the observers. This currently only uses achievements but this can
 * be expanded to include other types of observers.
 * 
 * @param game_play_state the current state of game
*/
static void init_observers(game_play_state_t *game_play_state)
{
  game_play_state->subject = subject_init();
  achievements_t *achievements = achievements_init();
  observer_t *observer = achievements_get_observer(achievements);
  subject_add_observer(game_play_state->subject, observer);
}

/**
 * Malloc the necessary objects for the game play state.
 * 
 * @param game_play_state the current state of game
*/
static void create_objects(game_play_state_t *game_play_state)
{
  game_play_state->zapper = malloc(sizeof(zapper_state_t));
  assert(game_play_state->zapper);
  game_play_state->laser = malloc(sizeof(laser_state_t));
  assert(game_play_state->laser);
  game_play_state->rocket = malloc(sizeof(rocket_state_t));
  assert(game_play_state->rocket);
  game_play_state->coin = malloc(sizeof(coin_state_t));
  assert(game_play_state->coin);
  game_play_state->powerup = malloc(sizeof(powerup_state_t));
  assert(game_play_state->powerup); 
}

/**
 * Set the values of the rockets.
 * 
 * @param game_play_state the current state of game
*/
static void set_rockets_values(game_play_state_t *game_play_state)
{
  game_play_state->rocket->rocket_inactive = false;
  game_play_state->rocket->rocket_active = false;
  game_play_state->rocket->time_rocket = ZERO;
  game_play_state->rocket->time_rocket_spawn = ZERO;
  game_play_state->rocket->time_rocket_activate = ZERO;
  SDL_Rect bounding_box_rocket_warning = make_texr(ROCKET_INITIAL_X, 
                          ROCKET_INITIAL_Y, WARNING_WIDTH, WARNING_HEIGHT);
  game_play_state->rocket->rocket_inactive_asset = asset_make_image(
                                                  ROCKET_WARNING_PATH, 
                                                  bounding_box_rocket_warning);
  list_add(game_play_state->state->body_assets,
             game_play_state->rocket->rocket_inactive_asset);
}

/**
 * Set the necessary values like lasers.
 * 
 * @param game_play_state the current state of game
 * @param state the current state of the game containing bodies
*/
static void set_necessary_values(game_play_state_t *game_play_state, state_temp_t *state)
{
  game_play_state->laser->laser_active = false;
  game_play_state->laser->time_laser = ZERO;
  game_play_state->laser->time_laser_spawn = ZERO;
  game_play_state->laser->time_laser_activate = ZERO;
  game_play_state->laser->laser_spawn_bool = LASER_INACTIVE_STATE;

  game_play_state->state = state;
  game_play_state->time = ZERO;
  game_play_state->last_update_time = ZERO;
  game_play_state->distance_font = init_font(FONT_PATH, DISTANCE_FONT_SIZE);
  game_play_state->distance_traveled = ZERO;

  game_play_state->zapper->time_until_zapper = ZERO;
  game_play_state->zapper->zapper_time = ZERO;

  game_play_state->coin->time_until_coin = ZERO;
  game_play_state->coin->coin_time = ZERO;
  game_play_state->coin->coin_count = ZERO;
  game_play_state->coins_collected_font = init_font(FONT_PATH, COIN_FONT_SIZE);

  game_play_state->powerup->time_until_powerup = ZERO;
  game_play_state->powerup->powerup_time = ZERO;
  game_play_state->powerup->powerup_start_time = ZERO;
  game_play_state->powerup->powerup_active = false;
  game_play_state->powerup->powerup_type = SHIELD;
  game_play_state->powerup->next_type = SHIELD;
  game_play_state->powerup->powerup_img = NULL;
}

/**
 * Set the logic necessary for the lasers.
 * 
 * @param game_play_state the current state of game
*/
static void set_lasers_values(game_play_state_t *game_play_state)
{
  SDL_Rect bounding_box_laser = make_texr(LASER_INITIAL_X, LASER_INITIAL_Y, 
                                      LASER_WIDTH_ACTIVE, LASER_HEIGHT_ACTIVE);
  game_play_state->laser->laser_active_assets = list_init(INITIAL_LIST_CAPACITY, 
                                                    NULL);
  game_play_state->laser->laser_inactive_assets = list_init(
                                                    INITIAL_LIST_CAPACITY,
                                                    NULL);
  for (size_t i = 0; i < INITIAL_LIST_CAPACITY; i++)
  {
    asset_t *laser_active = asset_make_image(LASER_PATH_ACTIVE,
                                              bounding_box_laser);
    list_add(game_play_state->laser->laser_active_assets,
            laser_active);
    asset_t *laser_inactive = asset_make_image(LASER_PATH_INACTIVE,
                                              bounding_box_laser);
    list_add(game_play_state->laser->laser_inactive_assets, laser_inactive);
    list_add(game_play_state->state->body_assets, laser_active);
    list_add(game_play_state->state->body_assets, laser_inactive);
  }
  game_play_state->laser->laser_centers = list_init(INITIAL_LIST_CAPACITY,
                                                    (free_func_t)vector_free);
  game_play_state->laser->laser_spawn_positions = list_init(
                                                      INITIAL_LIST_CAPACITY,
                                                      NULL);
  game_play_state->coin->prev_center = VEC_ZERO;
  for (size_t i = 0; i < INITIAL_LIST_CAPACITY; i++)
  {
    double y = (LASER_OFFSET_BOTTOM + (LASER_OFFSET_BETWEEN * i));
    vector_t *center = vector_init(LASER_X, y);
    list_add(game_play_state->laser->laser_centers, center);
  }
}

/**
 * Change generation time based on the difficulty level.
 * 
 * @param game_play_state the current state of game
 * @param difficulty_level the current difficulty level
*/
static void switch_generation_difficulty(game_play_state_t *game_play_state,
                                        difficulty_type_t difficulty_level)
{
  switch (difficulty_level)
  {
    case EASY:
    {
      game_play_state->zapper->min_zapper_generation_time =
          MIN_ZAPPER_GENERATION_TIME_EASY;
      game_play_state->zapper->max_zapper_generation_time =
          MAX_ZAPPER_GENERATION_TIME_EASY;
      game_play_state->rocket->rocket_generation_time = ROCKET_GENERATION_TIME_EASY;
      game_play_state->laser->laser_generation_time = LASER_GENERATION_TIME_EASY;
      break;
    }
    case MEDIUM:
    {
      game_play_state->zapper->min_zapper_generation_time =
          MIN_ZAPPER_GENERATION_TIME_MEDIUM;
      game_play_state->zapper->max_zapper_generation_time =
          MAX_ZAPPER_GENERATION_TIME_MEDIUM;
      game_play_state->rocket->rocket_generation_time = ROCKET_GENERATION_TIME_MEDIUM;
      game_play_state->laser->laser_generation_time = LASER_GENERATION_TIME_MEDIUM;
      break;
    }
    case HARD:
    {
      game_play_state->zapper->min_zapper_generation_time =
          MIN_ZAPPER_GENERATION_TIME_HARD;
      game_play_state->zapper->max_zapper_generation_time =
          MAX_ZAPPER_GENERATION_TIME_HARD;
      game_play_state->rocket->rocket_generation_time = ROCKET_GENERATION_TIME_HARD;
      game_play_state->laser->laser_generation_time = LASER_GENERATION_TIME_HARD;
      break;
    }
    default:
    {
      break;
    }
  }

}

game_play_state_t *game_play_init(difficulty_type_t difficulty_level)
{
  game_play_state_t *game_play_state = malloc(sizeof(game_play_state_t));
  assert(game_play_state != NULL);
  asset_cache_init();
  sdl_init(MIN, MAX);
  srand(time(NULL));
  sdl_on_key((key_handler_t)on_key);
  state_temp_t *state = state_temp_init();
  game_play_state->state = state;
  game_play_state->curr_state = GAME_PLAY;
  create_objects(game_play_state);
  set_rockets_values(game_play_state);
  set_necessary_values(game_play_state, state);
  set_lasers_values(game_play_state);
  switch_generation_difficulty(game_play_state, difficulty_level);
  game_play_state->difficulty = difficulty_level;
  init_observers(game_play_state);
  game_play_state->last_coin_count = 0;
  game_play_state->user_angle = 0;
  game_play_state->thrusting = false;
  game_play_state->anim_state = "run";
  // same body height for every animated runner, whatever its canvas size
  const anim_t *run = character_selected_anim("run");
  sdl_set_runner_sprite(run && run->has_anchor ? RUNNER_BODY_HEIGHT / run->height : RUNNER_SPRITE);
  game_play_state->anim_state_start = 0;
  game_play_state->anim_clock = 0;
  game_play_state->anim_frame = 0;
  game_play_state->swap_from = NULL;
  game_play_state->swap_start = -10;
  game_play_state->was_airborne = false;
  game_play_state->tub_smash_time = -10;
  game_play_state->extra_time = 0;
  game_play_state->tub_smashes = 0;
  game_play_state->extra_next = 6; // first one after a few seconds
  game_play_state->dying = false;
  game_play_state->death_time = 0;
  particles_clear();
  for (size_t i = 0; i < MAX_EFFECTS; i++)
  {
    effects[i].alive = false;
  }
  return game_play_state;
}

static void remove_individual_powerup(game_play_state_t *game_play_state);

/**
 * The runner's precise collision outline in world coordinates: the traced
 * outline
 * of the frame being shown (tilt included), or a fitted oval for photo
 * characters.
 *
 * @param game_play_state the current state of the game
 * @return the outline points (caller frees)
 */
static list_t *runner_outline(game_play_state_t *game_play_state)
{
  state_temp_t *state = game_play_state->state;
  vector_t c = body_get_centroid(state->user);
  double bottom = c.y - RUNNER_HIT_HALF_H;
  double sprite = sdl_runner_sprite();
  const anim_t *anim = character_selected_anim(game_play_state->anim_state);
  size_t count = 0;
  const float (*pts)[2] = NULL;
  if (anim)
  {
    pts = anim_hull(anim, game_play_state->anim_frame, &count);
  }
  list_t *shape = list_init(MAX_HULL_POINTS, free);
  double rad = -state->user_img->angle * M_PI / 180.0; // world y points up
  double sx = c.x, sy = bottom + sprite / 2;     // sprite center
  if (count >= 3)
  {
    for (size_t i = 0; i < count; i++)
    {
      // frame fractions (y down) -> world, standing on the feet
      double x = c.x - sprite / 2 + pts[i][0] * sprite;
      double y = bottom + sprite - pts[i][1] * sprite - USER_FOOT_OFFSET;
      double dx = x - sx, dy = y - sy;
      vector_t *v = malloc(sizeof(*v));
      assert(v);
      *v = (vector_t){sx + dx * cos(rad) - dy * sin(rad), sy + dx * sin(rad) + dy * cos(rad)};
      list_add(shape, v);
    }
  }
  else
  {
    for (size_t i = 0; i < USER_NUM_POINTS; i++)
    {
      double a = 2 * M_PI * i / USER_NUM_POINTS;
      vector_t *v = malloc(sizeof(*v));
      assert(v);
      *v = (vector_t){c.x + RUNNER_PRECISE_HALF_W * cos(a),
                      bottom + RUNNER_PRECISE_HALF_H + RUNNER_PRECISE_HALF_H * sin(a)};
      list_add(shape, v);
    }
  }
  return shape;
}


/**
 * Ends the run with the crash moment.
 *
 * @param game_play_state the current state of the game
 */
static void crash(game_play_state_t *game_play_state)
{
  powerup_state_t *powerup = game_play_state->powerup;
#ifdef GAME_SOAK_TEST
  return; // soak tests run forever
#endif
  game_play_state->dying = true;
  game_play_state->death_time = game_play_state->time;
  game_play_state->thrusting = false;
  if (powerup->powerup_active)
  {
    // the power-up effect ends with the run
    powerup->powerup_active = false;
    remove_individual_powerup(game_play_state);
  }
  SDL_Rect box = find_bounding_box(game_play_state->state->user);
  particles_burst(box.x + box.w / 2.0, box.y + box.h / 2.0, 60, 420);
  effect_spawn(0, box.x + box.w / 2.0, box.y + box.h / 2.0, 150, game_play_state->time);
  effect_spawn(2, box.x + box.w / 2.0, box.y + box.h / 2.0, 120, game_play_state->time);
}

/**
 * Crashes the runner if any hazard touches its outline. Checked every frame,
 * so a hazard that only reaches the outline partway past still counts.
 *
 * @param game_play_state the current state of the game
 */
static void check_hazard_hits(game_play_state_t *game_play_state)
{
  powerup_state_t *powerup = game_play_state->powerup;
  if (game_play_state->dying ||
      (powerup->powerup_active &&
       (powerup->powerup_type == SHIELD || powerup->powerup_type == TECH_ULTRA_BOT)))
  {
    return;
  }
  state_temp_t *state = game_play_state->state;
  vector_t me = body_get_centroid(state->user);
  double half = sdl_runner_sprite() / 2;
  double rx0 = me.x - half, rx1 = me.x + half;
  double ry0 = me.y - RUNNER_HIT_HALF_H, ry1 = ry0 + 2 * half;
  body_t *outline = NULL;
  for (size_t i = 0; i < scene_bodies(state->scene); i++)
  {
    body_t *body = scene_get_body(state->scene, i);
    body_type_t t = get_type(body);
    // LASER is the harmless charging line; only LASER_ACTIVE hurts
    if (body_is_removed(body) || !is_hazard(t) || t == LASER)
    {
      continue;
    }
    double x0, y0, x1, y1;
    body_box(body, &x0, &y0, &x1, &y1);
    if (x1 < rx0 || x0 > rx1 || y1 < ry0 || y0 > ry1)
    {
      continue; // nowhere near
    }
    if (outline == NULL)
    {
      outline = body_init(runner_outline(game_play_state), 1, (rgb_color_t){0, 0, 0});
    }
    if (find_collision(outline, body).collided)
    {
      crash(game_play_state);
      break;
    }
  }
  if (outline != NULL)
  {
    body_free(outline);
  }
}

/**
 * Function pointer for collecting a coin.
 * 
 * @param body1 the first body in the collision
 * @param body2 the second body in the collision
 * @param axis the axis of the collision
 * @param aux1 the first auxiliary data in the collision
 * @param aux2 the second auxiliary data in the collision
 * @param force_const the force constant of the collision
*/
static void collect_coin(body_t *body1, body_t *body2, vector_t axis, void *aux1,
                  void *aux2, double force_const)
{
  asset_t *asset = (asset_t *)aux1;
  body_remove(body1);
  asset_update_bounding_box_x(asset, COIN_OFFSET);
  game_play_state_t *game_play_state = (game_play_state_t *)aux2;
  game_play_state->coin->coin_count++;
  subject_notify(game_play_state->subject, EVENT_COIN_COLLECTED, NULL);
}

/**
 * Make the powerup image.
 * 
 * @param game_play_state the current state of the game
 * @param path the path of the image
*/
static void make_individual_powerup(game_play_state_t *game_play_state,
                            const char *path)
{
  image_asset_t *img = asset_image_make_image_with_body(path,
                                                  game_play_state->state->user);
  game_play_state->powerup->powerup_img = img;
  list_add(game_play_state->state->body_assets, &img->base);
}

/**
 * Active the powerup once the user hits it.
 * 
 * @param body1 the first body in the collision
 * @param body2 the second body in the collision
 * @param axis the axis of the collision
 * @param aux1 the first auxiliary data in the collision
 * @param aux2 the second auxiliary data in the collision
 * @param force_const the force constant of the collision
*/
static void activate_powerup(body_t *body1, body_t *body2, vector_t axis, void *aux1,
                      void *aux2, double force_const)
{
  asset_t *asset = (asset_t *)aux1;
  body_remove(body1);
  asset_update_bounding_box_x(asset, POWERUP_OFFSET);
  game_play_state_t *game_play_state = (game_play_state_t *)aux2;
  powerup_state_t *powerup = game_play_state->powerup;
  if (powerup->powerup_active)
  {
    // a new pickup replaces the current power-up
    remove_individual_powerup(game_play_state);
  }
  powerup->powerup_active = true;
  powerup->powerup_start_time = game_play_state->time;
  powerup->powerup_type = powerup->next_type;
  const char *overlays[] = {SHIELD_PATH, MAGNETIC_PATH, MORE_COIN_PATH, TUB_PATH};
  make_individual_powerup(game_play_state, overlays[powerup->powerup_type]);
  if (powerup->powerup_type == MORE_COIN)
  {
    game_play_state->coin->time_until_coin = COIN_GENERATION_TIME_POWERUP;
  }
  SDL_Rect box = find_bounding_box(game_play_state->state->user);
  particles_burst(box.x + box.w / 2.0, box.y + box.h / 2.0, 40, 360);
}

/**
 * Remove the powerup boxes.
 * 
 * @param game_play_state the current state of the game
*/
static void remove_individual_powerup(game_play_state_t *game_play_state)
{
  game_play_state->powerup->powerup_img->body = NULL;
  asset_update_bounding_box_x(&game_play_state->powerup->powerup_img->base,
                                                            POWERUP_INITIAL_X);
}

/**
 * Remove the inactive lasers from the game.
 * 
 * @param game_play_state the current state of the game
*/
static void remove_lasers_inactive(game_play_state_t *game_play_state)
{
  for (size_t i = 0; i < scene_bodies(game_play_state->state->scene); i++)
  {
    body_t *body = scene_get_body(game_play_state->state->scene, i);
    if (get_type(body) == LASER)
    {
      scene_remove_body(game_play_state->state->scene, i);
    }
  }
  for (size_t i = 0; i < INITIAL_LIST_CAPACITY; i++)
  {
    asset_update_bounding_box_x(list_get(
                                  game_play_state->laser->laser_inactive_assets,
                                  i), LASER_INITIAL_X);
  }
}

/**
 * Remove the lasers from the game.
 * 
 * @param game_play_state the current state of the game
*/
static void remove_lasers(game_play_state_t *game_play_state)
{
  if (game_play_state->time - game_play_state->laser->time_laser_activate >=
                                                                  LASER_ON_TIME)
  {
    game_play_state->laser->laser_active = false;
    game_play_state->laser->laser_spawn_bool = LASER_INACTIVE_STATE;
    game_play_state->laser->time_laser_activate = INFINITY;
    for (size_t i = 0; i < scene_bodies(game_play_state->state->scene); i++)
    {
      body_t *body = scene_get_body(game_play_state->state->scene, i);
      if (get_type(body) == LASER_ACTIVE)
      {
        scene_remove_body(game_play_state->state->scene, i);
        subject_notify(game_play_state->subject, EVENT_LASERS_AVOIDED, NULL);
      }
    }

    for (size_t i = 0; i < INITIAL_LIST_CAPACITY; i++)
    {
      asset_update_bounding_box_x(list_get(
                            game_play_state->laser->laser_active_assets, i), 
                            LASER_INITIAL_X);
    }
  }
}

/**
 * Remove the rocket warnings.
 * 
 * @param game_play_state the current state of the game
*/
static void remove_warnings(game_play_state_t *game_play_state)
{
  size_t num_bodies = scene_bodies(game_play_state->state->scene);
  for (size_t i = 0; i < num_bodies; i++)
  {
    body_t *body = scene_get_body(game_play_state->state->scene, i);
    if (get_type(body) == ROCKET_WARNING)
    {
      asset_update_bounding_box_x(
                  game_play_state->rocket->rocket_inactive_asset,
                  ROCKET_INITIAL_X);
      scene_remove_body(game_play_state->state->scene, i);
    }
  }
}

/**
 * Add the zapper to the game.
 * 
 * @param game_play_state the current state of the game
 * @param dt the time elapsed since the last tick
*/
static void add_zapper(game_play_state_t *game_play_state, double dt)
{
  game_play_state->zapper->zapper_time += dt;
  bool laser_state = !game_play_state->laser->laser_active;
  if (laser_state && game_play_state->zapper->zapper_time >= 
                                    game_play_state->zapper->time_until_zapper)
  {
    game_play_state->zapper->zapper_time = ZERO;
    game_play_state->zapper->time_until_zapper = fmod(rand(),
                      game_play_state->zapper->max_zapper_generation_time -
                          game_play_state->zapper->min_zapper_generation_time) +
                  game_play_state->zapper->min_zapper_generation_time;
    double y_pos = fmod(rand(), (MAX.y - ZAPPER_CEILING_OFFSET) - 
                         (MIN.y + ZAPPER_GROUND_OFFSET)) + ZAPPER_Y_POS_BUFFER;
    double x_pos = MAX.x + ZAPPER_X_POS_BUFFER;
    vector_t center = {.x = x_pos, .y = y_pos};
    body_t *zapper = make_obstacle_rectangle(&center, ZAPPER_HIT_W,
                                            ZAPPER_HIT_H, ZAPPER, ZAPPER_VEL);
    scene_add_body(game_play_state->state->scene, zapper);
    clear_coins_near(game_play_state->state, zapper, HAZARD_CLEARANCE + COIN_RADIUS);
    asset_t *img = asset_make_image_with_body(ZAPPER_PATH, zapper);
    list_add(game_play_state->state->body_assets, img);
  }
}

/**
 * Use the magnetic powerup for the coins.
 * 
 * @param game_play_state the current state of the game
*/
static void magnetic_powerup(game_play_state_t *game_play_state)
{
  powerup_state_t *powerup = game_play_state->powerup;
  if (!powerup->powerup_active ||
      (powerup->powerup_type != MAGNETIC && powerup->powerup_type != TECH_ULTRA_BOT))
  {
    return;
  }
  // steer nearby coins smoothly toward the runner; only the coins move
  state_temp_t *state = game_play_state->state;
  vector_t me = body_get_centroid(state->user);
  double range = powerup->powerup_type == TECH_ULTRA_BOT ? MAGNET_RANGE_TUB : MAGNET_RANGE;
  for (size_t i = 0; i < scene_bodies(state->scene); i++)
  {
    body_t *coin = scene_get_body(state->scene, i);
    if (get_type(coin) != COIN || body_is_removed(coin))
    {
      continue;
    }
    vector_t c = body_get_centroid(coin);
    double dx = me.x - c.x, dy = me.y - c.y;
    double dist = sqrt(dx * dx + dy * dy);
    if (dist <= range && dist > 1)
    {
      body_set_velocity(coin, (vector_t){dx / dist * MAGNET_PULL_SPEED,
                                         dy / dist * MAGNET_PULL_SPEED});
    }
  }
}

/**
 * Helper for adding the powerup for more coins.
 * 
 * @param game_play_state the current state of the game
 * @param y_pos the current y position of the coin
 * @return the potentially new y position of the coin
*/
static double add_more_coins_powerup(game_play_state_t *game_play_state, double y_pos)
{
  if (game_play_state->powerup->powerup_active &&
      game_play_state->powerup->powerup_type == MORE_COIN)
  {
    game_play_state->coin->time_until_coin = COIN_GENERATION_TIME_POWERUP;
    double new_deviation = fmod(rand(), MAX_COIN_DEVIATION_POWERUP) - 
                                MIN_COIN_DEVIATION_POWERUP;
    y_pos = game_play_state->coin->prev_center.y + new_deviation;
  }
  return y_pos;
}

/**
 * Add the coins to the game.
 * 
 * @param game_play_state the current state of the game
 * @param dt the time elapsed since the last tick
*/
static void add_coins(game_play_state_t *game_play_state, double dt)
{
  magnetic_powerup(game_play_state);
  game_play_state->coin->coin_time += dt;
  bool laser_state = !game_play_state->laser->laser_active;
  if (laser_state && game_play_state->coin->coin_time >= 
      game_play_state->coin->time_until_coin)
  {
    game_play_state->coin->coin_time = ZERO;
    game_play_state->coin->time_until_coin = fmod(rand(),
                        MAX_COIN_GENERATION_TIME - MIN_COIN_GENERATION_TIME) +
                    MIN_COIN_GENERATION_TIME;
    double y_pos = 0; // chosen below, once the grid size is known
    double x_pos = MAX.x + COIN_X_POS_BUFFER;
    vector_t center = {.x = x_pos, .y = y_pos};
    y_pos = add_more_coins_powerup(game_play_state, y_pos);
    game_play_state->coin->prev_center = center;
    // we use randomness of width and height
    size_t COIN_GRID_WIDTH = (rand() % (MAX_COIN_GRID_SIZE -
                               MIN_COIN_GRID_SIZE + ONE)) + MIN_COIN_GRID_SIZE;
    size_t COIN_GRID_HEIGHT = (rand() % (MAX_COIN_GRID_SIZE - 
                                MIN_COIN_GRID_SIZE + ONE)) + MIN_COIN_GRID_SIZE;
    // keep the whole block between the floor and the ceiling
    double low = FLOOR_Y + COIN_FLOOR_GAP;
    double high = CEILING_Y - COIN_FLOOR_GAP - 2 * COIN_RADIUS -
                  (COIN_GRID_HEIGHT - 1) * COIN_SPACING_Y_SHIFT;
    y_pos = fmin(fmax(y_pos, low), high);
    if (y_pos <= low)
    {
      y_pos = low + fmod(rand(), fmax(1, high - low));
    }
    // iterate through the grid and spawn a block of coins
    for (size_t i = 0; i < COIN_GRID_WIDTH; i++)
    {
      for (size_t j = 0; j < COIN_GRID_HEIGHT; j++)
      {
        vector_t center = {.x = x_pos + (i * COIN_SPACING_X_SHIFT), .y = y_pos +
                                          (j * COIN_SPACING_Y_SHIFT)};
        vector_t middle = {center.x, center.y + COIN_RADIUS};
        if (near_hazard(game_play_state->state->scene, middle,
                        HAZARD_CLEARANCE + COIN_RADIUS))
        {
          continue; // never inside or touching an obstacle
        }
        body_t *coin = make_obstacle_circle(COIN_RADIUS, &center, COIN, 
                                                      COIN_MASS, COIN_VEL);
        scene_add_body(game_play_state->state->scene, coin);
        asset_t *img = asset_make_image_with_body(COIN_PATH, coin);
        list_add(game_play_state->state->body_assets, img);
        // use a function handler to collect coins
        create_collision(game_play_state->state->scene, coin, 
                          game_play_state->state->user,
                         collect_coin, img, game_play_state,
                        COIN_FORCE_CONSTANT);
      }
    }
  }
}

/**
 * Add a powerup to the user.
 * 
 * @param game_play_state the current state of the game
 * @param dt the time elapsed since the last tick
*/
static void add_powerup(game_play_state_t *game_play_state, double dt)
{
  game_play_state->powerup->powerup_time += dt;
  bool laser_state = !game_play_state->laser->laser_active;
  if (laser_state && game_play_state->powerup->powerup_time >= 
                    game_play_state->powerup->time_until_powerup)
  {
    game_play_state->powerup->powerup_time = ZERO;
    game_play_state->powerup->time_until_powerup = fmod(rand(),
                    MAX_POWERUP_GENERATION_TIME - MIN_POWERUP_GENERATION_TIME) +
                MIN_POWERUP_GENERATION_TIME;
    double y_pos = fmod(rand(), (MAX.y - POWERUP_CEILING_OFFSET) - 
                      (MIN.y + POWERUP_GROUND_OFFSET)) + POWERUP_Y_POS_BUFFER;
    double x_pos = MAX.x + POWERUP_X_POS_BUFFER;
#ifdef POWERUP_TEST
    // test builds only: pickups arrive at floor level every few seconds
    y_pos = FLOOR_Y + RUNNER_HIT_HALF_H;
    game_play_state->powerup->time_until_powerup = 5;
#endif
    for (int tries = 0; tries < 8 &&
         near_hazard(game_play_state->state->scene, (vector_t){x_pos, y_pos},
                     HAZARD_CLEARANCE + POWERUP_SIZE / 2);
         tries++)
    {
      y_pos = fmod(rand(), (MAX.y - POWERUP_CEILING_OFFSET) -
                               (MIN.y + POWERUP_GROUND_OFFSET)) + POWERUP_Y_POS_BUFFER;
    }
    vector_t center = {.x = x_pos, .y = y_pos};
    body_t *powerup = make_obstacle_rectangle(&center, POWERUP_SIZE, 
                                            POWERUP_SIZE, POWERUP, POWERUP_VEL);
    scene_add_body(game_play_state->state->scene, powerup);
    game_play_state->powerup->next_type = (powerup_type_t)(rand() % NUM_POWERUPS);
#ifdef POWERUP_TEST
    static int test_cycle = 0; // test builds: every type in turn, TUB first
    game_play_state->powerup->next_type =
        (powerup_type_t)((TECH_ULTRA_BOT + test_cycle++) % NUM_POWERUPS);
#endif
    asset_t *img = asset_make_image_with_body(
        POWERUP_PICKUP_PATHS[game_play_state->powerup->next_type], powerup);
    list_add(game_play_state->state->body_assets, img);
    create_collision(game_play_state->state->scene, powerup,
                     game_play_state->state->user, activate_powerup, img,
                     game_play_state, POWERUP_FORCE_CONSTANT);
  }
  if (game_play_state->powerup->powerup_active && game_play_state->time >=
              game_play_state->powerup->powerup_start_time + POWERUP_DURATION)
  {
    game_play_state->powerup->powerup_active = false;
    remove_individual_powerup(game_play_state);
  }
}

/**
 * Make the necessary items for the rocket warning.
 * 
 * @param game_play_state the current state of the game
*/
static void make_rocket_warning(game_play_state_t *game_play_state)
{
  game_play_state->rocket->time_rocket = ZERO;
  game_play_state->rocket->time_rocket_spawn = game_play_state->time;
  game_play_state->rocket->rocket_active = false;
  double y_pos = fmod(rand(), (MAX.y - MIN.y) - ROCKETS_Y_OFFSET) + 
                                                        ROCKETS_Y_POS_BUFFER;
  double x_pos = MAX.x - ROCKETS_X_POS_BUFFER;
  vector_t center = {.x = x_pos, .y = y_pos};
  game_play_state->rocket->rocket_spawn_position = center;
  body_t *warning = make_obstacle_rectangle(&center, WARNING_WIDTH, 
                                  WARNING_HEIGHT, ROCKET_WARNING, VEC_ZERO);
  scene_add_body(game_play_state->state->scene, warning);
  asset_update_bounding_box(game_play_state->rocket->rocket_inactive_asset, 
                            warning);
  game_play_state->rocket->rocket_inactive = true;
}

/**
 * Make the necessary items for the rocket moving.
 * 
 * @param game_play_state the current state of the game
*/
static void make_moving_rocket(game_play_state_t *game_play_state)
{
  game_play_state->rocket->time_rocket_activate = game_play_state->time;
  game_play_state->rocket->time_rocket_spawn = INFINITY;
  remove_warnings(game_play_state);
  game_play_state->rocket->rocket_spawn_position.x += ROCKETS_X_POS_BUFFER;
  body_t *rocket = make_obstacle_rectangle(
    &game_play_state->rocket->rocket_spawn_position, ROCKET_HIT_W,
    ROCKET_HIT_H, ROCKET, ROCKET_VEL);
  scene_add_body(game_play_state->state->scene, rocket);
  asset_t *img = asset_make_image_with_body(rocket_random_sprite(), rocket);

  list_add(game_play_state->state->body_assets, img);
  game_play_state->rocket->rocket_inactive = false;
  game_play_state->rocket->rocket_active = true;
}

/**
 * Add the rocket to the game.
 * 
 * @param game_play_state the current state of the game
 * @param dt the time elapsed since the last tick
*/
static void add_rocket(game_play_state_t *game_play_state, double dt)
{
  game_play_state->rocket->time_rocket += dt;
  bool laser_state = !game_play_state->laser->laser_active;
  if (laser_state && !game_play_state->rocket->rocket_inactive &&
      game_play_state->rocket->time_rocket >= 
                              game_play_state->rocket->rocket_generation_time)
  {
    make_rocket_warning(game_play_state);
  }

  else if (game_play_state->rocket->rocket_inactive && game_play_state->time - 
          game_play_state->rocket->time_rocket_spawn >= ROCKETS_ACTIVATION_TIME)
  {
    make_moving_rocket(game_play_state);
  }
}

/**
 * Add an inactive laser.
 * 
 * @param game_play_state the current state of the game
*/
static void add_laser_inactive(game_play_state_t *game_play_state)
{
  if (game_play_state->laser->time_laser >=
      game_play_state->laser->laser_generation_time)
  {
    game_play_state->laser->laser_active = true;
    game_play_state->laser->time_laser = ZERO;
    game_play_state->laser->time_laser_spawn = game_play_state->time;
    // we randomly select the number of lasers
    size_t num_laser_initialize = (size_t)round(fmod(
                                  rand(), MAX_NUM_LASERS)) + MIN_NUM_LASERS;
    size_t start_laser_position = (size_t)round(fmod(
                                rand(), NUM_LASERS - num_laser_initialize));

    // based on random numbers, iteratre and active predefined list of lasers
    for (size_t i = start_laser_position; i < start_laser_position +
                                                num_laser_initialize; i++)
    {
      vector_t *center = list_get(game_play_state->laser->laser_centers, i);
      list_add(game_play_state->laser->laser_spawn_positions, center);
      body_t *laser = make_obstacle_rectangle(center, LASER_WIDTH_ACTIVE,
                                      LASER_HEIGHT_ACTIVE, LASER, VEC_ZERO);
      scene_add_body(game_play_state->state->scene, laser);
      clear_coins_near(game_play_state->state, laser, HAZARD_CLEARANCE + COIN_RADIUS);
      asset_update_bounding_box(list_get(
                  game_play_state->laser->laser_inactive_assets, i), laser);
    }
    game_play_state->laser->laser_spawn_bool = LASER_ACTIVE_STATE;
  }
}

/**
 * Add an active laser.
 * 
 * @param game_play_state the current state of the game
*/
static void add_active_laser(game_play_state_t *game_play_state)
{
  // if inactive laser there for certain amount of time,
  // replace with active type
  if (game_play_state->time - game_play_state->laser->time_laser_spawn >=
      LASER_ACTIVATION_TIME)
  {
    game_play_state->laser->time_laser_activate = game_play_state->time;
    game_play_state->laser->time_laser_spawn = INFINITY;
    remove_lasers_inactive(game_play_state);
    size_t size_of_spawn_list = list_size(
                        game_play_state->laser->laser_spawn_positions);

    // retrieve centers from spawn list
    for (size_t i = 0; i < size_of_spawn_list; i++)
    {
      body_t *laser = make_obstacle_rectangle(list_get(
        game_play_state->laser->laser_spawn_positions, i),
        LASER_WIDTH_ACTIVE, LASER_HEIGHT_ACTIVE, LASER_ACTIVE, VEC_ZERO);
      scene_add_body(game_play_state->state->scene, laser);
      clear_coins_near(game_play_state->state, laser, HAZARD_CLEARANCE + COIN_RADIUS);
      asset_update_bounding_box(list_get(
        game_play_state->laser->laser_active_assets, i), laser);
    }
    for (size_t i = 0; i < size_of_spawn_list; i++)
    {
      list_remove(game_play_state->laser->laser_spawn_positions,
                  LIST_START_INDEX);
    }
  }
}

/**
 * Add the laser to the game.
 * 
 * @param game_play_state the current state of the game
 * @param dt the time elapsed since the last tick
*/
static void add_laser(game_play_state_t *game_play_state, double dt)
{
  game_play_state->laser->time_laser += dt;
  switch (game_play_state->laser->laser_spawn_bool)
  {
    case LASER_INACTIVE_STATE:
    {
      add_laser_inactive(game_play_state);
      break;
    }

    case LASER_ACTIVE_STATE:
    {
      add_active_laser(game_play_state);
      break;
    }
    default:
    {
      break;
    }
  }
}

/**
 * Renders the distance traveled on the screen and notifies the observers of this event.
 * 
 * @param game_play_state the current state of the game
 */
static void render_distance(game_play_state_t *game_play_state)
{
  char distance_text[DISTANCE_TEXT_SIZE];
  size_t distance = (size_t)floor(game_play_state->distance_traveled);
  sprintf(distance_text, "%zu %s", distance, DISTANCE_TEXT); // convert time to a string
  SDL_Rect bounding_box = DISTANCE_BOX;
  TTF_Font *font = game_play_state->distance_font;
  TTF_SizeText(font, distance_text, &bounding_box.w, &bounding_box.h);
  render_text(distance_text, font, WHITE, bounding_box);
  if (game_play_state->time - game_play_state->last_update_time > UPDATE_INTERVAL)
  {
    game_play_state->last_update_time = game_play_state->time;
    subject_notify(game_play_state->subject, EVENT_DISTANCE_TRAVELED, distance_text);
  }
}

/**
 * Renders the coins collected on the screen and notifies the observers of this event.
 * 
 * @param game_play_state the current state of the game
 */
static void render_coins_collected(game_play_state_t *game_play_state)
{
  char coin_text[COIN_TEXT_SIZE];
  size_t coins = game_play_state->coin->coin_count;
  sprintf(coin_text, "%s  %zu", COINS_TEXT, coins); // convert the time to a string
  SDL_Rect bounding_box = COIN_BOX;
  TTF_Font *font = game_play_state->coins_collected_font;
  TTF_SizeText(font, coin_text, &bounding_box.w, &bounding_box.h);
  render_text(coin_text, font, GOLD, bounding_box);
}

/**
 * Updates the user position to prevent going above the ceiling or below the ground.
 * 
 * @param game_play_state the current state of the game
 */
static void update_user_pos(game_play_state_t *game_play_state)
{
  // keep the runner between the drawn floor and ceiling surfaces
  vector_t user_centroid = body_get_centroid(game_play_state->state->user);
  vector_t user_vel = body_get_velocity(game_play_state->state->user);
  if (user_vel.y <= ZERO && user_centroid.y < FLOOR_Y + RUNNER_HIT_HALF_H)
  {
    user_centroid.y = FLOOR_Y + RUNNER_HIT_HALF_H;
    body_set_centroid(game_play_state->state->user, user_centroid);
  }
  else if (user_vel.y >= ZERO && user_centroid.y > CEILING_Y - RUNNER_HIT_HALF_H)
  {
    user_centroid.y = CEILING_Y - RUNNER_HIT_HALF_H;
    body_set_centroid(game_play_state->state->user, user_centroid);
  }
}

/**
 * Gives every moving thing on screen a bit of life: zapper bolts flicker,
 * active lasers pulse, cans bob, rockets wobble, the power-up sways.
 *
 * @param game_play_state the current state of the game
 */
static void animate_bodies(game_play_state_t *game_play_state)
{
  double t = game_play_state->time;
  list_t *assets = game_play_state->state->body_assets;
  size_t num_assets = list_size(assets);
  for (size_t i = 0; i < num_assets; i++)
  {
    asset_t *asset = list_get(assets, i);
    if (asset_get_type(asset) != ASSET_IMAGE)
    {
      continue;
    }
    image_asset_t *image = (image_asset_t *)asset;
    body_t *body = image_asset_get_body(image);
    if (body == NULL || body_is_removed(body))
    {
      continue;
    }
    switch (get_type(body))
    {
      case ZAPPER:
      case DRONE:
      case MINE:
      {
        const char *ids[] = {"hazard.zapper", "hazard.drone", "hazard.mine"};
        body_type_t kind = get_type(body);
        const anim_t *anim = anim_get(ids[kind == ZAPPER ? 0 : kind == DRONE ? 1 : 2]);
        if (anim)
        {
          show_anim(image, anim, t + i * 0.13);
        }
        if (kind == DRONE)
        {
          image->offset_y = (int)(6 * sin(t * 3 + i)); // hovering
        }
        if (kind == MINE)
        {
          image->scale = 1.0 + 0.06 * sin(t * 5 + i);  // pulsing
        }
        break;
      }
      case DUAL_LASER:
      case MOVING_LASER:
      case HOMING_ROCKET:
      case FALLING:
      {
        const char *id = get_type(body) == DUAL_LASER ? "hazard.dual_laser"
                         : get_type(body) == MOVING_LASER ? "hazard.moving_laser"
                         : get_type(body) == HOMING_ROCKET ? "hazard.homing_rocket"
                                                           : "hazard.falling";
        const anim_t *anim = anim_get(id);
        if (anim)
        {
          size_t f = anim_frame_at(anim, t + i * 0.13);
          if (get_type(body) == HOMING_ROCKET)
          {
            f %= 5; // the 6th drawing is a lock-on reticle, not a rocket
          }
          if (get_type(body) == FALLING)
          {
            f = body_get_velocity(body).y < 0 ? 3 : (size_t)(t * 6 + i) % 4; // swing, then drop
          }
          image->texture = asset_cache_obj_get_or_create(ASSET_IMAGE, anim_frame_path(anim, f));
        }
        break;
      }
      case ROTATING_LASER:
      {
        const anim_t *anim = anim_get("hazard.rotating_laser");
        if (anim)
        {
          image->texture = asset_cache_obj_get_or_create(ASSET_IMAGE,
              anim_frame_path(anim, 0)); // spun by the engine, not by frames
        }
        image->angle = -body_get_rotation(body) * 180 / M_PI; // screen y points down
        break;
      }
      case LASER_ACTIVE:
      {
        SDL_SetTextureAlphaMod(image->texture, (Uint8)(205 + 50 * sin(t * 18)));
        break;
      }
      case COIN:
      {
        image->offset_y = (int)(3 * sin(t * 4 + i));
        break;
      }
      case ROCKET:
      {
        image->angle = 5 * sin(t * 22 + i);
        break;
      }
      case POWERUP:
      {
        image->angle = 12 * sin(t * 3);
        image->offset_y = (int)(5 * sin(t * 2.5));
        break;
      }
      default:
        break;
    }
  }
}

/**
 * Tilts and bobs the runner, sprays jetpack exhaust while thrusting and
 * bursts sparkles when a can is collected.
 *
 * @param game_play_state the current state of the game
 * @param dt seconds since the last frame
 */
static void animate_runner(game_play_state_t *game_play_state, double dt)
{
  state_temp_t *state = game_play_state->state;
  double t = game_play_state->time;
  SDL_Rect box = find_bounding_box(state->user);
  double cx = box.x + box.w / 2.0;
  double cy = box.y + box.h / 2.0;
  bool thrusting = game_play_state->thrusting;
  double vy = body_get_velocity(state->user).y;
  bool on_ground = box.y + box.h >= WINDOW_HEIGHT - GROUND_OFFSET - 3;

  // animated characters: run on the ground, fly in the air, land on touchdown
  bool animated = character_selected_anim("run") != NULL;
  if (animated)
  {
    const char *want = on_ground && !thrusting ? "run" : "fly";
    // taking off from the floor plays the jump pose first
    const anim_t *jump = character_selected_anim("jump");
    bool was_on_floor = strcmp(game_play_state->anim_state, "run") == 0 ||
                        strcmp(game_play_state->anim_state, "land") == 0;
    if (jump && strcmp(want, "fly") == 0 &&
        (was_on_floor || (strcmp(game_play_state->anim_state, "jump") == 0 &&
                          t - game_play_state->anim_state_start < anim_duration(jump))))
    {
      want = "jump";
    }
    if (on_ground && !thrusting && game_play_state->was_airborne &&
        character_selected_anim("land") != NULL)
    {
      want = "land";
    }
    if (strcmp(game_play_state->anim_state, "land") == 0 && on_ground && !thrusting &&
        t - game_play_state->anim_state_start <
            anim_duration(character_selected_anim("land")))
    {
      want = "land"; // let the landing finish
    }
    if (strcmp(want, game_play_state->anim_state) != 0)
    {
      game_play_state->swap_from = state->user_img->texture;
      game_play_state->swap_start = t;
      game_play_state->anim_state = want;
      game_play_state->anim_state_start = t;
      game_play_state->anim_clock = 0;
    }
    const anim_t *anim = character_selected_anim(game_play_state->anim_state);
    if (anim)
    {
      // the run cycle speeds up with the world so feet keep pace with the floor;
      // the clock is accumulated so a speed change never makes the frames jump
      double pace = strcmp(game_play_state->anim_state, "run") == 0
                        ? state->background_state->scroll_speed / BACKGROUND_SCROLL_SPEED
                        : 1.0;
      game_play_state->anim_clock += dt * pace;
      game_play_state->anim_frame = show_anim(state->user_img, anim, game_play_state->anim_clock);
      // run <-> fly <-> land: a very quick fade instead of a hard cut
      double swap = (t - game_play_state->swap_start) / RUNNER_SWAP_SECONDS;
      if (swap < 1 && game_play_state->swap_from != NULL)
      {
        state->user_img->next_texture = state->user_img->texture;
        state->user_img->texture = game_play_state->swap_from;
        state->user_img->blend = swap;
      }
    }
  }
  game_play_state->was_airborne = !on_ground;

  // lean back while climbing, forward while falling (scaled by speed)
  double target = on_ground && !thrusting ? 0 : -vy / MAX_RISE_SPEED * RUNNER_TILT_UP;
  if (animated)
  {
    target *= 0.35;
  }
  double blend = dt * 10 < 1 ? dt * 10 : 1;
  game_play_state->user_angle += (target - game_play_state->user_angle) * blend;
  if (on_ground && !thrusting && !animated)
  {
    // little running bounce (animated sprites have a real run cycle)
    state->user_img->offset_y = (int)(-fabs(sin(t * 12)) * 4);
    state->user_img->angle = game_play_state->user_angle + 4 * sin(t * 12);
  }
  else
  {
    state->user_img->offset_y = 0;
    state->user_img->angle = game_play_state->user_angle;
  }

  if (thrusting)
  {
    // exhaust trails back and down (the world scrolls left); animated
    // sprites draw their own flame, so they only get a few sparks
    for (int k = 0; k < (animated ? 1 : 5); k++)
    {
      size_t color = (size_t[]){0, 0, 2, 5}[rand() % 4];
      particles_emit(cx + (rand() % 13 - 6), box.y + box.h + 14,
                     -70 - rand() % 90, 150 + rand() % 120,
                     0.3 + (rand() % 25) / 100.0, 4 + rand() % 5, color, 60);
    }
  }

  size_t coins = game_play_state->coin->coin_count;
  if (coins > game_play_state->last_coin_count)
  {
    particles_burst(cx, cy, 14, 240);
  }
  game_play_state->last_coin_count = coins;
}

/**
 * Animates the active power-up's effect around the runner so it's obvious
 * what's going on: the shield bubble breathes, magnet rings spin and pull in
 * sparks, can-rush sparkles orbit, the TECH ULTRA BOT stomps along.
 * Everything blinks during the last few seconds as a warning.
 *
 * @param game_play_state the current state of the game
 */
static void animate_powerup(game_play_state_t *game_play_state)
{
  powerup_state_t *powerup = game_play_state->powerup;
  game_play_state->state->user_img->scale = 1.0;
  if (!powerup->powerup_active || powerup->powerup_img == NULL)
  {
    return;
  }
  double t = game_play_state->time;
  double left = powerup->powerup_start_time + POWERUP_DURATION - t;
  image_asset_t *overlay = powerup->powerup_img;
  SDL_Rect box = find_bounding_box(game_play_state->state->user);
  double cx = box.x + box.w / 2.0, cy = box.y + box.h / 2.0;
  overlay->angle = 0;
  overlay->scale = 1.0;
  switch (powerup->powerup_type)
  {
    case SHIELD:
    {
      overlay->scale = 1.25 + 0.06 * sin(t * 6);
      if (rand() % 6 == 0)
      {
        particles_emit(cx + (rand() % 60 - 30), cy + (rand() % 60 - 30), 0, -20, 0.3,
                       3, 2, 0);
      }
      break;
    }
    case MAGNETIC:
    {
      overlay->scale = 1.5 + 0.12 * sin(t * 8);
      overlay->angle = fmod(t * 120, 360);
      // sparks streaming in from all around
      double a = (rand() % 628) / 100.0;
      particles_emit(cx + cos(a) * 110, cy + sin(a) * 110, -cos(a) * 320,
                     -sin(a) * 320, 0.32, 4, 4, 1);
      break;
    }
    case MORE_COIN:
    {
      overlay->scale = 1.35;
      overlay->angle = fmod(-t * 90, 360);
      if (rand() % 3 == 0)
      {
        particles_emit(cx + (rand() % 90 - 45), cy + (rand() % 90 - 45), -80, 40, 0.5,
                       5, 0, 120);
      }
      break;
    }
    case TECH_ULTRA_BOT:
    {
      // the big robot replaces the runner: transform in, run/fly, smash,
      // and transform back out as it expires
      double since = t - powerup->powerup_start_time;
      bool grounded = box.y + box.h >= WINDOW_HEIGHT - GROUND_OFFSET - 3;
      const anim_t *transform = anim_get("tub.transform");
      const anim_t *smash = anim_get("tub.smash");
      const anim_t *anim = anim_get(grounded && !game_play_state->thrusting ? "tub.run"
                                                                             : "tub.fly");
      double anim_t_ = since;
      if (transform && since < anim_duration(transform))
      {
        anim = transform;
      }
      else if (transform && left < anim_duration(transform))
      {
        anim = transform; // play it backwards on the way out
        anim_t_ = left;
      }
      else if (smash && t - game_play_state->tub_smash_time < anim_duration(smash))
      {
        anim = smash;
        anim_t_ = t - game_play_state->tub_smash_time;
      }
      if (anim)
      {
        show_anim(overlay, anim, anim_t_);
      }
      double tub_scale = TUB_SPRITE / box.h;
      overlay->scale = tub_scale;
      // grown about its center, then lifted so its feet are on the runner's feet
      double lift = (tub_scale - 1) * box.h * 0.5;
      double top = box.y - lift - (tub_scale - 1) * box.h * 0.5;
      overlay->offset_y = (int)(-lift + (top < 0 ? -top : 0)); // never above the screen
      overlay->angle = 0;
      game_play_state->state->user_img->scale = 0.01; // hide the normal runner
      if (since < 0.12)
      {
        // activation flash
        sdl_fill_rect((SDL_Rect){0, 0, WINDOW_WIDTH, WINDOW_HEIGHT}, 120, 255, 150,
                      (Uint8)(150 * (1 - since / 0.12)));
      }
      if (rand() % 3 == 0)
      {
        // purple/green energy around it
        double a = (rand() % 628) / 100.0;
        particles_emit(cx + cos(a) * 70, cy - lift * 0.5 + sin(a) * 70, 0, -40, 0.4, 4,
                       rand() % 2 ? 3 : 5, 0);
      }
      break;
    }
    default:
      break;
  }
  bool blink = left < POWERUP_WARN_TIME && ((int)(t * 8)) % 2 == 0 &&
               powerup->powerup_type != TECH_ULTRA_BOT;
  SDL_SetTextureAlphaMod(overlay->texture, blink ? 70 : 255);
}

/**
 * Shows the active power-up (icon, name, what it does, time left) in the
 * status bar above the playfield; the bar blinks near the end.
 *
 * @param game_play_state the current state of the game
 */
static void render_powerup_hud(game_play_state_t *game_play_state)
{
  powerup_state_t *powerup = game_play_state->powerup;
  if (!powerup->powerup_active)
  {
    sdl_top_bar_clear();
    return;
  }
  double t = game_play_state->time;
  double left = powerup->powerup_start_time + POWERUP_DURATION - t;
  powerup_type_t type = powerup->powerup_type;
  bool blink = left < POWERUP_WARN_TIME && ((int)(t * 8)) % 2 == 0;
  SDL_Texture *icon = asset_cache_obj_get_or_create(ASSET_IMAGE,
                                                    POWERUP_PICKUP_PATHS[type]);
  sdl_top_bar_set(POWERUP_NAMES[type], POWERUP_DESCRIPTIONS[type], POWERUP_COLORS[type],
                  icon, blink ? 0 : left / POWERUP_DURATION);
}

/**
 * Jetpack physics: holding Space accelerates up, gravity pulls down, with
 * speed limits, and the runner stops cleanly at the floor and ceiling.
 *
 * @param game_play_state the current state of the game
 * @param dt seconds since the last frame
 */
static void apply_jetpack(game_play_state_t *game_play_state, double dt)
{
  body_t *user = game_play_state->state->user;
  vector_t vel = body_get_velocity(user);
  vector_t at = body_get_centroid(user);
  if (at.x != MAX.x / 2)
  {
    body_set_centroid(user, (vector_t){MAX.x / 2, at.y}); // the runner never drifts sideways
  }
  vel.x = 0;
  vel.y += (game_play_state->thrusting ? THRUST_ACCEL : -FALL_ACCEL) * dt;
  if (vel.y > MAX_RISE_SPEED)
  {
    vel.y = MAX_RISE_SPEED;
  }
  if (vel.y < -MAX_FALL_SPEED)
  {
    vel.y = -MAX_FALL_SPEED;
  }
  vector_t pos = body_get_centroid(user);
  double floor_y = FLOOR_Y + RUNNER_HIT_HALF_H;
  double ceiling_y = CEILING_Y - RUNNER_HIT_HALF_H;
  if ((pos.y <= floor_y && vel.y < 0) || (pos.y >= ceiling_y && vel.y > 0))
  {
    vel.y = 0;
  }
  body_set_velocity(user, vel);
}

/**
 * The TECH ULTRA BOT smashes zappers and rockets it touches.
 *
 * @param game_play_state the current state of the game
 */
static void tub_smash(game_play_state_t *game_play_state)
{
  powerup_state_t *powerup = game_play_state->powerup;
  if (!powerup->powerup_active || powerup->powerup_type != TECH_ULTRA_BOT)
  {
    return;
  }
  state_temp_t *state = game_play_state->state;
  vector_t me = body_get_centroid(state->user);
  size_t num_assets = list_size(state->body_assets);
  for (size_t i = 0; i < num_assets; i++)
  {
    asset_t *asset = list_get(state->body_assets, i);
    if (asset_get_type(asset) != ASSET_IMAGE)
    {
      continue;
    }
    body_t *body = image_asset_get_body((image_asset_t *)asset);
    if (body == NULL || body_is_removed(body) ||
        !is_hazard(get_type(body)) || get_type(body) == LASER ||
        get_type(body) == LASER_ACTIVE)
    {
      continue;
    }
    // the robot is drawn standing on the runner's feet and much taller than
    // the runner's hitbox, so smash whatever overlaps the drawn robot
    vector_t c = body_get_centroid(body);
    double tub_h = TUB_SPRITE * 0.8; // the robot's body within its frame
    double tub_cy = fmin(me.y - RUNNER_HIT_HALF_H + tub_h * 0.5, CEILING_Y - tub_h * 0.5);
    if (fabs(c.x - me.x) < tub_h * TUB_SMASH_WIDTH && fabs(c.y - tub_cy) < tub_h * 0.5)
    {
      SDL_Rect box = find_bounding_box(body);
      particles_burst(box.x + box.w / 2.0, box.y + box.h / 2.0, 45, 480);
      effect_spawn(4, box.x + box.w / 2.0, box.y + box.h / 2.0, 120, game_play_state->time);
      effect_spawn(3, box.x + box.w / 2.0, box.y + box.h / 2.0, 90, game_play_state->time);
      game_play_state->tub_smashes++;
      game_play_state->tub_smash_time = game_play_state->time;
      body_remove(body);
      asset_update_bounding_box_x(asset, POWERUP_INITIAL_X); // off screen
    }
  }
}

/**
 * The crash moment: a white flash, the runner tumbles, then the end screen.
 *
 * @param game_play_state the current state of the game
 */
static void render_death(game_play_state_t *game_play_state)
{
  double since = game_play_state->time - game_play_state->death_time;
  image_asset_t *runner = game_play_state->state->user_img;
  runner->angle = since * 720;
  runner->scale = 1.0;
  // hop up, then fall -- but never through the floor
  SDL_Rect box = find_bounding_box(game_play_state->state->user);
  int lowest = (WINDOW_HEIGHT - (int)GROUND_OFFSET) - (box.y + box.h) + 8;
  int offset = (int)(-160 * since + 520 * since * since);
  runner->offset_y = offset < lowest ? offset : lowest;
  if (since < 0.3)
  {
    sdl_fill_rect((SDL_Rect){0, 0, WINDOW_WIDTH, WINDOW_HEIGHT}, 255, 255, 255,
                  (Uint8)(200 * (1 - since / 0.3)));
  }
  if (since >= DEATH_DURATION)
  {
    game_play_state->curr_state = GAME_OVER;
  }
}

/**
 * Drones, mines and floor spikes from the hazards sheet. They use the same
 * collisions as zappers (and the TECH ULTRA BOT smashes them).
 *
 * @param game_play_state the current state of the game
 * @param dt seconds since the last frame
 */
/**
 * Puts one sheet hazard into the world (shared by the spawner and tests).
 *
 * @param game_play_state the current state of the game
 * @param kind which hazard
 * @param x where its center goes
 * @param y its height (ignored for floor/ceiling hazards)
 * @return the main body
 */
static body_t *spawn_hazard(game_play_state_t *game_play_state, body_type_t kind, double x,
                            double y)
{
  state_temp_t *state = game_play_state->state;
  double w = 0, h = 0;
  vector_t vel = ZAPPER_VEL;
  const char *path = NULL;
  char frame[96];
  switch (kind)
  {
    case DRONE: w = DRONE_HIT_W; h = DRONE_HIT_H; path = "drone/00.png"; break;
    case MINE: w = h = MINE_HIT; path = "mine/00.png"; break;
    case SPIKES:
      w = SPIKES_HIT_W; h = SPIKES_HIT_H; y = FLOOR_Y + h / 2; path = "spikes/03.png";
      break;
    case DUAL_LASER:
      w = DUAL_LASER_HIT_W; h = DUAL_LASER_HIT_H; path = "dual_laser/00.png";
      break;
    case MOVING_LASER:
      w = MOVING_LASER_HIT_W; h = MOVING_LASER_HIT_H; path = "moving_laser/00.png";
      vel.y = rand() % 2 ? MOVING_LASER_SPEED : -MOVING_LASER_SPEED;
      break;
    case ROTATING_LASER:
      w = ROTATING_ARM_LEN; h = ROTATING_ARM_THICK; path = "rotating_laser/00.png";
      y = fmax(fmin(y, CEILING_Y - ROTATING_ARM_LEN / 2 - 6), FLOOR_Y + ROTATING_ARM_LEN / 2 + 6);
      break;
    case HOMING_ROCKET:
      w = HOMING_HIT_W; h = HOMING_HIT_H; path = "homing_rocket/00.png";
      vel = (vector_t){-HOMING_SPEED, 0};
      break;
    case CRATE:
      w = h = CRATE_HIT;
      snprintf(frame, sizeof(frame), "crate/%02d.png", rand() % 4); // the solid crates
      path = frame;
      if (rand() % 2)
      {
        y = FLOOR_Y + h / 2; // on the floor half the time
      }
      break;
    case FALLING:
      w = h = FALLING_HIT; y = CEILING_Y - FALLING_HIT / 2 - 34; path = "falling/00.png";
      break;
    default:
      return NULL;
  }
  vector_t center = {.x = x, .y = y};
  body_t *body = make_obstacle_rectangle(&center, w, h, kind, vel);
  scene_add_body(state->scene, body);
  clear_coins_near(state, body, HAZARD_CLEARANCE + COIN_RADIUS);
  char full[128];
  snprintf(full, sizeof(full), "assets/techride/hazards/%s", path);
  asset_t *img = asset_make_image_with_body(full, body);
  list_add(state->body_assets, img);
  if (kind == ROTATING_LASER)
  {
    // the second arm of the cross: same hub, a quarter turn ahead, no picture
    body_t *arm = make_obstacle_rectangle(&center, w, h, ROTATING_LASER, vel);
    body_set_rotation(arm, M_PI / 2);
    scene_add_body(state->scene, arm);
    clear_coins_near(state, arm, HAZARD_CLEARANCE + COIN_RADIUS);
  }
  return body;
}

/**
 * Sheet hazards beyond zappers, lasers and missiles. Harder difficulties
 * add more kinds to the pool.
 *
 * @param game_play_state the current state of the game
 * @param dt seconds since the last frame
 */
static void add_extra_hazard(game_play_state_t *game_play_state, double dt)
{
  game_play_state->extra_time += dt;
  if (game_play_state->laser->laser_active ||
      game_play_state->extra_time < game_play_state->extra_next)
  {
    return;
  }
  size_t level = game_play_state->difficulty <= HARD ? game_play_state->difficulty : 0;
  game_play_state->extra_time = 0;
  game_play_state->extra_next = EXTRA_HAZARD_MIN_TIME[level] +
      fmod(rand(), (EXTRA_HAZARD_MAX_TIME[level] - EXTRA_HAZARD_MIN_TIME[level]) * 100) / 100;
  static const body_type_t pool[] = {DRONE, MINE, SPIKES, CRATE,          // easy
                                     DUAL_LASER, MOVING_LASER, FALLING,   // + medium
                                     ROTATING_LASER, HOMING_ROCKET};      // + hard
  size_t sizes[] = {4, 7, 9};
  body_type_t kind = pool[rand() % sizes[level]];
  double y = fmod(rand(), (MAX.y - ZAPPER_CEILING_OFFSET) - (MIN.y + ZAPPER_GROUND_OFFSET)) +
             ZAPPER_Y_POS_BUFFER;
  spawn_hazard(game_play_state, kind, MAX.x + 80, y);
}

/**
 * Keeps everything scrolling at the current world speed, which rises with
 * distance so runs get faster. Missiles keep their extra speed; coins being
 * pulled by a magnet keep the pull's motion.
 *
 * @param game_play_state the current state of the game
 */
static void apply_world_speed(game_play_state_t *game_play_state)
{
  state_temp_t *state = game_play_state->state;
  double speed = fmin(BACKGROUND_SCROLL_SPEED +
                      game_play_state->distance_traveled * WORLD_SPEED_RAMP, WORLD_SPEED_MAX);
  state->background_state->scroll_speed = speed;
  powerup_state_t *powerup = game_play_state->powerup;
  bool pulling = powerup->powerup_active && (powerup->powerup_type == MAGNETIC ||
                                             powerup->powerup_type == TECH_ULTRA_BOT);
  for (size_t i = 0; i < scene_bodies(state->scene); i++)
  {
    body_t *body = scene_get_body(state->scene, i);
    if (body_is_removed(body))
    {
      continue;
    }
    vector_t v = body_get_velocity(body);
    switch (get_type(body))
    {
      case COIN:
        if (pulling)
        {
          break;
        }
        // fall through
      case ZAPPER:
      case POWERUP:
      case DRONE:
      case MINE:
      case SPIKES:
      case DUAL_LASER:
      case MOVING_LASER:
      case ROTATING_LASER:
      case CRATE:
      case FALLING:
        body_set_velocity(body, (vector_t){-speed, v.y});
        break;
      case ROCKET:
        body_set_velocity(body, (vector_t){-(speed + MISSILE_EXTRA_SPEED), v.y});
        break;
      case HOMING_ROCKET:
        body_set_velocity(body, (vector_t){-(speed + HOMING_EXTRA_SPEED), v.y});
        break;
      default:
        break;
    }
  }
}

/**
 * Per-frame movement for the hazards that do more than scroll.
 *
 * @param game_play_state the current state of the game
 * @param dt seconds since the last frame
 */
static void move_hazards(game_play_state_t *game_play_state, double dt)
{
  state_temp_t *state = game_play_state->state;
  vector_t me = body_get_centroid(state->user);
  for (size_t i = 0; i < scene_bodies(state->scene); i++)
  {
    body_t *body = scene_get_body(state->scene, i);
    if (body_is_removed(body))
    {
      continue;
    }
    vector_t c = body_get_centroid(body);
    vector_t v = body_get_velocity(body);
    switch (get_type(body))
    {
      case MOVING_LASER:
      {
        // slides between the floor and the ceiling
        double half = MOVING_LASER_HIT_H / 2 + 4;
        if ((c.y > CEILING_Y - half && v.y > 0) || (c.y < FLOOR_Y + half && v.y < 0))
        {
          body_set_velocity(body, (vector_t){v.x, -v.y});
        }
        break;
      }
      case ROTATING_LASER:
        body_set_rotation(body, body_get_rotation(body) + ROTATING_LASER_SPIN * dt);
        break;
      case HOMING_ROCKET:
      {
        // steers toward the runner's height, but only while still ahead of it
        double steer = c.x > me.x ? fmax(fmin((me.y - c.y) * 1.6, HOMING_TURN), -HOMING_TURN) : 0;
        body_set_velocity(body, (vector_t){v.x, steer});
        break;
      }
      case FALLING:
      {
        double drop_time = (c.y - FLOOR_Y - FALLING_HIT / 2) / FALLING_SPEED;
        double lead = -v.x * drop_time; // how far it drifts while falling
        if (v.y == 0 && c.y > FLOOR_Y + FALLING_HIT && c.x - me.x <= lead)
        {
          body_set_velocity(body, (vector_t){v.x, -FALLING_SPEED}); // let go: lands on you
        }
        else if (v.y < 0 && c.y <= FLOOR_Y + FALLING_HIT / 2)
        {
          // slam into the floor and stay there as a block to jump over
          body_set_centroid(body, (vector_t){c.x, FLOOR_Y + FALLING_HIT / 2});
          body_set_velocity(body, (vector_t){v.x, 0});
          SDL_Rect box = find_bounding_box(body);
          effect_spawn(2, box.x + box.w / 2.0, box.y + box.h, 90, game_play_state->time);
        }
        break;
      }
      default:
        break;
    }
  }
}

double game_play_get_distance(game_play_state_t *game_play_state)
{
  return game_play_state->distance_traveled;
}

state_type_t game_play_main(game_play_state_t *game_play_state)
{
  double dt = time_since_last_tick();
  game_play_state->time += dt;
  bool dying = game_play_state->dying;

  state_temp_t *state = game_play_state->state;
  if (!dying)
  {
    double scroll_speed = state->background_state->scroll_speed;
    game_play_state->distance_traveled += (dt * scroll_speed);
    add_zapper(game_play_state, dt);
    add_laser(game_play_state, dt);
    add_rocket(game_play_state, dt);
    add_coins(game_play_state, dt);
    add_powerup(game_play_state, dt);
    add_extra_hazard(game_play_state, dt);
  }
  sdl_clear();
  if (!dying)
  {
    background_update(state->background_state, dt);
  }
  if (character_selected_frame_count() > 1)
  {
    state->anim_time += dt;
    const char *frame = character_selected_frame(character_frame_at_time(state->anim_time));
    state->user_img->texture = asset_cache_obj_get_or_create(ASSET_IMAGE, frame);
  }
  background_render(state->background_state);
  animate_bodies(game_play_state);
  if (!dying)
  {
    animate_runner(game_play_state, dt);
    animate_powerup(game_play_state);
    tub_smash(game_play_state);
  }
  // accessories follow the runner's current animation frame and tilt
  const anim_t *runner_anim = character_selected_anim(game_play_state->anim_state);
  bool wearing = runner_anim && state->user_img->scale > 0.5;
  SDL_FRect runner_box = find_bounding_box_f(state->user);
  runner_box.y += state->user_img->offset_y;
  if (wearing)
  {
    cosmetics_render(runner_anim, runner_box, state->user_img->angle, true);
  }
  size_t num_assets = list_size(state->body_assets);
  for (size_t i = 0; i < num_assets; i++)
  {
    asset_render(list_get(state->body_assets, i));
  }
  if (wearing)
  {
    cosmetics_render(runner_anim, runner_box, state->user_img->angle, false);
  }
  particles_update(dt);
  particles_render();
  effects_render(game_play_state->time);
  if (settings_debug_hitboxes())
  {
    // testing aid: outline every collision shape
    for (size_t i = 0; i < scene_bodies(state->scene); i++)
    {
      body_t *body = scene_get_body(state->scene, i);
      body_type_t t = get_type(body);
      if (body_is_removed(body) || t == CEILING || t == GROUND)
      {
        continue;
      }
      rgb_color_t c = t == USER ? (rgb_color_t){60, 255, 90}
                      : t == COIN ? (rgb_color_t){255, 220, 40}
                      : t == POWERUP ? (rgb_color_t){80, 220, 255}
                                     : (rgb_color_t){255, 50, 50};
      if (t == USER)
      {
        // broad oval faint, precise outline bright
        sdl_draw_outline(body, (rgb_color_t){40, 110, 50});
        body_t *outline = body_init(runner_outline(game_play_state), 1, (rgb_color_t){0, 0, 0});
        sdl_draw_outline(outline, c);
        body_free(outline);
        continue;
      }
      sdl_draw_outline(body, c);
    }
  }
  // dark panel so the score reads clearly over the background
  sdl_fill_rect(HUD_PANEL_BOX, 8, 6, 26, 190);
  render_distance(game_play_state);
  render_coins_collected(game_play_state);
  if (dying)
  {
    render_death(game_play_state);
    sdl_show();
    return game_play_state->curr_state; // world stays frozen
  }
  render_powerup_hud(game_play_state);
  update_user_pos(game_play_state);
  remove_lasers(game_play_state);
  remove_moving_bodies(game_play_state->state, ZAPPER);
  remove_moving_bodies(game_play_state->state, COIN);
  remove_moving_bodies(game_play_state->state, ROCKET);
  remove_moving_bodies(game_play_state->state, POWERUP);
  remove_moving_bodies(game_play_state->state, DRONE);
  remove_moving_bodies(game_play_state->state, MINE);
  remove_moving_bodies(game_play_state->state, SPIKES);
  for (body_type_t t = DUAL_LASER; t <= FALLING; t++)
  {
    remove_moving_bodies(game_play_state->state, t);
  }
  sdl_show();
  check_hazard_hits(game_play_state);
  apply_jetpack(game_play_state, dt);
  apply_world_speed(game_play_state);
  move_hazards(game_play_state, dt);
  scene_tick(state->scene, dt);
  return game_play_state->curr_state;
}

/**
 * Frees everything in the general state with its bodies.
 * 
 * @param game_play_state the current state of the game
 */
static void state_free(game_play_state_t *game_play_state)
{
  state_temp_t *state = game_play_state->state;
  background_free(state->background_state);
  list_free(state->body_assets);
  scene_free(state->scene);
  free(state);
}

/**
 * Frees everything in the laser state.
 * 
 * @param game_play_state the current state of the game
 */
static void laser_free(game_play_state_t *game_play_state)
{
  laser_state_t *state = game_play_state->laser;
  list_free(state->laser_centers);
  list_free(state->laser_spawn_positions);
  list_free(state->laser_active_assets);
  list_free(state->laser_inactive_assets);
  free(state);
}

void game_play_free(game_play_state_t *game_play_state)
{
  laser_free(game_play_state);
  free(game_play_state->rocket);
  free(game_play_state->zapper);
  free(game_play_state->coin);
  subject_free(game_play_state->subject);
  asset_cache_destroy();
  TTF_CloseFont(game_play_state->distance_font);
  TTF_CloseFont(game_play_state->coins_collected_font);
  state_free(game_play_state);
  free(game_play_state->powerup);
  free(game_play_state);
}

void game_play_stats(game_play_state_t *game_play_state, char *buf, size_t size)
{
  state_temp_t *state = game_play_state->state;
  powerup_state_t *powerup = game_play_state->powerup;
  SDL_Rect box = find_bounding_box(state->user);
  size_t counts[SPIKES + 1] = {0};
  size_t num = scene_bodies(state->scene);
  for (size_t i = 0; i < num; i++)
  {
    body_t *body = scene_get_body(state->scene, i);
    body_type_t t = get_type(body);
    if (t <= SPIKES && !body_is_removed(body) && body_get_centroid(body).x < MAX.x + 40)
    {
      counts[t]++;
    }
  }
  // coins whose center is inside any hazard's collision box (should be 0)
  size_t coins_in_hazards = 0, coins_in_by_type[SPIKES + 1] = {0};
  for (size_t i = 0; i < num; i++)
  {
    body_t *coin = scene_get_body(state->scene, i);
    if (get_type(coin) != COIN || body_is_removed(coin))
    {
      continue;
    }
    vector_t c = body_get_centroid(coin);
    for (size_t j = 0; j < num; j++)
    {
      body_t *hz = scene_get_body(state->scene, j);
      body_type_t t = get_type(hz);
      if (body_is_removed(hz) || !is_hazard(t))
      {
        continue;
      }
      double x0, y0, x1, y1;
      body_box(hz, &x0, &y0, &x1, &y1);
      if (c.x > x0 && c.x < x1 && c.y > y0 && c.y < y1)
      {
        coins_in_by_type[t]++;
        bool pulling = powerup->powerup_active && (powerup->powerup_type == MAGNETIC ||
                                                   powerup->powerup_type == TECH_ULTRA_BOT);
        if (t != ROCKET && !pulling)
        {
          // missiles fly through coins and magnets drag coins across the
          // screen; apart from that, a coin must never sit inside a hazard
          coins_in_hazards++;
        }
      }
    }
  }
  snprintf(buf, size,
           "{\"distance\":%d,\"coins\":%zu,\"powerup\":%d,\"powerupType\":%d,"
           "\"tubSmashes\":%zu,\"dying\":%d,\"runnerBottom\":%d,\"runnerHeight\":%d,"
           "\"onFloor\":%d,\"anim\":\"%s\",\"zappers\":%zu,\"rockets\":%zu,"
           "\"drones\":%zu,\"mines\":%zu,\"spikes\":%zu,\"coinsOnScreen\":%zu,"
           "\"worldX\":%.1f,\"worldY\":%.1f,\"velY\":%.1f,\"coinsInHazards\":%zu,"
           "\"inZapper\":%zu,\"inLaser\":%zu,\"inDrone\":%zu,\"inMine\":%zu,"
           "\"inSpikes\":%zu,\"inRocket\":%zu}",
           (int)game_play_state->distance_traveled, game_play_state->coin->coin_count,
           powerup->powerup_active, (int)powerup->powerup_type, game_play_state->tub_smashes,
           game_play_state->dying, box.y + box.h, box.h,
           box.y + box.h >= WINDOW_HEIGHT - GROUND_OFFSET - 3, game_play_state->anim_state,
           counts[ZAPPER], counts[ROCKET], counts[DRONE], counts[MINE], counts[SPIKES],
           counts[COIN], body_get_centroid(state->user).x, body_get_centroid(state->user).y,
           body_get_velocity(state->user).y, coins_in_hazards, coins_in_by_type[ZAPPER],
           coins_in_by_type[LASER] + coins_in_by_type[LASER_ACTIVE], coins_in_by_type[DRONE],
           coins_in_by_type[MINE], coins_in_by_type[SPIKES], coins_in_by_type[ROCKET]);
}

#ifdef GAME_TEST
void game_play_test_powerup(game_play_state_t *game_play_state, powerup_type_t type)
{
  // spawn a pickup right on the runner; it is collected on the next tick
  powerup_state_t *powerup = game_play_state->powerup;
  vector_t me = body_get_centroid(game_play_state->state->user);
  body_t *pickup = make_obstacle_rectangle(&me, POWERUP_SIZE, POWERUP_SIZE, POWERUP,
                                           POWERUP_VEL);
  scene_add_body(game_play_state->state->scene, pickup);
  powerup->next_type = type;
  asset_t *img = asset_make_image_with_body(POWERUP_PICKUP_PATHS[type], pickup);
  list_add(game_play_state->state->body_assets, img);
  create_collision(game_play_state->state->scene, pickup, game_play_state->state->user,
                   activate_powerup, img, game_play_state, POWERUP_FORCE_CONSTANT);
}

static body_t *test_last = NULL; // the most recent test-spawned hazard

void game_play_test_probe(game_play_state_t *game_play_state, char *buf, size_t size)
{
  scene_t *scene = game_play_state->state->scene;
  for (size_t i = 0; test_last && i < scene_bodies(scene); i++)
  {
    if (scene_get_body(scene, i) == test_last && !body_is_removed(test_last))
    {
      vector_t c = body_get_centroid(test_last);
      snprintf(buf, size, "{\"alive\":1,\"x\":%.1f,\"y\":%.1f,\"rot\":%.3f}", c.x, c.y,
               body_get_rotation(test_last));
      return;
    }
  }
  snprintf(buf, size, "{\"alive\":0}");
}

void game_play_test_spawn(game_play_state_t *game_play_state, int kind)
{
  state_temp_t *state = game_play_state->state;
  vector_t me = body_get_centroid(state->user);
  vector_t at = {.x = me.x + 160, .y = me.y};
  body_type_t types[] = {ZAPPER, DRONE, MINE, SPIKES, ROCKET};
  double ws[] = {ZAPPER_HIT_W, DRONE_HIT_W, MINE_HIT, SPIKES_HIT_W, ROCKET_HIT_W};
  double hs[] = {ZAPPER_HIT_H, DRONE_HIT_H, MINE_HIT, SPIKES_HIT_H, ROCKET_HIT_H};
  const char *paths[] = {ZAPPER_PATH, "assets/techride/hazards/drone/00.png",
                         "assets/techride/hazards/mine/00.png",
                         "assets/techride/hazards/spikes/03.png", rocket_random_sprite()};
  if (kind >= 5 && kind <= 10)
  {
    body_type_t extra[] = {DUAL_LASER, MOVING_LASER, ROTATING_LASER, HOMING_ROCKET, CRATE,
                           FALLING};
    body_type_t t = extra[kind - 5];
    double ahead = t == FALLING ? 420 : t == HOMING_ROCKET ? 380 : t == MOVING_LASER ? 110 : 200;
    double y = t == HOMING_ROCKET ? me.y + 90 : me.y;
    test_last = spawn_hazard(game_play_state, t, me.x + ahead, y);
    if (t == CRATE)
    {
      body_set_centroid(test_last, (vector_t){me.x + ahead, me.y});
    }
    return;
  }
  if (kind < 0 || kind > 4)
  {
    return;
  }
  if (types[kind] == SPIKES)
  {
    at.y = FLOOR_Y + SPIKES_HIT_H / 2;
  }
  vector_t vel = types[kind] == ROCKET ? ROCKET_VEL : ZAPPER_VEL;
  body_t *body = make_obstacle_rectangle(&at, ws[kind], hs[kind], types[kind], vel);
  scene_add_body(state->scene, body);
  test_last = body;
  asset_t *img = asset_make_image_with_body(paths[kind], body);
  list_add(state->body_assets, img);
}
#endif
