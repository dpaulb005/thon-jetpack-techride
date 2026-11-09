#include <math.h>
#include <stdbool.h>
#include <stdlib.h>

#include "particles.h"
#include "constants.h"
#include "sdl_wrapper.h"
#include "game_settings.h"

#define MAX_PARTICLES 400

typedef struct particle
{
  bool alive;
  double x, y, vx, vy;
  double age, life;
  double size;
  double gravity;
  double spin; // sway phase for confetti
  size_t color;
} particle_t;

static particle_t particles[MAX_PARTICLES];
static size_t next_slot = 0;

// THON gold, sky blue, white, indigo, pink, bright blue
static const Uint8 PALETTE[][3] = {
  {245, 197, 24}, {140, 170, 255}, {255, 255, 255},
  {90, 72, 210}, {230, 90, 160}, {79, 107, 255}
};
static const size_t PALETTE_SIZE = sizeof(PALETTE) / sizeof(PALETTE[0]);

/**
 * @return a random number between lo and hi
 */
static double rand_range(double lo, double hi)
{
  return lo + (hi - lo) * ((double)rand() / RAND_MAX);
}

void particles_clear()
{
  for (size_t i = 0; i < MAX_PARTICLES; i++)
  {
    particles[i].alive = false;
  }
}

void particles_emit(double x, double y, double vx, double vy, double life,
                    double size, size_t color, double gravity)
{
  if (!settings_particles())
  {
    return;
  }
  // reuse slots round-robin; the oldest particle is overwritten when full
  particle_t *p = &particles[next_slot];
  next_slot = (next_slot + 1) % MAX_PARTICLES;
  *p = (particle_t){.alive = true, .x = x, .y = y, .vx = vx, .vy = vy,
                    .age = 0, .life = life, .size = size, .gravity = gravity,
                    .spin = rand_range(0, 2 * M_PI), .color = color % PALETTE_SIZE};
}

void particles_burst(double x, double y, size_t count, double speed)
{
  for (size_t i = 0; i < count; i++)
  {
    double angle = rand_range(0, 2 * M_PI);
    double v = rand_range(speed * 0.3, speed);
    particles_emit(x, y, cos(angle) * v, sin(angle) * v, rand_range(0.35, 0.7),
                   rand_range(3, 6), (size_t)rand(), 300);
  }
}

void particles_confetti(double dt, double rate)
{
  double expected = rate * dt;
  size_t count = (size_t)expected;
  if (rand_range(0, 1) < expected - count)
  {
    count++;
  }
  for (size_t i = 0; i < count; i++)
  {
    particles_emit(rand_range(0, WINDOW_WIDTH), -10, rand_range(-20, 20),
                   rand_range(40, 90), rand_range(5, 9), rand_range(4, 8),
                   (size_t)rand(), 0);
  }
}

void particles_update(double dt)
{
  for (size_t i = 0; i < MAX_PARTICLES; i++)
  {
    particle_t *p = &particles[i];
    if (!p->alive)
    {
      continue;
    }
    p->age += dt;
    if (p->age >= p->life || p->y > WINDOW_HEIGHT + 20)
    {
      p->alive = false;
      continue;
    }
    p->vy += p->gravity * dt;
    p->spin += dt * 4;
    p->x += (p->vx + sin(p->spin) * 25 * (p->gravity == 0)) * dt;
    p->y += p->vy * dt;
  }
}

void particles_render()
{
  for (size_t i = 0; i < MAX_PARTICLES; i++)
  {
    particle_t *p = &particles[i];
    if (!p->alive)
    {
      continue;
    }
    double fade = 1.0 - p->age / p->life;
    // confetti flutters: its width shrinks and grows as it spins
    double w = p->gravity == 0 ? p->size * fabs(cos(p->spin)) + 1 : p->size;
    SDL_FRect rect = {(float)(p->x - w / 2), (float)(p->y - p->size / 2), (float)w,
                      (float)p->size};
    const Uint8 *c = PALETTE[p->color];
    sdl_fill_rect_f(rect, c[0], c[1], c[2], (Uint8)(255 * fade));
  }
}
