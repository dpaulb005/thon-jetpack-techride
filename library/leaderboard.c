#include <stdio.h>
#include <stdlib.h>
#include <string.h>

#include "leaderboard.h"
#include "constants.h"

#ifdef __EMSCRIPTEN__
#include <emscripten.h>
#endif

#define MAX_LEADERBOARD 32
#define NAME_BUFFER 32
#define SAVE_PATH_LEN 128

typedef struct entry
{
  char name[NAME_BUFFER];
  size_t distance;
} entry_t;

static entry_t entries[MAX_LEADERBOARD];
static size_t num_entries = 0;
static bool loaded = false;

/**
 * Builds the full path of a file in the save folder.
 *
 * @param filename the file name
 * @param out buffer of at least SAVE_PATH_LEN characters
 */
static void save_path(const char *filename, char *out)
{
  snprintf(out, SAVE_PATH_LEN, "%s%s", SAVE_DIR, filename);
}

/**
 * Flushes the save folder to persistent storage (browser storage on the web;
 * a no-op natively, where files are already on disk).
 */
static void persist()
{
#ifdef __EMSCRIPTEN__
  EM_ASM({
    if (Module.saveSyncing) { Module.saveAgain = true; return; }
    Module.saveSyncing = true;
    const done = function(err) {
      if (err) console.error('save failed', err);
      if (Module.saveAgain) { Module.saveAgain = false; FS.syncfs(false, done); }
      else Module.saveSyncing = false;
    };
    FS.syncfs(false, done);
  });
#endif
}

bool leaderboard_ready()
{
#ifdef __EMSCRIPTEN__
  return EM_ASM_INT(return Module.saveReady ? 1 : 0;) == 1;
#else
  return true;
#endif
}

/**
 * Reads the board from disk the first time it is needed.
 */
static void load()
{
  if (loaded || !leaderboard_ready())
  {
    return;
  }
  loaded = true;
  char path[SAVE_PATH_LEN];
  save_path(LEADERBOARD_FILENAME, path);
  FILE *file = fopen(path, "r");
  if (!file)
  {
    return;
  }
  char line[NAME_BUFFER + 32];
  while (num_entries < LEADERBOARD_SIZE && fgets(line, sizeof(line), file))
  {
    char *sep = strrchr(line, '|');
    if (!sep)
    {
      continue;
    }
    *sep = '\0';
    entry_t *entry = &entries[num_entries++];
    snprintf(entry->name, NAME_BUFFER, "%.*s", NAME_BUFFER - 1, line);
    entry->distance = (size_t)strtoul(sep + 1, NULL, 10);
  }
  fclose(file);
}

/**
 * Writes the board to disk.
 */
static void save()
{
  char path[SAVE_PATH_LEN];
  save_path(LEADERBOARD_FILENAME, path);
  FILE *file = fopen(path, "w");
  if (!file)
  {
    return;
  }
  for (size_t i = 0; i < num_entries; i++)
  {
    fprintf(file, "%s|%zu\n", entries[i].name, entries[i].distance);
  }
  fclose(file);
  persist();
}

size_t leaderboard_count()
{
  load();
  return num_entries;
}

const char *leaderboard_name(size_t i)
{
  load();
  return i < num_entries ? entries[i].name : "";
}

size_t leaderboard_distance(size_t i)
{
  load();
  return i < num_entries ? entries[i].distance : 0;
}

bool leaderboard_qualifies(size_t distance)
{
  load();
  if (distance == 0)
  {
    return false;
  }
  return num_entries < LEADERBOARD_SIZE ||
         distance > entries[num_entries - 1].distance;
}

size_t leaderboard_add(const char *name, size_t distance)
{
  if (!leaderboard_qualifies(distance))
  {
    return 0;
  }
  // insertion point: after every entry that is at least as far
  size_t rank = 0;
  while (rank < num_entries && entries[rank].distance >= distance)
  {
    rank++;
  }
  size_t last = num_entries < LEADERBOARD_SIZE ? num_entries : LEADERBOARD_SIZE - 1;
  for (size_t i = last; i > rank; i--)
  {
    entries[i] = entries[i - 1];
  }
  snprintf(entries[rank].name, NAME_BUFFER, "%s", name);
  // '|' separates fields in the save file
  for (char *c = entries[rank].name; *c; c++)
  {
    if (*c == '|')
    {
      *c = ' ';
    }
  }
  entries[rank].distance = distance;
  if (num_entries < LEADERBOARD_SIZE)
  {
    num_entries++;
  }
  save();
  return rank + 1;
}

size_t save_read_number(const char *filename)
{
  char path[SAVE_PATH_LEN];
  save_path(filename, path);
  size_t value = 0;
  FILE *file = fopen(path, "r");
  if (file)
  {
    if (fscanf(file, "%zu", &value) != 1)
    {
      value = 0;
    }
    fclose(file);
  }
  return value;
}

void save_write_number(const char *filename, size_t value)
{
  char path[SAVE_PATH_LEN];
  save_path(filename, path);
  FILE *file = fopen(path, "w");
  if (file)
  {
    fprintf(file, "%zu\n", value);
    fclose(file);
    persist();
  }
}
