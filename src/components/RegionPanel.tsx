import type { RegionInfo, CustomerMatch } from '../lib/types';

interface Props {
  region: RegionInfo;
  match: CustomerMatch;
  onCreateQuote: (regionCode: string) => void;
}

export default function RegionPanel({ region, match, onCreateQuote }: Props) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5">
      <div className="flex items-center gap-2 mb-3">
        <span
          className={`w-2.5 h-2.5 rounded-full ${match.found ? 'bg-green-500' : 'bg-gray-300'}`}
        />
        <span className="font-semibold text-sm">{region.code}</span>
        <span className="text-gray-500 text-sm">{region.name}</span>
      </div>

      {match.found ? (
        <div className="space-y-1 mb-4">
          <p className="text-sm font-medium">
            {match.first_name} {match.last_name}
          </p>
          {match.company && <p className="text-xs text-gray-500">{match.company}</p>}
          {match.phone && <p className="text-xs text-gray-500">{match.phone}</p>}
        </div>
      ) : (
        <p className="text-sm text-gray-400 mb-4">No account in this region</p>
      )}

      <button
        onClick={() => onCreateQuote(region.code)}
        className="w-full py-2 px-3 text-sm font-medium rounded-lg bg-[#10c99e] text-white hover:bg-[#0db88e] transition-colors cursor-pointer font-[Jost,sans-serif]"
      >
        Create Quote
      </button>
    </div>
  );
}
