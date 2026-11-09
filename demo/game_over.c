#include <assert.h>
#include <state.h>
#include <stdio.h>
#include <stdlib.h>

#include "game_over.h"
#include "asset.h"
#include "asset_helper.h"
#include "constants.h"
#include "asset_cache.h"
#include "sdl_wrapper.h"
#include "particles.h"
#include "character.h"
#include "leaderboard.h"
#include "game_settings.h"

static void finish_name_entry(game_over_state_t *game_over_state);

/**
 * Handler for going back to the home screen.
 *
 * @param game_over_state The game over state
 */
static void menu(game_over_state_t *game_over_state)
{
  finish_name_entry(game_over_state);
  game_over_state->curr_state = HOME;
}

/**
 * Handler for starting a new run straight away.
 *
 * @param game_over_state The game over state
 */
static void play_again(game_over_state_t *game_over_state)
{
  finish_name_entry(game_over_state);
  game_over_state->curr_state = GAME_PLAY;
}

static background_info_t background_templates[] = 
{
  {.bg_path = "assets/theme/game_over.png",
    .bg_box = (SDL_Rect){0, 0, 1000, 500}
  }
};

// a new best swaps in a background without the mascot, so the
// celebration animation can play in its place
static background_info_t new_best_background_templates[] =
{
  {.bg_path = "assets/theme/new_best.png",
    .bg_box = (SDL_Rect){0, 0, 1000, 500}
  }
};

static text_info_t text_templates[] = {
  {.font_path = "assets/NewAthleticM54.ttf",
    .text_box = (SDL_Rect){64, 112, 150, 50},
    .text_color = (rgb_color_t){245, 197, 24},
    .text = ""}
};

static button_info_t button_templates[] = {
  {.image_path = "assets/theme/button.png",
    .font_path = "assets/NewAthleticM54.ttf",
    .image_box = (SDL_Rect){60, 320, 280, 90},
    .text_box = (SDL_Rect){0, 0, 0, 0},
    .text_color = (rgb_color_t){255, 255, 255},
    .text = "Menu",
    .handler = (void *)menu},
  {.image_path = "assets/theme/button.png",
    .font_path = "assets/NewAthleticM54.ttf",
    .image_box = (SDL_Rect){360, 320, 280, 90},
    .text_box = (SDL_Rect){0, 0, 0, 0},
    .text_color = (rgb_color_t){255, 255, 255},
    .text = "Play Again",
    .handler = (void *)play_again}
};

/**
 * Plays the celebration animation on the right side of the screen, sized to
 * CELEBRATION_HEIGHT and keeping the frames' aspect ratio.
 *
 * @param game_over_state the game over state
 */
static void render_celebration(game_over_state_t *game_over_state)
{
  size_t count = celebration_frame_count();
  if (count == 0)
  {
    return;
  }
  // the clip was shot at 30 fps; 12 fps made it look choppy
  size_t frame = animation_frame_at_time(count, game_over_state->time * 2);
  SDL_Texture *texture = asset_cache_obj_get_or_create(ASSET_IMAGE,
                                                       celebration_frame(frame));
  int w, h;
  SDL_QueryTexture(texture, NULL, NULL, &w, &h);
  int box_w = h > 0 ? CELEBRATION_HEIGHT * w / h : CELEBRATION_HEIGHT;
  render_copy(texture, (SDL_Rect){CELEBRATION_RIGHT - box_w, CELEBRATION_TOP,
                                  box_w, CELEBRATION_HEIGHT});
}

/**
 * Shows the run's distance and the best distance under the title.
 *
 * @param game_over_state the game over state
 */
static void render_score(game_over_state_t *game_over_state)
{
  SDL_Rect box = SCORE_BOX;
  TTF_SizeText(game_over_state->score_font, game_over_state->score_text,
               &box.w, &box.h);
  render_text(game_over_state->score_text, game_over_state->score_font, WHITE, box);
}

/**
 * Saves the typed name (or a default) to the top 10, if a name was being
 * entered. Safe to call more than once.
 *
 * @param game_over_state the game over state
 */
static void finish_name_entry(game_over_state_t *game_over_state)
{
  if (!game_over_state->entering_name)
  {
    return;
  }
  game_over_state->entering_name = false;
  sdl_text_input_stop();
  const char *name = game_over_state->name[0] ? game_over_state->name
                                              : DEFAULT_PLAYER_NAME;
  game_over_state->saved_rank = leaderboard_add(name, game_over_state->distance);
}

/**
 * Outlines a rectangle with a 2px border.
 */
static void outline_rect(SDL_Rect r, Uint8 cr, Uint8 cg, Uint8 cb)
{
  sdl_fill_rect((SDL_Rect){r.x, r.y, r.w, 2}, cr, cg, cb, 255);
  sdl_fill_rect((SDL_Rect){r.x, r.y + r.h - 2, r.w, 2}, cr, cg, cb, 255);
  sdl_fill_rect((SDL_Rect){r.x, r.y, 2, r.h}, cr, cg, cb, 255);
  sdl_fill_rect((SDL_Rect){r.x + r.w - 2, r.y, 2, r.h}, cr, cg, cb, 255);
}

/**
 * Draws a line of text with its top-left corner at (x, y).
 *
 * @return the rendered width
 */
static int draw_text(const char *text, TTF_Font *font, rgb_color_t color,
                     int x, int y)
{
  SDL_Rect box = {x, y, 0, 0};
  TTF_SizeText(font, text, &box.w, &box.h);
  render_text(text, font, color, box);
  return box.w;
}

/**
 * The "TOP 10! NAME: [____]" row, or the rank once saved.
 *
 * @param game_over_state the game over state
 */
static void render_name_entry(game_over_state_t *game_over_state)
{
  if (game_over_state->entering_name && sdl_text_input_take_submit())
  {
    finish_name_entry(game_over_state);
  }
  TTF_Font *font = game_over_state->score_font;
  if (game_over_state->entering_name)
  {
    int x = 64 + draw_text("TOP 10   NAME", font, GOLD, 64, NAME_ROW_Y) + 14;
    SDL_Rect box = {x, NAME_ROW_Y - 4, NAME_BOX_WIDTH, 40};
    sdl_fill_rect(box, 8, 6, 26, 220);
    outline_rect(box, 245, 197, 24);
    char shown[24];
    bool caret = ((int)(game_over_state->time * 2)) % 2 == 0;
    snprintf(shown, sizeof(shown), "%s%s", game_over_state->name, caret ? "_" : " ");
    draw_text(shown, font, WHITE, box.x + 10, NAME_ROW_Y);
    draw_text("type, then ENTER", game_over_state->hint_font,
              (rgb_color_t){140, 170, 255}, box.x + box.w + 12, NAME_ROW_Y + 8);
  }
  else if (game_over_state->saved_rank > 0)
  {
    char text[48];
    snprintf(text, sizeof(text), "RANK %zu ON THE TOP 10", game_over_state->saved_rank);
    draw_text(text, font, GOLD, 64, NAME_ROW_Y);
  }
}

game_over_state_t *game_over_init(size_t distance, size_t best_distance,
                                  bool new_best)
{
  game_over_state_t *game_over_state = malloc(sizeof(game_over_state_t));
  assert(game_over_state);
  TTF_Init();
  sdl_on_mouse(on_mouse);
  sdl_on_key(NULL); // the gameplay key handler's state is gone
  sdl_init(MIN, MAX);
  asset_cache_init();
  size_t num_backgrounds = sizeof(background_templates) / 
                          sizeof(background_templates[0]);
  // the clip plays on every end screen; a new best adds a confetti burst
  bool celebrate = celebration_frame_count() > 0;
  text_templates[0].text = new_best ? NEW_BEST_TEXT : GAME_OVER_TEXT;
  size_t num_text = sizeof(text_templates) / sizeof(text_templates[0]);
  size_t num_buttons = sizeof(button_templates) / sizeof(button_templates[0]);
  game_over_state->screen_state = screen_init(game_over_state->screen_state,
                                              celebrate
                                                ? new_best_background_templates
                                                : background_templates,
                                              text_templates, button_templates,
                                              num_backgrounds, num_text, num_buttons);
  game_over_state->time = 0;
  particles_clear();
  if (new_best)
  {
    for (int i = 0; i < 6; i++)
    {
      particles_burst(560 + i * 80, 120 + (i % 2) * 120, 30, 380);
    }
  }
  game_over_state->curr_state = GAME_OVER;
  game_over_state->show_clip = celebrate;
  game_over_state->score_font = init_font(FONT_PATH, SCORE_FONT_SIZE);
  game_over_state->hint_font = init_font(ACHIEVEMENTS_FONT_PATH, 18);
  game_over_state->distance = distance;
  snprintf(game_over_state->name, sizeof(game_over_state->name), "%s",
           settings_player_name());
  game_over_state->saved_rank = 0;
  game_over_state->entering_name = leaderboard_qualifies(distance);
  if (game_over_state->entering_name)
  {
    sdl_text_input_start(game_over_state->name, NAME_MAX_LEN);
  }
  snprintf(game_over_state->score_text, sizeof(game_over_state->score_text),
           "%zu M   BEST %zu M", distance, best_distance);
  return game_over_state;
}

state_type_t game_over_main(game_over_state_t *game_over_state)
{
  sdl_clear();
  double dt = time_since_last_tick();
  game_over_state->time += dt;
  render_items(game_over_state->screen_state);
  particles_confetti(dt, 10);
  particles_update(dt);
  particles_render();
  render_score(game_over_state);
  render_name_entry(game_over_state);
  if (game_over_state->show_clip)
  {
    render_celebration(game_over_state);
  }
  else
  {
    character_render_floating(860, 300, 240, game_over_state->time, -18);
  }
  handle_mouse_events(game_over_state);
  sdl_show();
  return game_over_state->curr_state;
}

void game_over_free(game_over_state_t *game_over_state)
{
  screen_free(game_over_state->screen_state);
  if (game_over_state->entering_name)
  {
    sdl_text_input_stop();
  }
  TTF_CloseFont(game_over_state->score_font);
  TTF_CloseFont(game_over_state->hint_font);
  asset_cache_destroy();
  free(game_over_state);
  TTF_Quit();
}
