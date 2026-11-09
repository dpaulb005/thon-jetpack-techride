#ifndef __GAME_PLAY_HELPER_H__
#define __GAME_PLAY_HELPER_H__

#include <assert.h>
#include <state.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <time.h>
#include <math.h>

#include "collision.h"
#include "forces.h"
#include "asset.h"
#include "constants.h"
#include "asset_cache.h"
#include "sdl_wrapper.h"

typedef enum
{
  USER,
  CEILING,
  GROUND,
  ZAPPER,
  LASER,
  LASER_ACTIVE,
  ROCKET_WARNING,
  ROCKET,
  COIN,
  POWERUP,
  DRONE,
  MINE,
  SPIKES,
  DUAL_LASER,
  MOVING_LASER,
  ROTATING_LASER,
  HOMING_ROCKET,
  CRATE,
  FALLING
} body_type_t;

#define MAX_BG_LAYERS 2

/**
 * One scrolling background layer, drawn twice side by side so it loops.
 */
typedef struct bg_layer
{
  asset_t *a;
  asset_t *b;
  int width;      // on-screen width of one copy
  double factor;  // scroll speed relative to the game (parallax depth)
  double offset;
} bg_layer_t;

typedef struct background_state
{
  bg_layer_t layers[MAX_BG_LAYERS];
  size_t num_layers;
  double scroll_speed;
} background_state_t;

typedef struct state_temp
{
  background_state_t *background_state;
  list_t *body_assets;
  body_t *user;
  image_asset_t *user_img;
  double anim_time;
  body_t *ceiling;
  body_t *ground;
  scene_t *scene;
} state_temp_t;

/**
 * Get type of the body.
 * 
 * @param body the body to get the type of
 * @return the type of the body
*/
body_type_t get_type(body_t *body);

/**
 * Creates a generic rectangular body for an obstacle
 * 
 * @param center the center of the rectangle
 * @param width the width of the rectangle
 * @param height the height of the rectangle
 * @param info the type of the body
 * @param velocity the velocity of the body
 * @return a pointer to the newly allocated body
 */
body_t *make_obstacle_rectangle(vector_t *center, double width, double height, 
                                body_type_t info, vector_t velocity);

/**
 * Creates a generic circular body for an obstacle
 * 
 * @param radius the radius of the circle
 * @param center the center of the circle
 * @param info the type of the body
 * @param mass the mass of the body
 * @param velocity the velocity of the body
 * @return a pointer to the newly allocated body
 */
body_t *make_obstacle_circle(double radius, vector_t *center, body_type_t info,
                            double mass, vector_t velocity);

/**
 * Remove the bodies in the state of the game.
 * 
 * @param state the state of the game
 * @param info the type of the body to remove
*/
/**
 * Makes an oval body (used for the runner's hitbox).
 *
 * @param half_w half the width
 * @param half_h half the height
 * @param center where its center goes
 * @param info the body type
 * @param mass its mass
 * @param velocity its starting velocity
 * @return the new body
 */
body_t *make_obstacle_oval(double half_w, double half_h, vector_t *center,
                           body_type_t info, double mass, vector_t velocity);

void remove_moving_bodies(state_temp_t *state, body_type_t info);

/**
 * Updates the background so it scrolls and wraps around the screen.
 * 
 * @param state the background state
 * @param dt the time since the last tick
 */
void background_update(background_state_t *state, double dt);

/**
 * Draws every background layer, far to near.
 *
 * @param state the background state
 */
void background_render(background_state_t *state);

/**
 * Frees the background's assets and the state itself.
 *
 * @param state the background state
 */
void background_free(background_state_t *state);

/**
 * Initialize a state_temp_t.
 * 
 * @return a pointer to a state_temp_t object
*/
state_temp_t *state_temp_init();

#endif // #ifndef __GAME_PLAY_HELPER_H__