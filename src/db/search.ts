import MiniSearch from 'minisearch';
import { Product } from '@/types';

let miniSearchInstance: MiniSearch<Product> | null = null;
let productsCacheMap = new Map<string, Product>();

export function createProductSearchIndex(products: Product[]): MiniSearch<Product> {
  const miniSearch = new MiniSearch<Product>({
    fields: ['name', 'code', 'price'],
    storeFields: ['id', 'code', 'name', 'brand', 'category', 'unit', 'price', 'stock', 'is_active'],
    extractField: (document: Product, fieldName: string) => {
      if (fieldName === 'price') {
        const val = Number(document.price) || 0;
        return `${val} ${val.toFixed(0)} ${val.toFixed(2)}`;
      }
      return (document as any)[fieldName] != null ? String((document as any)[fieldName]) : '';
    },
    searchOptions: {
      fuzzy: 0.2,
      prefix: true,
      boost: { code: 3.0, name: 2.0, price: 1.5 },
    },
  });

  productsCacheMap.clear();
  const activeProducts = products.filter((p) => p.is_active);

  for (const product of activeProducts) {
    productsCacheMap.set(product.id, product);
  }

  miniSearch.addAll(activeProducts);
  miniSearchInstance = miniSearch;
  return miniSearch;
}

export function updateProductInIndex(product: Product): void {
  if (!miniSearchInstance) return;

  if (productsCacheMap.has(product.id)) {
    try {
      miniSearchInstance.remove({ id: product.id } as Product);
    } catch {
      // Ignore if document not present
    }
  }

  if (product.is_active) {
    productsCacheMap.set(product.id, product);
    try {
      miniSearchInstance.add(product);
    } catch {
      // Ignore duplicate add error
    }
  } else {
    productsCacheMap.delete(product.id);
  }
}

/**
 * Instant local search with target <10ms execution time.
 * Searches ONLY by product code, product name, and price.
 */
export function searchProducts(
  query: string,
  fallbackProducts: Product[] = []
): Product[] {
  const trimmed = query.trim();

  // If no search index yet, build it on the fly
  if (!miniSearchInstance) {
    if (fallbackProducts.length > 0) {
      createProductSearchIndex(fallbackProducts);
    } else {
      return [];
    }
  }

  if (!trimmed) {
    // Return all active products from memory cache
    return Array.from(productsCacheMap.values());
  }

  const qLower = trimmed.toLowerCase();
  const allActive = Array.from(productsCacheMap.values()).filter((p) => p.is_active);

  const exactCodeMatches: Product[] = [];
  const exactPriceMatches: Product[] = [];
  const directMatches: Product[] = [];
  const seenIds = new Set<string>();

  const isNumericQuery = !isNaN(Number(trimmed)) && trimmed.length > 0;
  const numQuery = isNumericQuery ? Number(trimmed) : null;

  // 1. Exact code and exact price matching
  for (const p of allActive) {
    if (p.code.toLowerCase() === qLower) {
      exactCodeMatches.push(p);
      seenIds.add(p.id);
    } else if (numQuery !== null && (p.price === numQuery || Number(p.price).toFixed(0) === trimmed)) {
      exactPriceMatches.push(p);
      seenIds.add(p.id);
    }
  }

  // 2. MiniSearch fuzzy prefix search across name, code, price
  const searchResults: Product[] = [];
  try {
    const results = miniSearchInstance!.search(trimmed);
    for (const r of results) {
      if (!seenIds.has(r.id)) {
        const prod = productsCacheMap.get(r.id);
        if (prod && prod.is_active) {
          searchResults.push(prod);
          seenIds.add(r.id);
        }
      }
    }
  } catch {
    // MiniSearch syntax error fallback
  }

  // 3. Substring check strictly limited to name, code, and price
  for (const p of allActive) {
    if (!seenIds.has(p.id)) {
      const codeMatches = p.code.toLowerCase().includes(qLower);
      const nameMatches = p.name.toLowerCase().includes(qLower);
      const priceMatches =
        String(p.price).includes(trimmed) ||
        Number(p.price).toFixed(2).includes(trimmed) ||
        Number(p.price).toFixed(0).includes(trimmed);

      if (codeMatches || nameMatches || priceMatches) {
        directMatches.push(p);
        seenIds.add(p.id);
      }
    }
  }

  return [...exactCodeMatches, ...exactPriceMatches, ...searchResults, ...directMatches];
}
