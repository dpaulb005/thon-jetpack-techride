#include <assert.h>
#include <state.h>
#include <stdio.h>
#include <stdlib.h>

#include "home.h"
#include "asset.h"
#include "asset_helper.h"
#include "constants.h"
#include "asset_cache.h"
#include "sdl_wrapper.h"
#include "particles.h"
#include "character.h"
#include "leaderboard.h"

/**
 * Handler for entering settings page.
 * 
 * @param home_state the home state when entering settings
 */
static void settings(home_state_t *home_state)
{
  home_state->curr_state = SETTINGS;
}

/**
 * Handler for entering game play.
 * 
 * @param home_state the home state when entering game play
 */
static void play(home_state_t *home_state)
{
  home_state->curr_state = GAME_PLAY;
}

static background_info_t background_templates[] =
{
  {.bg_path = "assets/theme/home.png",
    .bg_box = (SDL_Rect){0, 0, 1000, 500}}
};

static text_info_t text_templates[] = {
  {.font_path = "assets/NewAthleticM54.ttf",
    .text_box = (SDL_Rect){56, 124, 150, 50},
    .text_color = (rgb_color_t){255, 255, 255},
    .text = "Jetpack"},
  {.font_path = "assets/NewAthleticM54.ttf",
    .text_box = (SDL_Rect){56, 170, 150, 50},
    .text_color = (rgb_color_t){245, 197, 24},
    .text = "TECHride"}
};

static button_info_t button_templates[] = {
  {.image_path = "assets/theme/button.png",
    .font_path = "assets/NewAthleticM54.ttf",
    .image_box = (SDL_Rect){50, 355, 260, 90},
    .text_box = (SDL_Rect){0, 0, 0, 0},
    .text_color = (rgb_color_t){255, 255, 255},
    .text = "Settings",
    .handler = (void *)settings},
  {.image_path = "assets/theme/button.png",
    .font_path = "assets/NewAthleticM54.ttf",
    .image_box = (SDL_Rect){320, 355, 260, 90},
    .text_box = (SDL_Rect){0, 0, 0, 0},
    .text_color = (rgb_color_t){255, 255, 255},
    .text = "Play",
    .handler = (void *)play}
};

/**
 * Draws the top 10 into the panel on the right of the home art.
 *
 * @param home_state the home state
 */
static void render_leaderboard(home_state_t *home_state)
{
  TTF_Font *font = home_state->leaderboard_font;
  size_t count = leaderboard_ready() ? leaderboard_count() : 0;
  if (count == 0)
  {
    const char *empty = "No runs yet - be the first!";
    SDL_Rect box = {LEADERBOARD_LEFT, LEADERBOARD_TOP, 0, 0};
    TTF_SizeText(font, empty, &box.w, &box.h);
    render_text(empty, font, (rgb_color_t){140, 170, 255}, box);
    return;
  }
  for (size_t i = 0; i < count; i++)
  {
    int y = LEADERBOARD_TOP + (int)i * LEADERBOARD_ROW_HEIGHT;
    rgb_color_t color = i == 0 ? GOLD : WHITE;
    char left[40];
    snprintf(left, sizeof(left), "%zu.  %s", i + 1, leaderboard_name(i));
    SDL_Rect box = {LEADERBOARD_LEFT, y, 0, 0};
    TTF_SizeText(font, left, &box.w, &box.h);
    render_text(left, font, color, box);
    char right[24];
    snprintf(right, sizeof(right), "%zu M", leaderboard_distance(i));
    TTF_SizeText(font, right, &box.w, &box.h);
    box.x = LEADERBOARD_RIGHT - box.w;
    render_text(right, font, color, box);
  }
}

home_state_t *home_init()
{
  home_state_t *home_state = malloc(sizeof(home_state_t));
  assert(home_state);
  TTF_Init();
  sdl_on_mouse(on_mouse);
  sdl_on_key(NULL); // the gameplay key handler's state is gone
  sdl_init(MIN, MAX);
  asset_cache_init();
  size_t num_backgrounds = sizeof(background_templates) / 
                            sizeof(background_templates[0]);
  size_t num_text = sizeof(text_templates) / sizeof(text_templates[0]);
  size_t num_buttons = sizeof(button_templates) / sizeof(button_templates[0]);
  home_state->screen_state = screen_init(home_state->screen_state, background_templates,
                                         text_templates, button_templates,
                                         num_backgrounds, num_text, num_buttons);
  home_state->leaderboard_font = init_font(ACHIEVEMENTS_FONT_PATH,
                                           LEADERBOARD_FONT_SIZE);
  home_state->time = ZERO;
  particles_clear();
  home_state->curr_state = HOME;
  return home_state;
}

state_type_t home_main(home_state_t *home_state)
{
  sdl_clear();
  double dt = time_since_last_tick();
  home_state->time += dt;
  render_items(home_state->screen_state);
  character_render_floating(470, 222, 240, home_state->time, 6);
  particles_confetti(dt, 10);
  particles_update(dt);
  particles_render();
  render_leaderboard(home_state);
  handle_mouse_events(home_state);
  sdl_show();
  return home_state->curr_state;
}

void home_free(home_state_t *home_state)
{
  screen_free(home_state->screen_state);
  TTF_CloseFont(home_state->leaderboard_font);
  asset_cache_destroy();
  free(home_state);
  TTF_Quit();
}
