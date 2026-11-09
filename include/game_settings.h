#ifndef __GAME_SETTINGS_H__
#define __GAME_SETTINGS_H__

#include <stdbool.h>
#include <stddef.h>

/**
 * Player preferences that aren't tied to one screen. Saved with the other
 * save data (see leaderboard.h) and loaded once saves are available.
 */

/**
 * @return the asset path of the chosen gameplay background
 */
const char *settings_background_path();

/**
 * @return index of the chosen background in BACKGROUND_PATHS
 */
size_t settings_background();

/**
 * @param index which background to use (saved)
 */
void settings_set_background(size_t index);

/**
 * @return the saved difficulty (0 easy, 1 medium, 2 hard)
 */
size_t settings_difficulty();

/**
 * @param level 0 easy, 1 medium, 2 hard (saved)
 */
void settings_set_difficulty(size_t level);

/**
 * @return whether particle effects are drawn
 */
bool settings_particles();

/**
 * @param on whether to draw particle effects
 */
void settings_set_particles(bool on);

/**
 * @return the name pre-filled on the top 10 entry ("" for none)
 */
const char *settings_player_name();

/**
 * @param name name to pre-fill on the top 10 entry
 */
void settings_set_player_name(const char *name);

/**
 * @return whether collision outlines are drawn (testing aid)
 */
bool settings_debug_hitboxes();

/**
 * @param on whether to draw collision outlines
 */
void settings_set_debug_hitboxes(bool on);

#endif // #ifndef __GAME_SETTINGS_H__
