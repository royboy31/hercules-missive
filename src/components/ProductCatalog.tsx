import { useState, useEffect, useCallback } from 'react';
import ProductConfigurator from './ProductConfigurator';

interface Category {
  id: number;
  name: string;
  count: number;
  parent: number;
}

interface ProductItem {
  id: number;
  name: string;
  slug: string;
  type: string;
  sku: string;
  price: string;
  image: string;
  categories: { id: number; name: string }[];
  attributes: { name: string; options: string[] }[];
  variations_count: number;
}

interface ProductsResponse {
  region: string;
  items: ProductItem[];
  total: number;
  totalPages: number;
  page: number;
}

const REGIONS = [
  { code: 'DE', name: 'Germany', flag: 'DE' },
  { code: 'UK', name: 'United Kingdom', flag: 'GB' },
  { code: 'FR', name: 'France', flag: 'FR' },
];

interface ProductCatalogProps {
  initialRegion?: string;
  customerEmail?: string;
}

export default function ProductCatalog({ initialRegion, customerEmail }: ProductCatalogProps) {
  const validRegions = REGIONS.map((r) => r.code);
  const startRegion = initialRegion && validRegions.includes(initialRegion.toUpperCase())
    ? initialRegion.toUpperCase()
    : 'DE';
  const [region, setRegion] = useState(startRegion);
  const [search, setSearch] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [category, setCategory] = useState('');
  const [categories, setCategories] = useState<Category[]>([]);
  const [products, setProducts] = useState<ProductItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(0);
  const [total, setTotal] = useState(0);
  const [selectedProduct, setSelectedProduct] = useState<ProductItem | null>(null);

  // Fetch categories when region changes
  useEffect(() => {
    fetch(`/api/wc/categories?region=${region}`)
      .then((r) => r.json())
      .then((data) => setCategories(data.categories || []))
      .catch(() => setCategories([]));
  }, [region]);

  // Fetch products
  const fetchProducts = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ region, page: String(page), per_page: '20' });
      if (search) params.set('search', search);
      if (category) params.set('category', category);
      const res = await fetch(`/api/wc/products?${params}`);
      const data: ProductsResponse = await res.json();
      setProducts(data.items || []);
      setTotalPages(data.totalPages);
      setTotal(data.total);
    } catch {
      setProducts([]);
    } finally {
      setLoading(false);
    }
  }, [region, search, category, page]);

  useEffect(() => {
    fetchProducts();
  }, [fetchProducts]);

  // Reset page when filters change
  useEffect(() => {
    setPage(1);
  }, [region, search, category]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setSearch(searchInput);
  };

  const handleRegionChange = (code: string) => {
    setRegion(code);
    setCategory('');
    setSearch('');
    setSearchInput('');
    setSelectedProduct(null);
  };

  // If a product is selected, show the configurator
  if (selectedProduct) {
    return (
      <div>
        <button
          onClick={() => setSelectedProduct(null)}
          className="flex items-center gap-2 text-sm text-gray-500 hover:text-[#253461] mb-6 transition-colors cursor-pointer"
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          Back to catalog
        </button>
        <ProductConfigurator productId={selectedProduct.id} productName={selectedProduct.name} region={region} />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Region tabs */}
      <div className="flex gap-2">
        {REGIONS.map((r) => (
          <button
            key={r.code}
            onClick={() => handleRegionChange(r.code)}
            className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors cursor-pointer ${
              region === r.code
                ? 'bg-[#253461] text-white'
                : 'bg-white text-gray-600 border border-gray-200 hover:bg-gray-50'
            }`}
          >
            {r.code} — {r.name}
          </button>
        ))}
      </div>

      {/* Search + category filter */}
      <div className="flex gap-3 items-start flex-wrap">
        <form onSubmit={handleSearch} className="flex-1 min-w-[280px]">
          <div className="relative">
            <input
              type="text"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Search products..."
              className="w-full pl-10 pr-4 py-2.5 text-sm border border-gray-200 rounded-lg bg-white focus:outline-none focus:border-[#10c99e] focus:ring-1 focus:ring-[#10c99e] transition-colors"
            />
            <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4 text-gray-400 absolute left-3 top-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            {search && (
              <button
                type="button"
                onClick={() => { setSearch(''); setSearchInput(''); }}
                className="absolute right-3 top-2.5 text-gray-400 hover:text-gray-600 cursor-pointer"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            )}
          </div>
        </form>

        <select
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          className="px-3 py-2.5 text-sm border border-gray-200 rounded-lg bg-white focus:outline-none focus:border-[#10c99e] cursor-pointer min-w-[200px]"
        >
          <option value="">All categories</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name} ({c.count})
            </option>
          ))}
        </select>
      </div>

      {/* Results count */}
      <div className="flex items-center justify-between">
        <p className="text-sm text-gray-500">
          {loading ? 'Loading...' : `${total} product${total !== 1 ? 's' : ''} found`}
          {search && <span> for "<strong>{search}</strong>"</span>}
        </p>
      </div>

      {/* Product grid */}
      {loading ? (
        <div className="text-center py-16">
          <div className="w-8 h-8 border-2 border-gray-200 border-t-[#10c99e] rounded-full animate-spin mx-auto mb-3" />
          <p className="text-sm text-gray-500">Loading products...</p>
        </div>
      ) : products.length === 0 ? (
        <div className="text-center py-16">
          <p className="text-gray-400 text-sm">No products found.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {products.map((product) => (
            <button
              key={product.id}
              onClick={() => setSelectedProduct(product)}
              className="bg-white rounded-xl border border-gray-200 overflow-hidden hover:border-[#10c99e] hover:shadow-md transition-all text-left cursor-pointer group"
            >
              <div className="aspect-square bg-gray-50 overflow-hidden">
                {product.image ? (
                  <img
                    src={product.image}
                    alt={product.name}
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                    loading="lazy"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-gray-300">
                    <svg xmlns="http://www.w3.org/2000/svg" className="w-12 h-12" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                    </svg>
                  </div>
                )}
              </div>
              <div className="p-4">
                <h3 className="text-sm font-medium leading-snug line-clamp-2 mb-2 group-hover:text-[#10c99e] transition-colors">
                  {product.name}
                </h3>
                <div className="flex flex-wrap gap-1">
                  {product.categories.slice(0, 2).map((c) => (
                    <span key={c.id} className="text-[10px] px-1.5 py-0.5 bg-gray-100 text-gray-500 rounded">
                      {c.name}
                    </span>
                  ))}
                </div>
                {product.variations_count > 0 && (
                  <p className="text-xs text-gray-400 mt-2">
                    {product.variations_count} variation{product.variations_count !== 1 ? 's' : ''}
                  </p>
                )}
              </div>
            </button>
          ))}
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2 pt-4">
          <button
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page <= 1}
            className="px-3 py-1.5 text-sm border border-gray-200 rounded-lg disabled:opacity-40 hover:bg-gray-50 transition-colors cursor-pointer disabled:cursor-default"
          >
            Previous
          </button>
          <span className="text-sm text-gray-500 px-3">
            Page {page} of {totalPages}
          </span>
          <button
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={page >= totalPages}
            className="px-3 py-1.5 text-sm border border-gray-200 rounded-lg disabled:opacity-40 hover:bg-gray-50 transition-colors cursor-pointer disabled:cursor-default"
          >
            Next
          </button>
        </div>
      )}
    </div>
  );
}
