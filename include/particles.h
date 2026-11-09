#ifndef __PARTICLES_H__
#define __PARTICLES_H__

#include <stddef.h>

/**
 * A small pool of short-lived colored squares used for jetpack exhaust,
 * can sparkles and confetti. Positions are in window pixels (y down).
 */

/**
 * Removes every particle (call when switching screens).
 */
void particles_clear();

/**
 * Spawns one particle.
 *
 * @param x start x
 * @param y start y
 * @param vx horizontal speed (pixels/second)
 * @param vy vertical speed (pixels/second, positive = down)
 * @param life seconds before it disappears
 * @param size side length in pixels
 * @param color index into the THON palette (wraps)
 * @param gravity downward acceleration (pixels/second^2)
 */
void particles_emit(double x, double y, double vx, double vy, double life,
                    double size, size_t color, double gravity);

/**
 * Spawns `count` particles flying out from a point in every direction.
 *
 * @param x center x
 * @param y center y
 * @param count how many
 * @param speed maximum speed (pixels/second)
 */
void particles_burst(double x, double y, size_t count, double speed);

/**
 * Keeps confetti drifting down from the top of the screen.
 *
 * @param dt seconds since the last frame
 * @param rate pieces per second
 */
void particles_confetti(double dt, double rate);

/**
 * Moves particles and ages them.
 *
 * @param dt seconds since the last frame
 */
void particles_update(double dt);

/**
 * Draws all live particles, fading them out as they age.
 */
void particles_render();

#endif // #ifndef __PARTICLES_H__
