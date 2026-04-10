/**
 * Build WC_STORES config from Cloudflare runtime environment variables.
 * Keys are read from env vars instead of being hardcoded.
 */
export function getWcStores(env: Record<string, string>) {
  return {
    DE: {
      url: 'https://hercules-merchandise.de',
      ck: env.WC_DE_CK,
      cs: env.WC_DE_CS,
    },
    UK: {
      url: 'https://hercules-merchandise.co.uk',
      ck: env.WC_UK_CK,
      cs: env.WC_UK_CS,
    },
    FR: {
      url: 'https://hercules-merchandising.fr',
      ck: env.WC_FR_CK,
      cs: env.WC_FR_CS,
    },
  } as Record<string, { url: string; ck: string; cs: string }>;
}
