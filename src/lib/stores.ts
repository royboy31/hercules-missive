import { atom } from 'nanostores';
import type { CustomerLookupResult } from './types';

/** The email being looked up, from ?email= query param */
export const $email = atom<string>('');

/** Customer lookup result from D1 */
export const $customerResult = atom<CustomerLookupResult | null>(null);

/** Loading state for customer lookup */
export const $customerLoading = atom<boolean>(false);

/** Error state */
export const $customerError = atom<string>('');

/** Currently selected region for quote creation */
export const $activeRegion = atom<string>('');
