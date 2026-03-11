import { useEffect } from 'react';
import { useStore } from '@nanostores/react';
import { $email, $customerResult, $customerLoading, $customerError, $activeRegion } from '../lib/stores';
import { lookupCustomer } from '../lib/api';
import { REGIONS } from '../lib/types';
import CustomerCard from './CustomerCard';
import RegionPanel from './RegionPanel';

interface Props {
  email: string;
}

export default function CustomerIdentification({ email }: Props) {
  const result = useStore($customerResult);
  const loading = useStore($customerLoading);
  const error = useStore($customerError);

  useEffect(() => {
    if (!email) return;
    $email.set(email);
    $customerLoading.set(true);
    $customerError.set('');

    lookupCustomer(email)
      .then((data) => {
        $customerResult.set(data);
      })
      .catch((err) => {
        $customerError.set(err.message || 'Lookup failed');
      })
      .finally(() => {
        $customerLoading.set(false);
      });
  }, [email]);

  function handleCreateQuote(regionCode: string) {
    $activeRegion.set(regionCode);
    // TODO: Navigate to quote builder
  }

  if (loading) {
    return (
      <div className="text-center py-12">
        <div className="w-8 h-8 border-2 border-gray-200 border-t-[#10c99e] rounded-full animate-spin mx-auto mb-3" />
        <p className="text-sm text-gray-500">Looking up customer across all regions...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-xl p-5 text-center">
        <p className="text-red-700 text-sm font-medium">Error</p>
        <p className="text-red-600 text-sm mt-1">{error}</p>
        <button
          onClick={() => {
            $customerLoading.set(true);
            $customerError.set('');
            lookupCustomer(email)
              .then((data) => $customerResult.set(data))
              .catch((err) => $customerError.set(err.message))
              .finally(() => $customerLoading.set(false));
          }}
          className="mt-3 px-4 py-1.5 text-sm bg-red-100 text-red-700 rounded-lg hover:bg-red-200 transition-colors cursor-pointer"
        >
          Retry
        </button>
      </div>
    );
  }

  if (!result) return null;

  return (
    <div className="space-y-6">
      <CustomerCard result={result} />

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {REGIONS.map((region) => (
          <RegionPanel
            key={region.code}
            region={region}
            match={result.regions[region.code] || { found: false }}
            onCreateQuote={handleCreateQuote}
          />
        ))}
      </div>
    </div>
  );
}
