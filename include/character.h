#ifndef __CHARACTER_H__
#define __CHARACTER_H__

#include <stddef.h>

#include "manifest.h"

/**
 * Playable characters are configured in assets/characters/characters.txt,
 * one per line as "Name|sprite.png" (lines starting with '#' are comments).
 * Animated characters use "Name|folder/|N", where the folder holds N frames
 * named 00.png, 01.png, ... Sprites are loaded from assets/characters/.
 * The file is read the first time any function here is called.
 */

/**
 * @return the number of configured characters (always at least 1)
 */
size_t character_count();

/**
 * @return the display name of the currently selected character
 */
const char *character_selected_name();

/**
 * @return the asset path of the currently selected character's sprite
 */
const char *character_selected_sprite();

/**
 * @return the number of animation frames of the selected character
 */
size_t character_selected_frame_count();

/**
 * Returns the asset path of one animation frame of the selected character.
 * The returned string is overwritten by the next call.
 *
 * @param frame the frame index (wraps around)
 * @return the asset path of that frame
 */
const char *character_selected_frame(size_t frame);

/**
 * @param time seconds since the animation started
 * @return the frame index to show at that time (plays forward then back)
 */
size_t character_frame_at_time(double time);

/**
 * Frame to show for a looping animation that plays forward then back.
 *
 * @param frame_count number of frames in the animation
 * @param time seconds since the animation started
 * @return the frame index
 */
size_t animation_frame_at_time(size_t frame_count, double time);

/**
 * @return the number of frames in the "new best" celebration animation
 *         (0 if none is configured)
 */
size_t celebration_frame_count();

/**
 * Returns the asset path of one celebration frame. The returned string is
 * overwritten by the next call.
 *
 * @param frame the frame index (wraps around)
 * @return the asset path of that frame
 */
const char *celebration_frame(size_t frame);

/**
 * Draws the selected runner floating gently (menus).
 *
 * @param center_x center of the sprite
 * @param center_y center of the sprite
 * @param size sprite width/height in pixels
 * @param time seconds since the screen opened
 * @param base_angle resting tilt in degrees
 */
void character_render_floating(int center_x, int center_y, int size, double time,
                               double base_angle);

/**
 * Picks the sprite for a new rocket at random from
 * assets/rockets/rockets.txt (falls back to the paper airplane).
 *
 * @return the asset path of the chosen rocket sprite
 */
const char *rocket_random_sprite();

/**
 * @param state "run", "fly", "idle", "jump", "land" or "celebrate"
 * @return that animation for the selected character, or NULL if the
 *         character is a single photo/clip rather than an animated set
 */
const anim_t *character_selected_anim(const char *state);

/**
 * @return index of the selected character in characters.txt order
 */
size_t character_selected_index();

/**
 * Selects a character by index (saved).
 *
 * @param index position in characters.txt (ignored if out of range)
 */
void character_select(size_t index);

/**
 * Selects the next character in the list, wrapping around at the end.
 */
void character_select_next();

#endif // #ifndef __CHARACTER_H__
