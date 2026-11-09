#ifndef __LEADERBOARD_H__
#define __LEADERBOARD_H__

#include <stdbool.h>
#include <stddef.h>

/**
 * Top-10 distances with player names, saved between sessions
 * (leaderboard.txt next to the .exe; browser storage on the web).
 */

/**
 * @return false while saved data is still loading (web only); the board
 *         should be treated as empty until this returns true
 */
bool leaderboard_ready();

/**
 * @return the number of entries on the board (0 to LEADERBOARD_SIZE)
 */
size_t leaderboard_count();

/**
 * @param i the rank, starting at 0
 * @return the player name at that rank
 */
const char *leaderboard_name(size_t i);

/**
 * @param i the rank, starting at 0
 * @return the distance in meters at that rank
 */
size_t leaderboard_distance(size_t i);

/**
 * @param distance meters traveled in a run
 * @return whether that run would make the board
 */
bool leaderboard_qualifies(size_t distance);

/**
 * Adds a run to the board (keeping only the top LEADERBOARD_SIZE) and saves.
 *
 * @param name the player's name
 * @param distance meters traveled
 * @return the 1-based rank the run landed at, or 0 if it didn't make it
 */
size_t leaderboard_add(const char *name, size_t distance);

/**
 * Reads a single saved number (e.g. the best distance) from the save folder.
 *
 * @param filename the file name inside the save folder
 * @return the number, or 0 if missing
 */
size_t save_read_number(const char *filename);

/**
 * Writes a single number to the save folder and persists it.
 *
 * @param filename the file name inside the save folder
 * @param value the number to save
 */
void save_write_number(const char *filename, size_t value);

#endif // #ifndef __LEADERBOARD_H__
