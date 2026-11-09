#include <math.h>
#include <stdbool.h>
#include <stdio.h>

#include "cosmetics.h"
#include "asset.h"
#include "asset_cache.h"
#include "constants.h"
#include "leaderboard.h"

typedef enum
{
  SLOT_HAT,    // sits on top of the head
  SLOT_EYES,
  SLOT_EARS,
  SLOT_NECK,
  SLOT_BACK,   // drawn behind the runner
  SLOT_WAIST
} slot_t;

typedef struct accessory
{
  const char *name;
  int frame;     // drawing in cosmetics/set (-1 = none)
  slot_t slot;
  double width;  // as a fraction of the character's height
} accessory_t;

// order matches the drawings on the cosmetics sheet
static const accessory_t ACCESSORIES[] = {
  {"None", -1, SLOT_HAT, 0},
  {"THON Headband", 0, SLOT_HAT, 0.55},
  {"Bucket Hat", 1, SLOT_HAT, 0.55},
  {"Sunglasses", 2, SLOT_EYES, 0.42},
  {"Glow Necklace", 3, SLOT_NECK, 0.32},
  {"THON Cape", 4, SLOT_BACK, 0.62},
  {"Headphones", 5, SLOT_EARS, 0.55},
  {"Tutu", 6, SLOT_WAIST, 0.55},
  {"Cowboy Hat", 7, SLOT_HAT, 0.62},
  {"Crown", 8, SLOT_HAT, 0.40},
  {"Cheese Hat", 9, SLOT_HAT, 0.50},
};
static const size_t NUM_ACCESSORIES = sizeof(ACCESSORIES) / sizeof(ACCESSORIES[0]);

static size_t selected = 0;
static bool loaded = false;

static void load()
{
  if (loaded || !leaderboard_ready())
  {
    return;
  }
  loaded = true;
  size_t saved = save_read_number(COSMETIC_SAVE_FILENAME);
  selected = saved < NUM_ACCESSORIES ? saved : 0;
}

size_t cosmetics_count()
{
  return NUM_ACCESSORIES;
}

const char *cosmetics_name(size_t index)
{
  return index < NUM_ACCESSORIES ? ACCESSORIES[index].name : "";
}

size_t cosmetics_selected()
{
  load();
  return selected;
}

void cosmetics_select(size_t index)
{
  load();
  selected = index < NUM_ACCESSORIES ? index : 0;
  save_write_number(COSMETIC_SAVE_FILENAME, selected);
}

void cosmetics_render(const anim_t *anim, SDL_FRect box, double angle, bool behind)
{
  const accessory_t *acc = &ACCESSORIES[cosmetics_selected()];
  const anim_t *set = anim_get("cosmetic.set");
  if (acc->frame < 0 || anim == NULL || !anim->has_anchor || set == NULL ||
      (acc->slot == SLOT_BACK) != behind)
  {
    return;
  }
  SDL_Texture *tex = asset_cache_obj_get_or_create(ASSET_IMAGE,
                                                   anim_frame_path(set, acc->frame));
  int tw, th;
  SDL_QueryTexture(tex, NULL, NULL, &tw, &th);
  double char_h = anim->height * box.h;
  double w = acc->width * char_h;
  double h = tw > 0 ? w * th / tw : w;
  double hx = box.x + anim->head_x * box.w;
  double top = box.y + anim->head_top * box.h;
  double cx = hx, cy;
  switch (acc->slot)
  {
    case SLOT_HAT:
      cy = top + char_h * 0.06 - h * 0.35;
      break;
    case SLOT_EYES:
      cy = top + char_h * 0.22;
      break;
    case SLOT_EARS:
      cy = top + char_h * 0.18;
      break;
    case SLOT_NECK:
      cy = top + char_h * 0.42;
      break;
    case SLOT_BACK:
      cx = hx - char_h * 0.18;
      cy = top + char_h * 0.52;
      break;
    case SLOT_WAIST:
    default:
      cy = top + char_h * 0.68;
      break;
  }
  // rotate the attachment point with the runner's tilt
  double rad = angle * M_PI / 180.0;
  double ox = box.x + box.w / 2.0, oy = box.y + box.h / 2.0;
  double dx = cx - ox, dy = cy - oy;
  cx = ox + dx * cos(rad) - dy * sin(rad);
  cy = oy + dx * sin(rad) + dy * cos(rad);
  render_copy_f(tex, (SDL_FRect){(float)(cx - w / 2), (float)(cy - h / 2), (float)w, (float)h},
                angle, 255);
}
