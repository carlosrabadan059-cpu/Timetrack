// Server-Sent Events broadcaster
// Sends real-time fichaje events (from all 3 sources) to subscribed frontend clients

export type SseEvent = Record<string, unknown>;
type EmitFn = (event: SseEvent) => void;

class SseBroadcaster {
  private connections = new Map<string, Set<EmitFn>>();
  private companyConnections = new Map<string, Set<EmitFn>>();

  addConnection(userId: string, fn: EmitFn): void {
    let set = this.connections.get(userId);
    if (!set) {
      set = new Set();
      this.connections.set(userId, set);
    }
    set.add(fn);
  }

  removeConnection(userId: string, fn: EmitFn): void {
    this.connections.get(userId)?.delete(fn);
  }

  emit(userId: string, event: SseEvent): void {
    const fns = this.connections.get(userId);
    if (!fns) return;
    for (const fn of fns) {
      try {
        fn(event);
      } catch {
        fns.delete(fn);
      }
    }
  }

  addCompanyConnection(companyId: string, fn: EmitFn): void {
    let set = this.companyConnections.get(companyId);
    if (!set) {
      set = new Set();
      this.companyConnections.set(companyId, set);
    }
    set.add(fn);
  }

  removeCompanyConnection(companyId: string, fn: EmitFn): void {
    this.companyConnections.get(companyId)?.delete(fn);
  }

  emitToCompany(companyId: string, event: SseEvent): void {
    const fns = this.companyConnections.get(companyId);
    if (!fns) return;
    for (const fn of fns) {
      try {
        fn(event);
      } catch {
        fns.delete(fn);
      }
    }
  }
}

export const sseBroadcaster = new SseBroadcaster();
