#include <assert.h>
#include <state.h>
#include <stdio.h>
#include <stdlib.h>

#include "settings.h"
#include "asset.h"
#include "asset_helper.h"
#include "constants.h"
#include "asset_cache.h"
#include "sdl_wrapper.h"
#include "particles.h"
#include "achievement.h"
#include "character.h"

/**
 * Handler for going back to home screen.
 * 
 * @param settings_state the settings state
 */
static void home(settings_state_t *settings_state)
{
  settings_state->curr_state = HOME;
}

/**
 * Handler for setting the difficulty of the game to easy.
 * 
 * @param settings_state the settings state
 */
static void set_difficulty_easy(settings_state_t *settings_state)
{
  settings_state->difficulty_level = EASY;
}

/**
 * Handler for setting the difficulty of the game to medium.
 * 
 * @param settings_state the settings state
 */
static void set_difficulty_medium(settings_state_t *settings_state)
{
  settings_state->difficulty_level = MEDIUM;
}

/**
 * Handler for setting the difficulty of the game to hard
 * 
 * @param settings_state the settings state
 */
static void set_difficulty_hard(settings_state_t *settings_state)
{
  settings_state->difficulty_level = HARD;
}

static background_info_t background_templates[] = {
  {.bg_path = "assets/theme/settings.png",
    .bg_box = (SDL_Rect){0, 0, 1000, 500}}
};

static text_info_t text_templates[] = {
  {.font_path = "assets/NewAthleticM54.ttf",
    .text_box = (SDL_Rect){625, 50, 150, 50},
    .text_color = (rgb_color_t){255, 255, 255},
    .text = "Settings"},
  {.font_path = "assets/NewAthleticM54.ttf",
    .text_box = (SDL_Rect){50, 325, 150, 50},
    .text_color = (rgb_color_t){255, 255, 255},
    .text = "Difficulty"}
};

static text_info_t achievements_templates[] = {
  {.font_path = "assets/Roboto-Regular.ttf",
    .text_box = (SDL_Rect){525, 125, 150, 50},
    .text_color = (rgb_color_t){255, 255, 255},
    .text = "Achievements"},
  {.font_path = "assets/Roboto-Regular.ttf",
    .text_box = (SDL_Rect){525, 175, 150, 50},
    .text_color = (rgb_color_t){255, 255, 255},
    .text = ""},
  {.font_path = "assets/Roboto-Regular.ttf",
    .text_box = (SDL_Rect){525, 225, 150, 50},
    .text_color = (rgb_color_t){255, 255, 255},
    .text = ""},
  {.font_path = "assets/Roboto-Regular.ttf",
    .text_box = (SDL_Rect){525, 275, 150, 50},
    .text_color = (rgb_color_t){255, 255, 255},
    .text = ""}
};

/**
 * Handler for switching to the next playable character.
 *
 * @param settings_state the settings state
 */
static void next_character(settings_state_t *settings_state)
{
  character_select_next();
}

static button_info_t button_templates[] = {
  {.image_path = "assets/theme/button.png",
    .font_path = "assets/NewAthleticM54.ttf",
    .image_box = (SDL_Rect){100, 140, 300, 100},
    .text_box = (SDL_Rect){170, 165, 150, 50},
    .text_color = (rgb_color_t){255, 255, 255},
    .text = "Character",
    .handler = (void *)next_character},
  {.image_path = "assets/theme/button.png",
    .font_path = "assets/NewAthleticM54.ttf",
    .image_box = (SDL_Rect){100, 25, 300, 100},
    .text_box = (SDL_Rect){200, 50, 150, 50},
    .text_color = (rgb_color_t){255, 255, 255},
    .text = "Home",
    .handler = (void *)home},
  {.image_path = "assets/theme/button.png",
    .font_path = "assets/NewAthleticM54.ttf",
    .image_box = (SDL_Rect){50, 400, 300, 100},
    .text_box = (SDL_Rect){150, 425, 150, 50},
    .text_color = (rgb_color_t){255, 255, 255},
    .text = "Easy",
    .handler = (void *)set_difficulty_easy},
  {.image_path = "assets/theme/button.png",
    .font_path = "assets/NewAthleticM54.ttf",
    .image_box = (SDL_Rect){350, 400, 300, 100},
    .text_box = (SDL_Rect){450, 425, 150, 50},
    .text_color = (rgb_color_t){255, 255, 255},
    .text = "Medium",
    .handler = (void *)set_difficulty_medium},
  {.image_path = "assets/theme/button.png",
    .font_path = "assets/NewAthleticM54.ttf",
    .image_box = (SDL_Rect){650, 400, 300, 100},
    .text_box = (SDL_Rect){750, 425, 150, 50},
    .text_color = (rgb_color_t){255, 255, 255},
    .text = "Hard",
    .handler = (void *)set_difficulty_hard}
};

/**
 * Displays the current difficulty level selected on the screen.
 * 
 * @param settings_state the settings state
 */
static void display_difficulty_level(settings_state_t *settings_state)
{
  char difficulty_text[DIFFICULTY_TEXT_SIZE];
  switch (settings_state->difficulty_level)
  {
    case EASY:
    {
      sprintf(difficulty_text, "%s", EASY_DIFFICULTY_TEXT);
      break;
    }
    case MEDIUM:
    {
      sprintf(difficulty_text, "%s", MEDIUM_DIFFICULTY_TEXT);
      break;
    }
    case HARD:
    {
      sprintf(difficulty_text, "%s", HARD_DIFFICULTY_TEXT);
      break;
    }
    default:
    {
      sprintf(difficulty_text, "%s", UNKNOWN_DIFFICULTY_TEXT);
      break;
    }
  }
  SDL_Rect bounding_box = DIFFICULTY_BOX;
  TTF_Font *font = settings_state->difficulty_font;
  TTF_SizeText(font, difficulty_text, &bounding_box.w, &bounding_box.h);
  render_text(difficulty_text, font, GOLD, bounding_box);
}

/**
 * Displays the selected character's name and a preview of its sprite.
 *
 * @param settings_state the settings state
 */
static void display_character(settings_state_t *settings_state)
{
  char character_text[CHARACTER_TEXT_SIZE];
  snprintf(character_text, sizeof(character_text), "Runner : %s",
           character_selected_name());
  SDL_Rect bounding_box = CHARACTER_NAME_BOX;
  TTF_Font *font = settings_state->achievements_font;
  TTF_SizeText(font, character_text, &bounding_box.w, &bounding_box.h);
  render_text(character_text, font, GOLD, bounding_box);
  SDL_Texture *preview = asset_cache_obj_get_or_create(ASSET_IMAGE,
                                                       character_selected_sprite());
  render_copy(preview, CHARACTER_PREVIEW_BOX);
}

/**
 * Displays the achievements reached by the user over all of their played games.
 * 
 * @param settings_state the settings state
 */
static void display_achievements(settings_state_t *settings_state)
{
  size_t num_achievements = sizeof(achievements_templates) / 
                            sizeof(achievements_templates[0]);
  TTF_Font *font = settings_state->achievements_font;
  for (size_t i = 0; i < num_achievements; i++)
  {
    text_info_t info = achievements_templates[i];
    TTF_SizeText(font, info.text, &info.text_box.w, &info.text_box.h);
    render_text(info.text, font, info.text_color, info.text_box);
  }
}

settings_state_t *settings_init()
{
  settings_state_t *settings_state = malloc(sizeof(settings_state_t));
  assert(settings_state);
  TTF_Init();
  sdl_on_mouse(on_mouse);
  sdl_on_key(NULL); // the gameplay key handler's state is gone
  sdl_init(MIN, MAX);
  asset_cache_init();
  size_t num_backgrounds = sizeof(background_templates) / 
                            sizeof(background_templates[0]);
  size_t num_text = sizeof(text_templates) / sizeof(text_templates[0]);
  size_t num_buttons = sizeof(button_templates) / sizeof(button_templates[0]);
  settings_state->screen_state = screen_init(settings_state->screen_state,
                                             background_templates,
                                             text_templates, button_templates,
                                             num_backgrounds, num_text, num_buttons);
  settings_state->time = ZERO;
  particles_clear();
  settings_state->curr_state = SETTINGS;
  settings_state->difficulty_level = EASY;
  settings_state->difficulty_font = init_font(FONT_PATH, DIFFICULTY_FONT_SIZE);
  settings_state->achievements_font = init_font(ACHIEVEMENTS_FONT_PATH,
                                                 ACHIEVEMENTS_FONT_SIZE);
  list_t *results = read_achievements_settings();
  size_t num_results = list_size(results);
  for (size_t i = 0; i < num_results; i++)
  {
    // + 1 since excluding achievements title
    achievements_templates[i + 1].text = list_get(results, i);
  }
  list_free(results);
  return settings_state;
}

state_type_t settings_main(settings_state_t *settings_state)
{
  sdl_clear();
  double dt = time_since_last_tick();
  settings_state->time += dt;
  render_items(settings_state->screen_state);
  particles_confetti(dt, 6);
  particles_update(dt);
  particles_render();
  display_difficulty_level(settings_state);
  display_character(settings_state);
  display_achievements(settings_state);
  handle_mouse_events(settings_state);
  sdl_show();
  return settings_state->curr_state;
}

void settings_free(settings_state_t *settings_state)
{
  screen_free(settings_state->screen_state);
  TTF_CloseFont(settings_state->difficulty_font);
  TTF_CloseFont(settings_state->achievements_font);
  asset_cache_destroy();
  free(settings_state);
  TTF_Quit();
}
