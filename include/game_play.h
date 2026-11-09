#ifndef __GAME_PLAY_H__
#define __GAME_PLAY_H__

#include "math.h"
#include "sdl_wrapper.h"
#include "game_play_helper.h"
#include <stdbool.h>
#include <stdio.h>
#include <stdlib.h>

typedef struct game_play_state game_play_state_t;

typedef struct zapper_state zapper_state_t;

typedef struct laser_state laser_state_t;

typedef struct rocket_state rocket_state_t;

typedef struct coin_state coin_state_t;

typedef struct powerup_state powerup_state_t;

/**
 * Initializes sdl as well as the variables needed
 * Creates and stores all necessary variables for the game in a created state
 * variable
 * 
 * @param difficulty_level associated with the game
 * @return pointer to a game_play_state_t object
 */
game_play_state_t *game_play_init(difficulty_type_t difficulty_level);

/**
 * Called on each tick of the program
 * Updates the state variables and display as necessary, depending on the time
 * that has passed.
 *
 * @param game_play_state the current state of the game
 * @return the current state type
 */
state_type_t game_play_main(game_play_state_t *game_play_state);

/**
 * @param game_play_state the current state of the game
 * @return the distance traveled so far, in meters
 */
double game_play_get_distance(game_play_state_t *game_play_state);

/**
 * Frees anything allocated in the game
 * Should free everything in state as well as state itself.
 *
 * @param game_play_state pointer to a game_play state object
 */
void game_play_free(game_play_state_t *game_play_state);

/**
 * Writes a one-line JSON summary of the run (for the web page and tests).
 *
 * @param game_play_state the current state of the game
 * @param buf output buffer
 * @param size size of buf
 */
void game_play_stats(game_play_state_t *game_play_state, char *buf, size_t size);

#ifdef GAME_TEST
/**
 * Test builds only: start a power-up immediately.
 *
 * @param game_play_state the current state of the game
 * @param type which power-up
 */
void game_play_test_powerup(game_play_state_t *game_play_state, powerup_type_t type);

/**
 * Test builds only: put a hazard just ahead of the runner at its height.
 *
 * @param game_play_state the current state of the game
 * @param kind 0 zapper, 1 drone, 2 mine, 3 spikes, 4 rocket
 */
void game_play_test_spawn(game_play_state_t *game_play_state, int kind);

/**
 * Test builds only: position/rotation of the last test-spawned hazard.
 */
void game_play_test_probe(game_play_state_t *game_play_state, char *buf, size_t size);
#endif

#endif // #ifndef __GAME_PLAY_H__