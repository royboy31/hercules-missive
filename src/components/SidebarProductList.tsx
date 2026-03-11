import { useState, useEffect, useRef } from 'react';

interface ProductItem {
  id: number;
  name: string;
  slug: string;
  image: string;
  categories: { name: string }[];
}

interface Props {
  region: string;
  onSelectProduct: (id: number, name: string) => void;
}

export default function SidebarProductList({ region, onSelectProduct }: Props) {
  const [search, setSearch] = useState('');
  const [allProducts, setAllProducts] = useState<ProductItem[]>([]);
  const [searchResults, setSearchResults] = useState<ProductItem[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [searching, setSearching] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Load all products on mount
  useEffect(() => {
    setLoading(true);
    fetch(`/api/wc/products?region=${region}`)
      .then((r) => r.json())
      .then((data) => setAllProducts(data.items || []))
      .catch(() => setAllProducts([]))
      .finally(() => setLoading(false));
  }, [region]);

  // Debounced search on keyup
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);

    if (!search.trim()) {
      setSearchResults(null);
      setSearching(false);
      return;
    }

    setSearching(true);
    debounceRef.current = setTimeout(() => {
      fetch(`/api/wc/products?region=${region}&search=${encodeURIComponent(search.trim())}`)
        .then((r) => r.json())
        .then((data) => setSearchResults(data.items || []))
        .catch(() => setSearchResults([]))
        .finally(() => setSearching(false));
    }, 300);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [search, region]);

  const products = searchResults !== null ? searchResults : allProducts;
  const isLoading = loading || searching;

  return (
    <div>
      {/* Search */}
      <div className="mb-3">
        <div className="relative">
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search products..."
            className="w-full pl-3 pr-8 py-2 text-[13px] border border-gray-200 rounded-lg bg-white focus:outline-none focus:border-[#10c99e] transition-colors"
          />
          {search && (
            <button
              type="button"
              onClick={() => setSearch('')}
              className="absolute right-2.5 top-2.5 text-gray-400 hover:text-gray-600 cursor-pointer"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>
      </div>

      <p className="text-[11px] text-gray-400 mb-2">
        {isLoading ? 'Loading...' : `${products.length} product${products.length !== 1 ? 's' : ''}`}
        {search && !isLoading && <span> for "{search}"</span>}
      </p>

      {/* Product list */}
      {loading ? (
        <div className="text-center py-8">
          <div className="w-5 h-5 border-2 border-gray-200 border-t-[#10c99e] rounded-full animate-spin mx-auto" />
        </div>
      ) : products.length === 0 ? (
        <p className="text-center text-[13px] text-gray-400 py-8">No products found.</p>
      ) : (
        <div className="space-y-1.5">
          {products.map((product) => (
            <button
              key={product.id}
              onClick={() => onSelectProduct(product.id, product.name)}
              className="w-full flex items-center gap-3 p-2 rounded-lg hover:bg-gray-50 transition-colors cursor-pointer text-left group"
            >
              <div className="w-12 h-12 rounded-lg bg-gray-100 overflow-hidden flex-shrink-0">
                {product.image ? (
                  <img src={product.image} alt="" className="w-full h-full object-cover" loading="lazy" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-gray-300">
                    <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                    </svg>
                  </div>
                )}
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="text-[13px] font-medium leading-snug line-clamp-2 group-hover:text-[#10c99e] transition-colors">
                  {product.name}
                </h3>
                {product.categories.length > 0 && (
                  <span className="text-[10px] text-gray-400">{product.categories[0].name}</span>
                )}
              </div>
              <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4 text-gray-300 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
