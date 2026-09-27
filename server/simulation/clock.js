// Boucle de simulation — MECHANICS_SPEC.md §1 (TICK_UNIT = 1 jour, SPEED_LEVELS).
// En Phase 1, un tick ne fait qu'avancer la date. Les systèmes (économie, focus, évènements)
// s'y brancheront aux phases suivantes via onTick.
import { SPEED_LEVELS } from '../../shared/constants.js';
import { nextDay } from '../../shared/calendar.js';

export class Clock {
  /** @param {{ getState: () => any, onTick: (state:any) => void | Promise<void> }} opts */
  constructor({ getState, onTick }) {
    this.getState = getState;
    this.onTick = onTick;
    this.timer = null;
  }

  static isValidLevel(level) {
    return Number.isInteger(level) && SPEED_LEVELS.some((s) => s.id === level);
  }

  setSpeed(level) {
    if (!Clock.isValidLevel(level)) {
      throw Object.assign(new Error('Vitesse invalide'), { code: 'INVALID_SPEED' });
    }
    const state = this.getState();
    if (!state) throw Object.assign(new Error('Aucune partie en cours'), { code: 'NO_GAME' });
    state.speed = level;
    this.schedule();
  }

  schedule() {
    clearTimeout(this.timer);
    this.timer = null;
    const state = this.getState();
    const seconds = state && SPEED_LEVELS.find((s) => s.id === state.speed)?.realSecondsPerTick;
    if (!seconds) return;
    this.timer = setTimeout(async () => {
      this.tick();
      await this.onTick(state);
      if (this.getState() === state) this.schedule();
    }, seconds * 1000);
  }

  tick() {
    const state = this.getState();
    state.date = nextDay(state.date);
    state.daysSinceAutosave += 1;
  }

  stop() {
    clearTimeout(this.timer);
    this.timer = null;
  }
}
