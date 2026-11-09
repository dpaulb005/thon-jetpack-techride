#include <stdbool.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

#include "character.h"
#include "constants.h"
#include "manifest.h"
#include "leaderboard.h"
#include "asset.h"
#include "asset_cache.h"
#include "sdl_wrapper.h"
#include <math.h>

#define MAX_CHARACTERS 64
#define MAX_NAME_LEN 64
#define MAX_PATH_LEN 256

typedef struct character
{
  char name[MAX_NAME_LEN];
  char sprite_path[MAX_PATH_LEN];
  size_t frame_count;
  char anim_prefix[32]; // "techbot" -> techbot.run / .fly / ... in the manifest
} character_t;

static character_t characters[MAX_CHARACTERS];
static size_t num_characters = 0;
static size_t selected = 0;
static bool loaded = false;
static char frame_path[MAX_PATH_LEN + 32];

/**
 * Removes leading and trailing whitespace in place.
 *
 * @param str the string to trim
 * @return pointer to the first non-whitespace character
 */
static char *trim(char *str)
{
  while (*str == ' ' || *str == '\t')
  {
    str++;
  }
  size_t len = strlen(str);
  while (len > 0 && (str[len - 1] == ' ' || str[len - 1] == '\t' ||
                     str[len - 1] == '\n' || str[len - 1] == '\r'))
  {
    str[--len] = '\0';
  }
  return str;
}

/**
 * Reads the character list file. Falls back to a single default character
 * if the file is missing or has no valid entries.
 */
static void load_characters()
{
  loaded = true;
  FILE *file = fopen(CHARACTER_LIST_PATH, "r");
  char line[MAX_NAME_LEN + MAX_PATH_LEN];
  while (file && num_characters < MAX_CHARACTERS &&
         fgets(line, sizeof(line), file))
  {
    char *entry = trim(line);
    char *sep = strchr(entry, '|');
    if (entry[0] == '#' || !sep)
    {
      continue;
    }
    *sep = '\0';
    char *name = trim(entry);
    char *sprite = trim(sep + 1);
    // optional third field: number of animation frames in a sprite folder
    size_t frame_count = 1;
    char *frames_sep = strchr(sprite, '|');
    if (frames_sep)
    {
      *frames_sep = '\0';
      sprite = trim(sprite);
      int parsed = atoi(trim(frames_sep + 1));
      frame_count = parsed > 1 ? (size_t)parsed : 1;
    }
    if (name[0] == '\0' || sprite[0] == '\0')
    {
      continue;
    }
    character_t *character = &characters[num_characters++];
    snprintf(character->name, MAX_NAME_LEN, "%s", name);
    character->anim_prefix[0] = '\0';
    character->frame_count = frame_count;
    if (sprite[0] == '@')
    {
      // animated sprite set from the asset manifest; its idle frame is the still
      snprintf(character->anim_prefix, sizeof(character->anim_prefix), "%s", sprite + 1);
      character->frame_count = 1;
      char id[64];
      snprintf(id, sizeof(id), "%s.idle", character->anim_prefix);
      const anim_t *idle = anim_get(id);
      snprintf(character->sprite_path, MAX_PATH_LEN, "%s",
               idle ? anim_frame_path(idle, 0) : DEFAULT_CHARACTER_SPRITE);
    }
    else
    {
      snprintf(character->sprite_path, MAX_PATH_LEN, "%s%s", CHARACTER_DIR, sprite);
    }
  }
  if (file)
  {
    fclose(file);
  }
  if (num_characters == 0)
  {
    character_t *character = &characters[num_characters++];
    snprintf(character->name, MAX_NAME_LEN, "%s", DEFAULT_CHARACTER_NAME);
    snprintf(character->sprite_path, MAX_PATH_LEN, "%s%s", CHARACTER_DIR,
             DEFAULT_CHARACTER_SPRITE);
    character->frame_count = 1;
    character->anim_prefix[0] = '\0';
  }
}

static bool selection_loaded = false;

size_t character_count()
{
  if (!loaded)
  {
    load_characters();
  }
  // restore the last runner picked (once saved data is available)
  if (!selection_loaded && leaderboard_ready())
  {
    selection_loaded = true;
    size_t saved = save_read_number(CHARACTER_SAVE_FILENAME);
    selected = saved < num_characters ? saved : 0;
  }
  return num_characters;
}

const anim_t *character_selected_anim(const char *state)
{
  character_count();
  character_t *character = &characters[selected];
  if (character->anim_prefix[0] == '\0')
  {
    return NULL;
  }
  char id[64];
  snprintf(id, sizeof(id), "%s.%s", character->anim_prefix, state);
  return anim_get(id);
}

const char *character_selected_name()
{
  character_count();
  return characters[selected].name;
}

const char *character_selected_sprite()
{
  return character_selected_frame(0);
}

size_t character_selected_frame_count()
{
  character_count();
  return characters[selected].frame_count;
}

const char *character_selected_frame(size_t frame)
{
  character_count();
  character_t *character = &characters[selected];
  if (character->frame_count <= 1)
  {
    return character->sprite_path;
  }
  // animated characters are a folder of frames named 00.png, 01.png, ...
  const char *slash = character->sprite_path[strlen(character->sprite_path) - 1] == '/'
                      ? "" : "/";
  snprintf(frame_path, sizeof(frame_path), "%.240s%s%02zu.png", character->sprite_path,
           slash, frame % character->frame_count);
  return frame_path;
}

size_t animation_frame_at_time(size_t frame_count, double time)
{
  if (frame_count <= 1)
  {
    return 0;
  }
  // ping-pong: 0, 1, ..., n-1, n-2, ..., 1, 0, ...
  size_t period = 2 * (frame_count - 1);
  size_t step = (size_t)(time * CHARACTER_ANIMATION_FPS) % period;
  return step < frame_count ? step : period - step;
}

size_t character_frame_at_time(double time)
{
  return animation_frame_at_time(character_selected_frame_count(), time);
}

static size_t celebration_frames = 0;
static bool celebration_loaded = false;

size_t celebration_frame_count()
{
  if (!celebration_loaded)
  {
    // the file holds a single number: how many frames (00.png, 01.png, ...)
    celebration_loaded = true;
    FILE *file = fopen(CELEBRATION_LIST_PATH, "r");
    char line[MAX_NAME_LEN + MAX_PATH_LEN];
    while (file && fgets(line, sizeof(line), file))
    {
      // only a line that starts with a digit is the count (skips comments,
      // including the tail of any comment longer than the buffer)
      char *entry = trim(line);
      if (entry[0] >= '0' && entry[0] <= '9')
      {
        int parsed = atoi(entry);
        celebration_frames = parsed > 0 ? (size_t)parsed : 0;
        break;
      }
    }
    if (file)
    {
      fclose(file);
    }
  }
  return celebration_frames;
}

const char *celebration_frame(size_t frame)
{
  size_t count = celebration_frame_count();
  snprintf(frame_path, sizeof(frame_path), "%s%02zu.png", CELEBRATION_DIR,
           count ? frame % count : 0);
  return frame_path;
}

void character_render_floating(int center_x, int center_y, int size, double time,
                               double base_angle)
{
  const anim_t *idle = character_selected_anim("idle");
  size_t frame = 0, next = 0;
  double fade = 0;
  SDL_Texture *texture, *fade_to = NULL;
  if (idle)
  {
    anim_blend_at(idle, time, &frame, &next, &fade);
    texture = asset_cache_obj_get_or_create(ASSET_IMAGE, anim_frame_path(idle, frame));
    fade_to = asset_cache_obj_get_or_create(ASSET_IMAGE, anim_frame_path(idle, next));
  }
  else
  {
    texture = asset_cache_obj_get_or_create(ASSET_IMAGE,
        character_selected_frame(character_frame_at_time(time)));
  }
  float bob = (float)(8 * sin(time * 2.2));
  SDL_FRect box = {center_x - size / 2.0f, center_y - size / 2.0f + bob, (float)size, (float)size};
  render_blend_f(texture, fade_to, fade, box, base_angle + 5 * sin(time * 1.6));
}

#define MAX_ROCKETS 64

static char rocket_paths[MAX_ROCKETS][MAX_PATH_LEN];
static size_t num_rockets = 0;
static bool rockets_loaded = false;

const char *rocket_random_sprite()
{
  if (!rockets_loaded)
  {
    rockets_loaded = true;
    FILE *file = fopen(ROCKET_LIST_PATH, "r");
    char line[MAX_PATH_LEN];
    while (file && num_rockets < MAX_ROCKETS && fgets(line, sizeof(line), file))
    {
      char *entry = trim(line);
      if (entry[0] == '#' || entry[0] == '\0')
      {
        continue;
      }
      snprintf(rocket_paths[num_rockets++], MAX_PATH_LEN, "%s%.200s",
               ROCKET_DIR, entry);
    }
    if (file)
    {
      fclose(file);
    }
  }
  if (num_rockets == 0)
  {
    return ROCKET_PATH;
  }
  return rocket_paths[(size_t)rand() % num_rockets];
}

size_t character_selected_index()
{
  character_count();
  return selected;
}

void character_select(size_t index)
{
  if (index < character_count())
  {
    selected = index;
    save_write_number(CHARACTER_SAVE_FILENAME, selected);
  }
}

void character_select_next()
{
  selected = (selected + 1) % character_count();
  save_write_number(CHARACTER_SAVE_FILENAME, selected);
}
