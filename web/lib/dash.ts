// A small client-side data store with the same surface as the Claude dashboard's `dash` object,
// so lib/kit.js and lib/pages.js run unchanged. Data comes from /api/data/<id>?params.

export type Status = 'ok' | 'loading' | 'error' | 'missing';
export interface DataState { status: Status; data: any[]; columns: string[]; message?: string; refreshing: boolean; }
type Listener = () => void;

const PARAM_PREFIX: Record<string, string> = {
  p: 'p', et: 'et', ew: 'ew', tz: 'tz', tw: 'tw', la: 'la', lw: 'lw',
};

export class Dash {
  private store = new Map<string, DataState>();
  private params: Record<string, any>;
  private defaults: Record<string, any>;
  private listeners = new Set<Listener>();
  private inflight = new Map<string, AbortController>();
  private known: Set<string>;
  private onLink: (name: string) => void;
  colors: string[] = ['#326670', '#F4B942', '#704B0F', '#8EC1CB', '#77BD42', '#F29657', '#4F8A94', '#C9A76A'];

  constructor(knownIds: string[], defaults: Record<string, any>, onLink: (name: string) => void) {
    this.known = new Set(knownIds);
    this.defaults = { ...defaults };
    this.params = { ...defaults };
    this.onLink = onLink;
  }

  data(id: string): DataState {
    const d = this.store.get(id);
    if (d) return d;
    if (!this.known.has(id)) return { status: 'missing', data: [], columns: [], refreshing: false };
    const init: DataState = { status: 'loading', data: [], columns: [], refreshing: false };
    this.store.set(id, init);
    void this.load(id);
    return init;
  }

  onData(fn: Listener) {
    this.listeners.add(fn);
    fn();
    return () => this.listeners.delete(fn);
  }

  params_() { return this.params; }
  getParams() { return { ...this.params }; }

  setParams(patch: Record<string, any>) {
    let changed = false;
    for (const [k, v] of Object.entries(patch)) {
      const next = v === '' ? null : v;
      if (this.params[k] !== next) { this.params[k] = next; changed = true; }
    }
    if (!changed) return;
    const touched = new Set(Object.keys(patch));
    for (const id of this.store.keys()) {
      if (this.affected(id, touched)) void this.load(id, true);
    }
    this.emit();
  }

  resetParams() {
    const patch: Record<string, any> = {};
    for (const k of Object.keys(this.params)) patch[k] = this.defaults[k] ?? null;
    this.setParams(patch);
  }

  refresh(id: string) { void this.load(id, true); }
  setLink(name: string) { this.onLink(name); }

  // ids are named <group>_<name>; params are named <group>_<param>
  private affected(id: string, touched: Set<string>) {
    const group = id.split('_')[0];
    for (const t of touched) if (t.split('_')[0] === group || (group === 'p' && t.startsWith('p_'))) return true;
    return false;
  }

  private emit() { this.listeners.forEach((fn) => fn()); }

  private async load(id: string, refreshing = false) {
    const group = id.split('_')[0];
    const qs = new URLSearchParams();
    for (const [k, v] of Object.entries(this.params)) {
      if (v != null && v !== '' && k.split('_')[0] === group) qs.set(k, String(v));
    }
    const prev = this.store.get(id);
    if (prev && refreshing) this.store.set(id, { ...prev, refreshing: true });
    this.inflight.get(id)?.abort();
    const ac = new AbortController();
    this.inflight.set(id, ac);
    this.emit();
    try {
      const res = await fetch(`/api/data/${id}?${qs.toString()}`, { signal: ac.signal });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).detail || `HTTP ${res.status}`);
      const body = await res.json();
      this.store.set(id, { status: 'ok', data: body.rows, columns: body.columns, refreshing: false });
    } catch (err: any) {
      if (err?.name === 'AbortError') return;
      this.store.set(id, { status: 'error', data: [], columns: [], message: String(err?.message || err), refreshing: false });
    }
    this.emit();
  }
}

export const DEFAULT_PARAMS: Record<string, any> = { tw_product: 'Orange Plus Maize' };
export { PARAM_PREFIX };
