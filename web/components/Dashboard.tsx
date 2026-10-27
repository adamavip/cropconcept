'use client';
// The dashboard: mounts the ported chart kit and pages onto a static shell, and keeps the URL in step.
import { useEffect, useRef } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { Dash, DEFAULT_PARAMS } from '@/lib/dash';
import { createKit } from '@/lib/kit';
import { createPages } from '@/lib/pages';
import { mountApp } from '@/lib/app';
import { DATASET_IDS } from '@/lib/datasets';

const PLACE_TO_PATH: Record<string, string> = {
  exec: '/', monitoring: '/monitoring', demographics: '/demographics',
  'traits-et': '/traits/et', 'traits-tz': '/traits/tz', 'traits-la': '/traits/la',
  'wtp-et': '/wtp/et', 'wtp-tz': '/wtp/tz', 'wtp-la': '/wtp/la',
};
const PATH_TO_PLACE = Object.fromEntries(Object.entries(PLACE_TO_PATH).map(([k, v]) => [v, k]));

export default function Dashboard() {
  const root = useRef<HTMLDivElement>(null);
  const router = useRouter();
  const pathname = usePathname();
  const appRef = useRef<any>(null);

  useEffect(() => {
    if (!root.current || appRef.current) return;
    const dash = new Dash(DATASET_IDS, DEFAULT_PARAMS, () => {});
    const K = createKit(dash);
    const P = createPages(K, dash);
    const navigate = (place: string) => {
      const path = PLACE_TO_PATH[place] || '/';
      if (path !== window.location.pathname) router.push(path);
    };
    appRef.current = mountApp(root.current, dash, K, P, navigate);
    appRef.current.open(PATH_TO_PLACE[window.location.pathname] || 'exec');
    return () => { appRef.current?.destroy(); appRef.current = null; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    // back/forward: open the place the URL names
    const place = PATH_TO_PLACE[pathname] || 'exec';
    appRef.current?.open(place);
  }, [pathname]);

  return (
    <div className="cc cc-light" id="cc" ref={root}>
      <header className="cc-head">
        <div className="cc-logo cc-logo-cc" role="img" aria-label="CropConcept"></div>
        <div className="cc-loaded" id="loaded"><span className="cc-dot"></span><span>Data loaded</span>
          <strong data-source="refresh" data-field="data_loaded_eat" data-row="0">—</strong></div>
        <button type="button" className="cc-mode" id="mode" aria-pressed="false">☾ Dark</button>
        <div className="cc-logo cc-logo-cimmyt" role="img" aria-label="CIMMYT"></div>
      </header>
      <nav className="cc-nav" id="nav" role="tablist" aria-label="Pages">
        <button role="tab" data-tab="exec" aria-selected="true">Executive summary</button>
        <button role="tab" data-tab="monitoring">Survey monitoring</button>
        <button role="tab" data-tab="demographics">Demographics</button>
        <button role="tab" data-tab="traits">Trait preferences</button>
        <button role="tab" data-tab="wtp">Willingness to pay</button>
      </nav>
      <main className="cc-body" id="pages"></main>
      <footer className="cc-body cc-footer">
        <p>Data come from SurveyCTO through a sync that runs every 15 minutes; &quot;Data loaded&quot; is when it last finished, not the latest interview. Coordinates are grouped into 0.5-degree cells. LATAM pilot and training records are loaded but never counted as usable.</p>
        <div className="cc-footer-band" aria-hidden="true"></div>
      </footer>
    </div>
  );
}
