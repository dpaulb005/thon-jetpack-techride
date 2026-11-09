#include <stdio.h>
#include <string.h>

#include "game_settings.h"
#include "constants.h"
#include "leaderboard.h"

static size_t background = 0;
static size_t difficulty = 0;
static bool particles = true;
static bool debug_hitboxes = false;
static char player_name[16] = "";
static bool loaded = false;

/**
 * Reads saved choices the first time they're needed (once saves are ready).
 */
static void load()
{
  if (loaded || !leaderboard_ready())
  {
    return;
  }
  loaded = true;
  size_t saved = save_read_number(BACKGROUND_SAVE_FILENAME);
  background = saved < NUM_BACKGROUNDS ? saved : 0;
  saved = save_read_number(DIFFICULTY_SAVE_FILENAME);
  difficulty = saved <= 2 ? saved : 0;
}

const char *settings_background_path()
{
  load();
  return BACKGROUND_PATHS[background];
}

size_t settings_background()
{
  load();
  return background;
}

void settings_set_background(size_t index)
{
  load();
  background = index < NUM_BACKGROUNDS ? index : 0;
  save_write_number(BACKGROUND_SAVE_FILENAME, background);
}

size_t settings_difficulty()
{
  load();
  return difficulty;
}

void settings_set_difficulty(size_t level)
{
  load();
  difficulty = level <= 2 ? level : 0;
  save_write_number(DIFFICULTY_SAVE_FILENAME, difficulty);
}

bool settings_particles()
{
  return particles;
}

void settings_set_particles(bool on)
{
  particles = on;
}

const char *settings_player_name()
{
  return player_name;
}

void settings_set_player_name(const char *name)
{
  // keep only what the game font can draw: letters, digits, space, period
  size_t n = 0;
  for (const char *c = name; *c && n < NAME_MAX_LEN; c++)
  {
    char ch = *c >= 'a' && *c <= 'z' ? *c - 'a' + 'A' : *c;
    if ((ch >= 'A' && ch <= 'Z') || (ch >= '0' && ch <= '9') || ch == ' ' || ch == '.')
    {
      player_name[n++] = ch;
    }
  }
  player_name[n] = '\0';
}

bool settings_debug_hitboxes()
{
  return debug_hitboxes;
}

void settings_set_debug_hitboxes(bool on)
{
  debug_hitboxes = on;
}
