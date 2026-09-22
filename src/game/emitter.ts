/** Small typed event emitter so the scene can drive its HUD from events, not polling. */
export class Emitter<EventMap extends Record<string, unknown>> {
  private handlers: { [K in keyof EventMap]?: Array<(payload: EventMap[K]) => void> } = {};

  on<K extends keyof EventMap>(event: K, fn: (payload: EventMap[K]) => void): void {
    (this.handlers[event] ??= []).push(fn);
  }

  off<K extends keyof EventMap>(event: K, fn: (payload: EventMap[K]) => void): void {
    this.handlers[event] = (this.handlers[event] ?? []).filter((h) => h !== fn);
  }

  emit<K extends keyof EventMap>(event: K, payload: EventMap[K]): void {
    for (const fn of this.handlers[event] ?? []) fn(payload);
  }
}
