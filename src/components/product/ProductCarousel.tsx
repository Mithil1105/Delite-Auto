import type { Product } from "../../data/types";
import { Rail, RailItem } from "../Rail";
import { ProductCard } from "./ProductCard";

/**
 * Collapses the repeated <Rail>{products.map(p => <RailItem><ProductCard/></RailItem>)}</Rail>
 * pattern (previously duplicated across Home's 4 carousels + Product Detail's related products)
 * into one call.
 */
export function ProductCarousel({ products }: { products: Product[] }) {
  return (
    <Rail>
      {products.map((p) => (
        <RailItem key={p.id}>
          <ProductCard product={p} />
        </RailItem>
      ))}
    </Rail>
  );
}
