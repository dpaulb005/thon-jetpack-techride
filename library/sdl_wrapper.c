#include <string.h>
#include "sdl_wrapper.h"
#include "asset_cache.h"
#include "game_play.h"
#include "constants.h"
#include <SDL2/SDL.h>
#include <SDL2/SDL_image.h>
#include <assert.h>
#include <math.h>
#include <stdlib.h>
#include <time.h>

/**
 * The coordinate at the center of the screen.
 */
vector_t center;
/**
 * The coordinate difference from the center to the top right corner.
 */
vector_t max_diff;
/**
 * The SDL window where the scene is rendered.
 */
SDL_Window *window;
/**
 * The renderer used to draw the scene.
 */
SDL_Renderer *renderer;
/**
 * The font of the text to display.
 */
TTF_Font *font;
/**
 * The keypress handler, or NULL if none has been configured.
 */
key_handler_t key_handler = NULL;
/**
 * The keypress handler, or NULL if none has been configured.
 */
mouse_handler_t mouse_handler = NULL;
/**
 * SDL's timestamp when a key was last pressed or released.
 * Used to mesasure how long a key has been held.
 */
uint32_t key_start_timestamp;
/**
 * The performance counter value when time_since_last_tick() was last called.
 * Initially 0.
 */
uint64_t last_counter = 0;
/**
 * Set when a menu screen sees the window close event, so sdl_is_done()
 * can still report it.
 */
bool quit_requested = false;
/**
 * Last known mouse position, for button hover effects.
 */
static int mouse_x = -1, mouse_y = -1;
/**
 * When the current screen started, for its fade-in.
 */
static Uint32 fade_start_ms = 0;
/**
 * Name-entry state: when text_buffer is set, typed characters go into it.
 */
static char *text_buffer = NULL;
static size_t text_max_len = 0;
static bool text_submitted = false;

void sdl_text_input_start(char *buffer, size_t max_len)
{
  text_buffer = buffer;
  text_max_len = max_len;
  text_submitted = false;
  SDL_StartTextInput();
}

void sdl_text_input_stop(void)
{
  text_buffer = NULL;
  SDL_StopTextInput();
}

bool sdl_text_input_take_submit(void)
{
  bool submitted = text_submitted;
  text_submitted = false;
  return submitted;
}

/**
 * Feeds typing into the active name buffer.
 *
 * @param event the event to look at
 * @return true if the event was used for text input
 */
static bool handle_text_event(SDL_Event *event)
{
  if (text_buffer == NULL)
  {
    return false;
  }
  if (event->type == SDL_TEXTINPUT)
  {
    size_t len = strlen(text_buffer);
    for (const char *c = event->text.text; *c && len < text_max_len; c++)
    {
      char ch = *c;
      if (ch >= 'a' && ch <= 'z')
      {
        ch = ch - 'a' + 'A';
      }
      // the game font only has letters, digits, space and period
      bool allowed = (ch >= 'A' && ch <= 'Z') || (ch >= '0' && ch <= '9') ||
                     ch == ' ' || ch == '.';
      if (allowed && !(ch == ' ' && len == 0))
      {
        text_buffer[len++] = ch;
        text_buffer[len] = '\0';
      }
    }
    return true;
  }
  if (event->type == SDL_KEYDOWN)
  {
    SDL_Keycode key = event->key.keysym.sym;
    size_t len = strlen(text_buffer);
    if (key == SDLK_BACKSPACE && len > 0)
    {
      text_buffer[len - 1] = '\0';
    }
    else if (key == SDLK_RETURN || key == SDLK_KP_ENTER)
    {
      text_submitted = true;
    }
    return true;
  }
  return event->type == SDL_KEYUP;
}

/**
 * Computes the center of the window in pixel coordinates
 * 
 * @return the center of the window in pixel coordinates as a vector_t
 */
static vector_t get_window_center(void)
{
  // the scene maps onto the fixed playfield (the renderer's logical size and
  // viewport handle the real window size and the status bar above it)
  return (vector_t){.x = WINDOW_WIDTH / 2.0, .y = WINDOW_HEIGHT / 2.0};
}

/**
 * Computes the scaling factor between scene coordinates and pixel coordinates.
 * The scene is scaled by the same factor in the x and y dimensions,
 * chosen to maximize the size of the scene while keeping it in the window.
 * 
 * @param window_center the center of the window in pixel coordinates
 * @return the scaling factor
 */
static double get_scene_scale(vector_t window_center)
{
  // Scale scene so it fits entirely in the window
  double x_scale = window_center.x / max_diff.x,
         y_scale = window_center.y / max_diff.y;
  return x_scale < y_scale ? x_scale : y_scale;
}

/**
 * Maps a scene coordinate to a window coordinate
 * 
 * @param scene_pos the scene coordinate
 * @param window_center the center of the window in pixel coordinates
 * @return the window coordinate as a vector_t
 */
static vector_t get_window_position(vector_t scene_pos, vector_t window_center)
{
  // Scale scene coordinates by the scaling factor
  // and map the center of the scene to the center of the window
  vector_t scene_center_offset = vec_subtract(scene_pos, center);
  double scale = get_scene_scale(window_center);
  vector_t pixel_center_offset = vec_multiply(scale, scene_center_offset);
  vector_t pixel = {.x = round(window_center.x + pixel_center_offset.x),
                    // Flip y axis since positive y is down on the screen
                    .y = round(window_center.y - pixel_center_offset.y)};
  return pixel;
}

/**
 * Converts an SDL key code to a char.
 * 7-bit ASCII characters are just returned
 * and arrow keys are given special character codes.
 * 
 * @param key the SDL key code
 * @return the corresponding char
 */
char get_keycode(SDL_Keycode key)
{
  switch (key)
  {
    case SDLK_LEFT:
      return LEFT_ARROW;
    case SDLK_UP:
      return UP_ARROW;
    case SDLK_RIGHT:
      return RIGHT_ARROW;
    case SDLK_DOWN:
      return DOWN_ARROW;
    case SDLK_SPACE:
      return SPACE_BAR;
    default:
      // Only process 7-bit ASCII characters
      return key == (SDL_Keycode)(char)key ? key : '\0';
  }
}

/**
 * Converts an SDL mouse button code to a corresponding char representing the
 * button. `SDL_BUTTON_LEFT` is mapped to `MOUSE_LEFT`, `SDL_BUTTON_RIGHT` is
 * mapped to `MOUSE_RIGHT`, and other button codes are ignored (returning '\0').
 * 
 * @param button the SDL mouse button code
 * @return the corresponding char
 */
char get_mousecode(Uint8 button)
{
  switch (button)
  {
    case SDL_BUTTON_LEFT:
      return MOUSE_LEFT;
    case SDL_BUTTON_RIGHT:
      return MOUSE_RIGHT;
    default:
      return '\0';
  }
}

void sdl_init(vector_t min, vector_t max)
{
  // Check parameters
  assert(min.x < max.x);
  assert(min.y < max.y);
  center = vec_multiply(0.5, vec_add(min, max));
  max_diff = vec_subtract(max, center);
  // every screen calls sdl_init; reuse the window instead of opening another,
  // and fade the new screen in so changes aren't a hard cut
  fade_start_ms = SDL_GetTicks();
  sdl_top_bar_clear();
  if (window != NULL)
  {
    return;
  }
  // web: only take keys when the game canvas has focus, so the page's
  // menus and text boxes keep working
  SDL_SetHint(SDL_HINT_EMSCRIPTEN_KEYBOARD_ELEMENT, "#canvas");
  // smooth (not blocky) scaling for every texture
  SDL_SetHint(SDL_HINT_RENDER_SCALE_QUALITY, "linear");
  SDL_Init(SDL_INIT_VIDEO | SDL_INIT_TIMER | SDL_INIT_EVENTS);
  window = SDL_CreateWindow(WINDOW_TITLE, SDL_WINDOWPOS_CENTERED,
                            SDL_WINDOWPOS_CENTERED, WINDOW_WIDTH,
                            WINDOW_HEIGHT + TOP_BAR_HEIGHT,
                            SDL_WINDOW_RESIZABLE | SDL_WINDOW_ALLOW_HIGHDPI);
  renderer = SDL_CreateRenderer(window, -1,
                                SDL_RENDERER_ACCELERATED | SDL_RENDERER_PRESENTVSYNC);
  // keep the 1000x500 game layout when the window is resized or maximized
  SDL_RenderSetLogicalSize(renderer, WINDOW_WIDTH, WINDOW_HEIGHT + TOP_BAR_HEIGHT);
  TTF_Init(); // keeps the status bar's fonts valid across screens
}

bool sdl_is_done(void *state)
{
  if (quit_requested)
  {
    return true;
  }
  SDL_Event *event = malloc(sizeof(*event));
  assert(event != NULL);
  while (SDL_PollEvent(event))
  {
    if (event->type == SDL_MOUSEMOTION)
    {
      mouse_x = event->motion.x;
      mouse_y = event->motion.y; // SDL already maps to the playfield viewport
    }
    if (handle_text_event(event))
    {
      continue;
    }
    switch (event->type)
    {
      case SDL_QUIT:
        free(event);
        return true;
      case SDL_KEYDOWN:
      case SDL_KEYUP:
        // Skip the keypress if no handler is configured
        // or an unrecognized key was pressed
        if (key_handler == NULL)
          break;
        char key = get_keycode(event->key.keysym.sym);
        if (key == '\0')
          break;
        uint32_t timestamp = event->key.timestamp;
        if (!event->key.repeat)
        {
          key_start_timestamp = timestamp;
        }
        key_event_type_t type =
            event->type == SDL_KEYDOWN ? KEY_PRESSED : KEY_RELEASED;
        double held_time = (timestamp - key_start_timestamp) / MS_PER_S;
        key_handler(key, type, held_time, state);
        break;
    }
  }
  free(event);
  return false;
}

void handle_mouse_events(void *state)
{
  SDL_Event event;
  char button_code;
  while (SDL_PollEvent(&event))
  {
    if (event.type == SDL_MOUSEMOTION)
    {
      mouse_x = event.motion.x;
      mouse_y = event.motion.y; // SDL already maps to the playfield viewport
    }
    if (handle_text_event(&event))
    {
      continue;
    }
    switch (event.type)
    {
      case SDL_QUIT:
        quit_requested = true;
        break;
      case SDL_MOUSEBUTTONDOWN:
        button_code = get_mousecode(event.button.button);
        if (button_code != '\0' && mouse_handler != NULL)
        {
          mouse_handler(button_code, state, event);
        }
        break;
      default:
        break;
    }
  }
}

void sdl_fill_rect_f(SDL_FRect rect, Uint8 r, Uint8 g, Uint8 b, Uint8 a)
{
  SDL_SetRenderDrawBlendMode(renderer, SDL_BLENDMODE_BLEND);
  SDL_SetRenderDrawColor(renderer, r, g, b, a);
  SDL_RenderFillRectF(renderer, &rect);
}

void sdl_fill_rect(SDL_Rect rect, Uint8 r, Uint8 g, Uint8 b, Uint8 a)
{
  SDL_SetRenderDrawBlendMode(renderer, SDL_BLENDMODE_BLEND);
  SDL_SetRenderDrawColor(renderer, r, g, b, a);
  SDL_RenderFillRect(renderer, &rect);
}

/**
 * What the status bar above the playfield shows: a power-up when one is
 * active, otherwise the game title.
 */
static struct
{
  bool active;
  const char *name;
  const char *description;
  rgb_color_t color;
  SDL_Texture *icon;
  double progress;
} top_bar = {.active = false};
static TTF_Font *bar_title_font = NULL;
static TTF_Font *bar_text_font = NULL;

void sdl_top_bar_set(const char *name, const char *description, rgb_color_t color,
                     SDL_Texture *icon, double progress)
{
  top_bar.active = true;
  top_bar.name = name;
  top_bar.description = description;
  top_bar.color = color;
  top_bar.icon = icon;
  top_bar.progress = progress;
}

void sdl_top_bar_clear(void)
{
  top_bar.active = false;
}

/**
 * Draws text with its top-left corner at (x, y).
 *
 * @return the text's width
 */
static int bar_text(const char *text, TTF_Font *font, rgb_color_t color, int x, int y)
{
  SDL_Rect box = {x, y, 0, 0};
  TTF_SizeText(font, text, &box.w, &box.h);
  render_text(text, font, color, box);
  return box.w;
}

/**
 * Draws the status bar across the top of the window, outside the playfield.
 */
static void render_top_bar(void)
{
  if (bar_title_font == NULL)
  {
    bar_title_font = init_font(FONT_PATH, 34);
    bar_text_font = init_font(ACHIEVEMENTS_FONT_PATH, 18);
  }
  SDL_Rect bar = {0, 0, WINDOW_WIDTH, TOP_BAR_HEIGHT};
  SDL_RenderSetViewport(renderer, &bar);
  sdl_fill_rect(bar, 14, 10, 44, 255);
  rgb_color_t gold = {245, 197, 24};
  rgb_color_t white = {255, 255, 255};
  if (!top_bar.active)
  {
    sdl_fill_rect((SDL_Rect){0, TOP_BAR_HEIGHT - 3, WINDOW_WIDTH, 3}, 54, 36, 148, 255);
    int x = 24 + bar_text("THON JETPACK ", bar_title_font, white, 24, 12);
    bar_text("TECHRIDE", bar_title_font, gold, x, 12);
    int w;
    TTF_SizeText(bar_text_font, "FOR THE KIDS", &w, NULL);
    bar_text("FOR THE KIDS", bar_text_font, (rgb_color_t){140, 170, 255},
             WINDOW_WIDTH - w - 24, 22);
  }
  else
  {
    rgb_color_t c = top_bar.color;
    sdl_fill_rect((SDL_Rect){0, TOP_BAR_HEIGHT - 4, WINDOW_WIDTH, 4}, c.r, c.g, c.b, 255);
    render_copy(top_bar.icon, (SDL_Rect){16, 7, 48, 48});
    int x = 76 + bar_text(top_bar.name, bar_title_font, c, 76, 4) + 18;
    bar_text(top_bar.description, bar_text_font, white, 78, 38);
    // time left
    SDL_Rect track = {WINDOW_WIDTH - 260, 24, 230, 14};
    if (x > track.x - 10)
    {
      track.x = x;
      track.w = WINDOW_WIDTH - 30 - x;
    }
    sdl_fill_rect(track, 40, 36, 80, 255);
    double p = top_bar.progress < 0 ? 0 : top_bar.progress;
    if (p > 0)
    {
      sdl_fill_rect((SDL_Rect){track.x, track.y, (int)(track.w * p), track.h},
                    c.r, c.g, c.b, 255);
    }
  }
  SDL_Rect field = {0, TOP_BAR_HEIGHT, WINDOW_WIDTH, WINDOW_HEIGHT};
  SDL_RenderSetViewport(renderer, &field);
}

void sdl_clear(void)
{
  SDL_RenderSetViewport(renderer, NULL);
  SDL_SetRenderDrawColor(renderer, 255, 255, 255, 255);
  SDL_RenderClear(renderer);
  // everything the screens draw goes in the playfield under the status bar
  SDL_Rect field = {0, TOP_BAR_HEIGHT, WINDOW_WIDTH, WINDOW_HEIGHT};
  SDL_RenderSetViewport(renderer, &field);
}

void sdl_destroy(void)
{
  SDL_DestroyRenderer(renderer);
  SDL_DestroyWindow(window);
}

SDL_Texture *get_texture(const char *IMG_PATH)
{
  return IMG_LoadTexture(renderer, IMG_PATH);
}

void render_copy(SDL_Texture *img, SDL_Rect texr)
{
  SDL_RenderCopy(renderer, img, NULL, &texr);
}

void render_copy_rotated(SDL_Texture *img, SDL_Rect texr, double angle)
{
  if (angle == 0)
  {
    SDL_RenderCopy(renderer, img, NULL, &texr);
    return;
  }
  SDL_RenderCopyEx(renderer, img, NULL, &texr, angle, NULL, SDL_FLIP_NONE);
}

void render_copy_f(SDL_Texture *img, SDL_FRect box, double angle, Uint8 alpha)
{
  SDL_SetTextureAlphaMod(img, alpha);
  SDL_RenderCopyExF(renderer, img, NULL, &box, angle, NULL, SDL_FLIP_NONE);
  SDL_SetTextureAlphaMod(img, 255);
}

void render_blend_f(SDL_Texture *a, SDL_Texture *b, double k, SDL_FRect box, double angle)
{
  if (b == NULL || b == a || k <= 0)
  {
    SDL_RenderCopyExF(renderer, a, NULL, &box, angle, NULL, SDL_FLIP_NONE);
    return;
  }
  // both frames are fully visible at the midpoint, so nothing goes see-through
  render_copy_f(a, box, angle, (Uint8)(255 * fmin(1, 2 * (1 - k))));
  render_copy_f(b, box, angle, (Uint8)(255 * fmin(1, 2 * k)));
}

void render_copy_alpha(SDL_Texture *img, SDL_Rect texr, double angle, Uint8 alpha)
{
  SDL_SetTextureAlphaMod(img, alpha);
  render_copy_rotated(img, texr, angle);
  SDL_SetTextureAlphaMod(img, 255);
}

SDL_Rect grow_rect(SDL_Rect rect, double factor)
{
  int dw = (int)(rect.w * (factor - 1) / 2);
  int dh = (int)(rect.h * (factor - 1) / 2);
  return (SDL_Rect){rect.x - dw, rect.y - dh, rect.w + 2 * dw, rect.h + 2 * dh};
}

bool sdl_mouse_in(SDL_Rect rect)
{
  return mouse_x >= rect.x && mouse_x <= rect.x + rect.w &&
         mouse_y >= rect.y && mouse_y <= rect.y + rect.h;
}

#define MAX_HI_FONTS 24
#define MAX_FONT_LINKS 64
/**
 * Text is measured with the normal font but drawn from a twin at
 * TEXT_RENDER_SCALE times the size, so it stays sharp on sharp screens.
 */
static struct
{
  char path[96];
  size_t size;
  TTF_Font *hi;
} hi_fonts[MAX_HI_FONTS];
static size_t num_hi_fonts = 0;
static struct
{
  TTF_Font *base;
  TTF_Font *hi;
} font_links[MAX_FONT_LINKS];
static size_t next_font_link = 0;

static TTF_Font *hi_font_for(const char *path, size_t size)
{
  for (size_t i = 0; i < num_hi_fonts; i++)
  {
    if (hi_fonts[i].size == size && strcmp(hi_fonts[i].path, path) == 0)
    {
      return hi_fonts[i].hi;
    }
  }
  TTF_Font *hi = TTF_OpenFont(path, (int)(size * TEXT_RENDER_SCALE));
  if (hi != NULL && num_hi_fonts < MAX_HI_FONTS)
  {
    snprintf(hi_fonts[num_hi_fonts].path, sizeof(hi_fonts[0].path), "%s", path);
    hi_fonts[num_hi_fonts].size = size;
    hi_fonts[num_hi_fonts++].hi = hi;
  }
  return hi;
}

TTF_Font *init_font(const char *FONT_PATH, size_t size)
{
  TTF_Init();
  font = TTF_OpenFont(FONT_PATH, size);
  assert(font != NULL);
  TTF_Font *hi = hi_font_for(FONT_PATH, size);
  // a closed font's address can be reused, so a newer link replaces an older one
  for (size_t i = 0; i < MAX_FONT_LINKS; i++)
  {
    if (font_links[i].base == font)
    {
      font_links[i].base = NULL;
    }
  }
  font_links[next_font_link].base = font;
  font_links[next_font_link].hi = hi;
  next_font_link = (next_font_link + 1) % MAX_FONT_LINKS;
  return font;
}

SDL_Rect make_texr(int x, int y, int w, int h)
{
  SDL_Rect texr;
  texr.x = x;
  texr.y = y;
  texr.w = w;
  texr.h = h;
  return texr;
}

static double runner_sprite = 112;

void sdl_set_runner_sprite(double size)
{
  runner_sprite = size;
}

double sdl_runner_sprite(void)
{
  return runner_sprite;
}

static SDL_FRect make_frect(double x, double y, double w, double h)
{
  return (SDL_FRect){(float)x, (float)y, (float)w, (float)h};
}

SDL_FRect find_bounding_box_f(body_t *body)
{
  double min_x = __DBL_MAX__;
  double max_x = -__DBL_MAX__;
  double min_y = __DBL_MAX__;
  double max_y = -__DBL_MAX__;

  vector_t window_center = get_window_center();

  list_t *points = body_get_shape(body);
  size_t num_vertices = list_size(points);
  for (size_t i = 0; i < num_vertices; i++)
  {
    vector_t *vertex = list_get(points, i);
    vector_t pixel = get_window_position(*vertex, window_center);
    if (pixel.x < min_x)
    {
      min_x = pixel.x;
    }
    if (pixel.x > max_x)
    {
      max_x = pixel.x;
    }
    if (pixel.y < min_y)
    {
      min_y = pixel.y;
    }
    if (pixel.y > max_y)
    {
      max_y = pixel.y;
    }
  }

  list_free(points);
  double bw = max_x - min_x, bh = max_y - min_y, cx = (min_x + max_x) / 2;
  switch (get_type(body))
  {
    case USER:
    {
      // sprite centered on the oval, standing on its bottom (feet on the floor)
      return make_frect(cx - runner_sprite / 2, max_y - runner_sprite + USER_FOOT_OFFSET,
                       runner_sprite, runner_sprite);
    }
    // hazards collide on their dangerous part; draw the full picture around it
    case ZAPPER:
      return make_frect(cx - ZAPPER_WIDTH / 2, (min_y + max_y) / 2 - ZAPPER_HEIGHT / 2,
                       ZAPPER_WIDTH, ZAPPER_HEIGHT);
    case DRONE:
      return make_frect(cx - DRONE_WIDTH / 2, (min_y + max_y) / 2 - DRONE_HEIGHT / 2,
                       DRONE_WIDTH, DRONE_HEIGHT);
    case MINE:
      return make_frect(cx - MINE_SIZE / 2, (min_y + max_y) / 2 - MINE_SIZE / 2,
                       MINE_SIZE, MINE_SIZE);
    case SPIKES:
      return make_frect(cx - SPIKES_WIDTH / 2, max_y - SPIKES_HEIGHT, SPIKES_WIDTH,
                       SPIKES_HEIGHT);
    case DUAL_LASER:
      return make_frect(cx - DUAL_LASER_W / 2, (min_y + max_y) / 2 - DUAL_LASER_H / 2,
                       DUAL_LASER_W, DUAL_LASER_H);
    case MOVING_LASER:
      return make_frect(cx - MOVING_LASER_W / 2, (min_y + max_y) / 2 - MOVING_LASER_H / 2,
                       MOVING_LASER_W, MOVING_LASER_H);
    case ROTATING_LASER:
      // a fixed square around the hub; the picture is rotated to match
      return make_frect(cx - ROTATING_LASER_DRAW / 2,
                       (min_y + max_y) / 2 - ROTATING_LASER_DRAW / 2, ROTATING_LASER_DRAW,
                       ROTATING_LASER_DRAW);
    case HOMING_ROCKET:
      return make_frect(min_x - 14, (min_y + max_y) / 2 - HOMING_H / 2, HOMING_W, HOMING_H);
    case CRATE:
      return make_frect(cx - CRATE_SIZE / 2, max_y - CRATE_SIZE + 4, CRATE_SIZE, CRATE_SIZE);
    case FALLING:
      // chain above, block at the bottom (the block is what hits)
      return make_frect(cx - FALLING_W / 2, max_y - FALLING_H + 6, FALLING_W, FALLING_H);
    case ROCKET:
      // the person is at the front (left); the flame trails behind
      return make_frect(min_x - 4, (min_y + max_y) / 2 - ROCKET_HEIGHT / 2, ROCKET_WIDTH,
                       ROCKET_HEIGHT);
    default:
      break;
  }
  (void)bw;
  (void)bh;

  if (get_type(body) == LASER || get_type(body) == LASER_ACTIVE)
  {
    return make_frect(min_x, (max_y - (max_y - min_y)) - LASER_Y_OFFSET,
                      (max_x - min_x), (max_y - min_y) + LASER_H_OFFSET);
  }

  return make_frect(min_x, (max_y - (max_y - min_y)), (max_x - min_x), (max_y - min_y));
}

SDL_Rect find_bounding_box(body_t *body)
{
  SDL_FRect r = find_bounding_box_f(body);
  return make_texr((int)r.x, (int)r.y, (int)r.w, (int)r.h);
}

void render_text(const char *text, TTF_Font *fontin, rgb_color_t rgb_color,
                 SDL_Rect texr)
{
  SDL_Color color = {rgb_color.r, rgb_color.g, rgb_color.b};
  // blended = antialiased, so text stays smooth when scaled
  SDL_Color blended_color = {color.r, color.g, color.b, 255};
  TTF_Font *draw_font = fontin;
  for (size_t i = 0; i < MAX_FONT_LINKS; i++)
  {
    if (font_links[i].base == fontin && font_links[i].hi != NULL)
    {
      draw_font = font_links[i].hi;
    }
  }
  SDL_Surface *surface = TTF_RenderText_Blended(draw_font, text, blended_color);
  SDL_Texture *texture = SDL_CreateTextureFromSurface(renderer, surface);
  render_copy(texture, texr);
  SDL_FreeSurface(surface);
  SDL_DestroyTexture(texture);
}

void sdl_draw_polygon(polygon_t *poly, rgb_color_t color)
{
  list_t *points = polygon_get_points(poly);
  // Check parameters
  size_t n = list_size(points);
  assert(n >= 3);
  assert(0 <= color.r && color.r <= 1);
  assert(0 <= color.g && color.g <= 1);
  assert(0 <= color.b && color.b <= 1);
  vector_t window_center = get_window_center();
  // Convert each vertex to a point on screen
  SDL_Color fill = {color.r * 255, color.g * 255, color.b * 255, 255};
  SDL_Vertex *vertices = malloc(sizeof(*vertices) * n);
  int *indices = malloc(sizeof(*indices) * 3 * (n - 2));
  assert(vertices != NULL);
  assert(indices != NULL);
  for (size_t i = 0; i < n; i++)
  {
    vector_t *vertex = list_get(points, i);
    vector_t pixel = get_window_position(*vertex, window_center);
    vertices[i] = (SDL_Vertex){{pixel.x, pixel.y}, fill, {0, 0}};
  }
  // body shapes are convex, so a triangle fan from vertex 0 fills them
  for (size_t i = 0; i < n - 2; i++)
  {
    indices[3 * i] = 0;
    indices[3 * i + 1] = i + 1;
    indices[3 * i + 2] = i + 2;
  }

  // Draw polygon with the given color
  SDL_RenderGeometry(renderer, NULL, vertices, n, indices, 3 * (n - 2));
  free(vertices);
  free(indices);
}

void sdl_show(void)
{
  // Draw boundary lines
  vector_t window_center = get_window_center();
  vector_t max = vec_add(center, max_diff),
           min = vec_subtract(center, max_diff);
  vector_t max_pixel = get_window_position(max, window_center),
           min_pixel = get_window_position(min, window_center);
  SDL_Rect *boundary = malloc(sizeof(*boundary));
  assert(boundary != NULL);
  boundary->x = min_pixel.x;
  boundary->y = max_pixel.y;
  boundary->w = max_pixel.x - min_pixel.x;
  boundary->h = min_pixel.y - max_pixel.y;
  SDL_SetRenderDrawColor(renderer, 0, 0, 0, 255);
  SDL_RenderDrawRect(renderer, boundary);
  free(boundary);
  render_top_bar();
  double fade = (SDL_GetTicks() - fade_start_ms) / (MS_PER_S * SCREEN_FADE_SECONDS);
  if (fade < 1)
  {
    sdl_fill_rect((SDL_Rect){0, 0, WINDOW_WIDTH, WINDOW_HEIGHT}, 0, 0, 0,
                  (Uint8)(255 * (1 - fade)));
  }
  SDL_RenderPresent(renderer);
}

void sdl_render_scene(scene_t *scene, void *aux)
{
  sdl_clear();
  size_t body_count = scene_bodies(scene);
  for (size_t i = 0; i < body_count; i++)
  {
    body_t *body = scene_get_body(scene, i);
    list_t *shape = body_get_shape(body);
    polygon_t *poly = polygon_init(shape, (vector_t){0, 0}, 0, 0, 0, 0);
    sdl_draw_polygon(poly, *body_get_color(body));
    list_free(shape);
  }
  if (aux != NULL)
  {
    body_t *body = aux;
    sdl_draw_polygon(body_get_polygon(body), *body_get_color(body));
  }
  sdl_show();
}

void sdl_on_key(key_handler_t handler) { key_handler = handler; }

void sdl_on_mouse(mouse_handler_t handler_mouse)
{
  mouse_handler = handler_mouse;
}

double time_since_last_tick(void)
{
  // wall-clock time (clock() measures CPU time on macOS/Linux)
  uint64_t now = SDL_GetPerformanceCounter();
  double difference = last_counter
                          ? (double)(now - last_counter) / SDL_GetPerformanceFrequency()
                          : 0.0; // return 0 the first time this is called
  last_counter = now;
  // avoid huge physics steps after the window was dragged or the tab hidden
  return difference > MAX_TICK_SECONDS ? MAX_TICK_SECONDS : difference;
}

void sdl_draw_outline(body_t *body, rgb_color_t color)
{
  list_t *points = body_get_shape(body);
  size_t n = list_size(points);
  vector_t window_center = get_window_center();
  SDL_Point *pts = malloc(sizeof(SDL_Point) * (n + 1));
  assert(pts != NULL);
  for (size_t i = 0; i <= n; i++)
  {
    vector_t pixel = get_window_position(*(vector_t *)list_get(points, i % n), window_center);
    pts[i] = (SDL_Point){(int)pixel.x, (int)pixel.y};
  }
  SDL_SetRenderDrawColor(renderer, color.r, color.g, color.b, 255);
  SDL_RenderDrawLines(renderer, pts, (int)n + 1);
  free(pts);
  list_free(points);
}
