#include <assert.h>
#include <state.h>
#include <stdio.h>
#include <stdlib.h>
#include <stdbool.h>

#include "home.h"
#include "settings.h"
#include "game_play.h"
#include "game_over.h"
#include "asset.h"
#include "asset_cache.h"
#include "sdl_wrapper.h"
#include "constants.h"
#include "leaderboard.h"
#include "game_settings.h"
#include "character.h"
#include "cosmetics.h"

#ifdef __EMSCRIPTEN__
#include <emscripten.h>
#define WEB_EXPORT EMSCRIPTEN_KEEPALIVE
#else
#define WEB_EXPORT
#endif

struct state
{
  state_type_t curr_state;
  difficulty_type_t difficulty_level;
  size_t last_distance;
  size_t best_distance;
  bool best_loaded;
  bool new_best;
  home_state_t *home_state;
  settings_state_t *settings_state;
  game_play_state_t *game_play_state;
  game_over_state_t *game_over_state;
};

/**
 * Records the distance of a finished run and whether it beat the best.
 *
 * @param state the state object
 * @param distance meters traveled in the run
 */
static void record_run(state_t *state, size_t distance)
{
  if (!state->best_loaded)
  {
    state->best_distance = save_read_number(BEST_DISTANCE_FILENAME);
    state->best_loaded = true;
  }
  state->last_distance = distance;
  state->new_best = distance > state->best_distance;
  if (state->new_best)
  {
    state->best_distance = distance;
    save_write_number(BEST_DISTANCE_FILENAME, distance);
  }
}

#ifndef __EMSCRIPTEN__ // on the web the HTML page is the home screen
/**
 * Run the home screen each tick if that is the right state to be in.
 * 
 * @param state the state object
 */
static void run_home(state_t *state)
{
  home_state_t *home_state = state->home_state;
  if (!home_state)
  {
    home_state = home_init();
    state->home_state = home_state;
  }
  state_type_t next_state = home_main(home_state);
  if (sdl_is_done((void *)home_state))
  {
    state->home_state = NULL;
    home_free(home_state);
  }
  else if (next_state != HOME)
  {
    state->home_state = NULL;
    state->curr_state = next_state;
    home_free(home_state);
  }
}
#endif

/**
 * Running the settings screen each tick if that is the right state to be in.
 * 
 * @param state the state object
 */
static void run_settings(state_t *state)
{
  settings_state_t *settings_state = state->settings_state;
  if (!settings_state)
  {
    settings_state = settings_init();
    state->settings_state = settings_state;
    settings_state->difficulty_level = (difficulty_type_t)settings_difficulty();
  }
  state_type_t next_state = settings_main(settings_state);
  if ((size_t)settings_state->difficulty_level != settings_difficulty())
  {
    settings_set_difficulty(settings_state->difficulty_level);
  }
  if (sdl_is_done((void *)settings_state))
  {
    state->settings_state = NULL;
    settings_free(settings_state);
  }
  else if (next_state != SETTINGS)
  {
    state->settings_state = NULL;
    state->curr_state = next_state;
    settings_free(settings_state);
  }
}

/**
 * Running the game play each tick if that is the right state to be in.
 * 
 * @param state the state object
 */
static void run_game_play(state_t *state)
{
  game_play_state_t *game_play_state = state->game_play_state;
  if (!game_play_state)
  {
    game_play_state = game_play_init((difficulty_type_t)settings_difficulty());
    state->game_play_state = game_play_state;
  }
  state_type_t next_state = game_play_main(game_play_state);
  if (sdl_is_done((void *)game_play_state))
  {
    state->game_play_state = NULL;
    game_play_free(game_play_state);
  }
  else if (next_state != GAME_PLAY)
  {
    if (next_state == GAME_OVER)
    {
      record_run(state, (size_t)game_play_get_distance(game_play_state));
    }
    state->game_play_state = NULL;
    state->curr_state = next_state;
    game_play_free(game_play_state);
  }
}

/**
 * Running the game over screen each tick if that is the right state to be in.
 * 
 * @param state the state object
 */
static void run_game_over(state_t *state)
{
  game_over_state_t *game_over_state = state->game_over_state;
  if (!game_over_state)
  {
    game_over_state = game_over_init(state->last_distance, state->best_distance,
                                     state->new_best);
    state->game_over_state = game_over_state;
  }
  state_type_t next_state = game_over_main(game_over_state);
  if (sdl_is_done((void *)game_over_state))
  {
    state->game_over_state = NULL;
    game_over_free(game_over_state);
  }
  else if (next_state != GAME_OVER)
  {
    state->game_over_state = NULL;
    state->curr_state = next_state;
    game_over_free(game_over_state);
  }
}

state_t *emscripten_init()
{
  state_t *state = malloc(sizeof(state_t));
  assert(state);
  state->curr_state = HOME;
  state->difficulty_level = EASY;
  state->last_distance = 0;
  state->best_distance = 0;
  state->best_loaded = false;
  state->new_best = false;
  state->home_state = NULL;
  state->settings_state = NULL;
  state->game_play_state = NULL;
  state->game_over_state = NULL;
  return state;
}

bool emscripten_main(state_t *state)
{
  switch (state->curr_state)
  {
    case HOME:
    {
#ifdef __EMSCRIPTEN__
      // the web page is the menu: hand over to it and wait
      state->curr_state = WEB_MENU;
      EM_ASM(if (window.techrideShowMenu) window.techrideShowMenu(););
#else
      run_home(state);
#endif
      break;
    }
    case WEB_MENU:
    {
      break; // nothing to draw; the HTML menu is showing
    }
    case SETTINGS:
    {
      run_settings(state);
      break;
    }
    case GAME_PLAY:
    {
      run_game_play(state);
      break;
    }
    case GAME_OVER:
    {
      run_game_over(state);
      break;
    }
    case EXIT:
    {
      return true;
    }
    default:
    {
      fprintf(stderr, "%s\n", ERROR_MESSAGE_STATE);
      exit(1);
    }
  }
  return false;
}

void emscripten_free(state_t *state)
{
  if (state->home_state != NULL)
  {
    home_free(state->home_state);
  }
  if (state->settings_state != NULL)
  {
    settings_free(state->settings_state);
  }
  if (state->game_play_state != NULL)
  {
    game_play_free(state->game_play_state);
  }
  if (state->game_over_state != NULL)
  {
    game_over_free(state->game_over_state);
  }
  free(state);
}
/*
 * Web page bridge: functions the HTML menu calls through Module.ccall.
 * The global game state lives in library/emscripten.c.
 */
extern state_t *state;

/**
 * Ends whatever screen is running (without saving a run).
 *
 * @param state the state object
 */
static void close_screens(state_t *state)
{
  if (state->home_state)
  {
    home_free(state->home_state);
    state->home_state = NULL;
  }
  if (state->settings_state)
  {
    settings_free(state->settings_state);
    state->settings_state = NULL;
  }
  if (state->game_play_state)
  {
    game_play_free(state->game_play_state);
    state->game_play_state = NULL;
  }
  if (state->game_over_state)
  {
    game_over_free(state->game_over_state);
    state->game_over_state = NULL;
  }
}

WEB_EXPORT void web_play()
{
  if (state == NULL || state->curr_state == GAME_PLAY)
  {
    return;
  }
  close_screens(state);
  state->curr_state = GAME_PLAY;
}

WEB_EXPORT void web_menu()
{
  if (state == NULL)
  {
    return;
  }
  close_screens(state);
  state->curr_state = WEB_MENU;
}

WEB_EXPORT int web_saves_ready()
{
  return leaderboard_ready();
}

WEB_EXPORT int web_character_count()
{
  return (int)character_count();
}

WEB_EXPORT int web_character_selected()
{
  return (int)character_selected_index();
}

WEB_EXPORT void web_character_select(int index)
{
  character_select((size_t)index);
}

WEB_EXPORT int web_difficulty()
{
  return (int)settings_difficulty();
}

WEB_EXPORT void web_set_difficulty(int level)
{
  settings_set_difficulty((size_t)level);
}

WEB_EXPORT int web_background()
{
  return (int)settings_background();
}

WEB_EXPORT void web_set_background(int index)
{
  settings_set_background((size_t)index);
}

WEB_EXPORT void web_set_particles(int on)
{
  settings_set_particles(on != 0);
}

WEB_EXPORT void web_set_player_name(const char *name)
{
  settings_set_player_name(name);
}

WEB_EXPORT int web_cosmetic()
{
  return (int)cosmetics_selected();
}

WEB_EXPORT void web_set_cosmetic(int index)
{
  cosmetics_select((size_t)index);
}

WEB_EXPORT const char *web_stats()
{
  static char buf[512];
  if (state == NULL || state->game_play_state == NULL)
  {
    snprintf(buf, sizeof(buf), "{\"playing\":0}");
    return buf;
  }
  game_play_stats(state->game_play_state, buf, sizeof(buf));
  return buf;
}

#ifdef GAME_TEST
WEB_EXPORT void web_test_powerup(int type)
{
  if (state && state->game_play_state)
  {
    game_play_test_powerup(state->game_play_state, (powerup_type_t)type);
  }
}

WEB_EXPORT const char *web_test_probe()
{
  static char buf[160];
  snprintf(buf, sizeof(buf), "{\"alive\":0}");
  if (state && state->game_play_state)
  {
    game_play_test_probe(state->game_play_state, buf, sizeof(buf));
  }
  return buf;
}

WEB_EXPORT void web_test_spawn(int kind)
{
  if (state && state->game_play_state)
  {
    game_play_test_spawn(state->game_play_state, kind);
  }
}
#endif

WEB_EXPORT void web_set_debug_hitboxes(int on)
{
  settings_set_debug_hitboxes(on != 0);
}
