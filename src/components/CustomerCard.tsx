import type { CustomerLookupResult } from '../lib/types';

interface Props {
  result: CustomerLookupResult;
}

export default function CustomerCard({ result }: Props) {
  // Find the first region where customer exists to show as primary
  const primary = Object.entries(result.regions).find(([, m]) => m.found);
  const name = primary
    ? `${primary[1].first_name || ''} ${primary[1].last_name || ''}`.trim()
    : '';
  const company = primary ? primary[1].company : '';
  const anyFound = Object.values(result.regions).some((m) => m.found);

  if (!anyFound) {
    return (
      <div className="flex items-center gap-3 bg-white rounded-xl border border-gray-200 p-5">
        <div className="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center text-gray-400 font-bold text-lg">
          +
        </div>
        <div>
          <p className="font-semibold">New Customer</p>
          <p className="text-sm text-gray-500">{result.email}</p>
          <p className="text-xs text-gray-400">No account found in any region</p>
        </div>
      </div>
    );
  }

  const initials = (name || result.email)
    .split(/[\s@]/)
    .filter(Boolean)
    .slice(0, 2)
    .map((s) => s[0].toUpperCase())
    .join('');

  return (
    <div className="flex items-center gap-3 bg-white rounded-xl border border-gray-200 p-5">
      <div className="w-10 h-10 rounded-full bg-[#253461] flex items-center justify-center text-white font-bold text-sm font-[Jost,sans-serif]">
        {initials}
      </div>
      <div>
        <p className="font-semibold">
          {name || result.email}
          {company && <span className="text-gray-500 font-normal"> — {company}</span>}
        </p>
        <p className="text-sm text-gray-500">{result.email}</p>
      </div>
    </div>
  );
}
