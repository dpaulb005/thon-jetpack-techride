#include <stdio.h>
#include <string.h>
#include <stdlib.h>

#include "manifest.h"
#include "constants.h"

#define MAX_ANIMS 128

static anim_t anims[MAX_ANIMS];
static size_t num_anims = 0;
static bool loaded = false;
static char frame_path[256];

/**
 * Reads the manifest the first time an animation is looked up.
 */
static void load()
{
  loaded = true;
  FILE *file = fopen(MANIFEST_PATH, "r");
  if (!file)
  {
    return;
  }
  char line[640];
  char id[48];
  while (num_anims < MAX_ANIMS && fgets(line, sizeof(line), file))
  {
    anim_t a;
    int frames, size;
    char anchor[16], loop[8];
    if (sscanf(line, "anim %47s %159s %d %lf %d %15s %7s", a.id, a.folder, &frames,
               &a.fps, &size, anchor, loop) == 7 && frames > 0 && a.fps > 0)
    {
      a.frames = (size_t)frames;
      a.loop = strcmp(loop, "loop") == 0;
      a.has_anchor = false;
      memset(a.hull_count, 0, sizeof(a.hull_count));
      anims[num_anims++] = a;
      continue;
    }
    int frame, used;
    if (sscanf(line, "hull %47s %d%n", id, &frame, &used) == 2 && frame >= 0 &&
        frame < MAX_ANIM_FRAMES)
    {
      for (size_t i = 0; i < num_anims; i++)
      {
        if (strcmp(anims[i].id, id) != 0)
        {
          continue;
        }
        const char *p = line + used;
        float x, y;
        int n = 0, step;
        while (n < MAX_HULL_POINTS && sscanf(p, "%f %f%n", &x, &y, &step) == 2)
        {
          anims[i].hull[frame][n][0] = x;
          anims[i].hull[frame][n][1] = y;
          n++;
          p += step;
        }
        anims[i].hull_count[frame] = (unsigned char)n;
      }
      continue;
    }
    double hx, top, height;
    if (sscanf(line, "anchor %47s %lf %lf %lf", id, &hx, &top, &height) == 4)
    {
      for (size_t i = 0; i < num_anims; i++)
      {
        if (strcmp(anims[i].id, id) == 0)
        {
          anims[i].has_anchor = true;
          anims[i].head_x = hx;
          anims[i].head_top = top;
          anims[i].height = height;
        }
      }
    }
  }
  fclose(file);
}

const anim_t *anim_get(const char *id)
{
  if (!loaded)
  {
    load();
  }
  for (size_t i = 0; i < num_anims; i++)
  {
    if (strcmp(anims[i].id, id) == 0)
    {
      return &anims[i];
    }
  }
  return NULL;
}

size_t anim_frame_at(const anim_t *anim, double time)
{
  size_t frame = time > 0 ? (size_t)(time * anim->fps) : 0;
  if (anim->loop)
  {
    return frame % anim->frames;
  }
  return frame < anim->frames ? frame : anim->frames - 1;
}

void anim_blend_at(const anim_t *anim, double time, size_t *frame, size_t *next, double *fade)
{
  double pos = time > 0 ? time * anim->fps : 0;
  size_t whole = (size_t)pos;
  double part = pos - whole;
  *frame = anim_frame_at(anim, time);
  if (anim->loop)
  {
    *next = (*frame + 1) % anim->frames;
  }
  else
  {
    *next = *frame + 1 < anim->frames ? *frame + 1 : *frame;
  }
  double held = 0.55; // share of each frame shown crisp, before the fade starts
  *fade = *next == *frame || part <= held ? 0 : (part - held) / (1 - held);
}

double anim_duration(const anim_t *anim)
{
  return anim->frames / anim->fps;
}

const char *anim_frame_path(const anim_t *anim, size_t frame)
{
  snprintf(frame_path, sizeof(frame_path), "%s%s%02zu.png", TECHRIDE_DIR, anim->folder,
           frame % anim->frames);
  return frame_path;
}

const float (*anim_hull(const anim_t *anim, size_t frame, size_t *count))[2]
{
  frame %= anim->frames;
  *count = frame < MAX_ANIM_FRAMES ? anim->hull_count[frame] : 0;
  return *count ? anim->hull[frame] : NULL;
}
