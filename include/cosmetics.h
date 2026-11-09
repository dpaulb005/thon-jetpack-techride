#ifndef __COSMETICS_H__
#define __COSMETICS_H__

#include <stddef.h>

#include "manifest.h"
#include "sdl_wrapper.h"

/**
 * Accessories (hats, glasses, cape, ...) drawn on top of an animated runner.
 * They are separate layers placed from the animation's head anchor and never
 * affect collisions. Index 0 is "none".
 */

/**
 * @return number of choices, including "none"
 */
size_t cosmetics_count();

/**
 * @param index a choice
 * @return its display name
 */
const char *cosmetics_name(size_t index);

/**
 * @return the chosen accessory (0 = none)
 */
size_t cosmetics_selected();

/**
 * @param index accessory to wear (saved)
 */
void cosmetics_select(size_t index);

/**
 * Draws the chosen accessory on the runner.
 *
 * @param anim the runner's current animation (needs a head anchor)
 * @param box where the runner's frame is drawn
 * @param angle the runner's tilt in degrees
 * @param behind true for the pass drawn before the runner (capes), false after
 */
void cosmetics_render(const anim_t *anim, SDL_FRect box, double angle, bool behind);

#endif // #ifndef __COSMETICS_H__
