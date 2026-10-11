import MiniSearch from 'minisearch';
import { Product } from '@/types';

let miniSearchInstance: MiniSearch<Product> | null = null;
let productsCacheMap = new Map<string, Product>();

export function createProductSearchIndex(products: Product[]): MiniSearch<Product> {
  const miniSearch = new MiniSearch<Product>({
    fields: ['name', 'code', 'category'],
    storeFields: ['id', 'code', 'name', 'category', 'unit', 'price', 'stock', 'is_active'],
    searchOptions: {
      fuzzy: 0.2,
      prefix: true,
      boost: { code: 2.5, name: 1.5, category: 1.0 },
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
 * If query is empty, returns first N active products.
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

  // 1. Direct check: exact code match (for barcode scanners or direct code typing)
  const exactCodeUpper = trimmed.toUpperCase();
  for (const p of productsCacheMap.values()) {
    if (p.code.toUpperCase() === exactCodeUpper) {
      // Move exact match to first position, then append search results
      const results = miniSearchInstance!.search(trimmed);
      const otherProducts = results
        .map((r) => productsCacheMap.get(r.id))
        .filter((p): p is Product => Boolean(p && p.id !== p.id));
      return [p, ...otherProducts];
    }
  }

  // 2. MiniSearch fuzzy prefix search
  const results = miniSearchInstance!.search(trimmed);
  const matched: Product[] = [];

  for (const r of results) {
    const prod = productsCacheMap.get(r.id);
    if (prod && prod.is_active) {
      matched.push(prod);
    }
  }

  return matched;
}
