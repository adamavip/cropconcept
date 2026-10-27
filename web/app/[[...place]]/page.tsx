import Dashboard from '@/components/Dashboard';

// Every place (/, /monitoring, /traits/et, …) renders the same client dashboard, which opens the page the URL names.
export default function Page() {
  return <Dashboard />;
}

export function generateStaticParams() {
  return [{ place: [] }, { place: ['monitoring'] }, { place: ['demographics'] },
    ...['et', 'tz', 'la'].flatMap((s) => [{ place: ['traits', s] }, { place: ['wtp', s] }])];
}
