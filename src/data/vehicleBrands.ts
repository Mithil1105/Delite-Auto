import type { VehicleBrand } from "./types";

/**
 * OEM car/bike makes shown in the home page's "Shop by Brands" section — i.e. which
 * vehicles our accessories fit. Distinct from `brands.ts`, which lists the accessory
 * brands we stock (Dolphin, Wurth, Sony...) and still drives the Shop page's brand filter.
 */
export const vehicleBrands: VehicleBrand[] = [
  { slug: "audi", name: "Audi", vehicle: "car" },
  { slug: "maruti-suzuki", name: "Maruti Suzuki", vehicle: "car" },
  { slug: "hyundai", name: "Hyundai", vehicle: "car" },
  { slug: "tata", name: "Tata", vehicle: "car" },
  { slug: "toyota", name: "Toyota", vehicle: "car" },
  { slug: "kia", name: "Kia", vehicle: "car" },
  { slug: "skoda", name: "Skoda", vehicle: "car" },
  { slug: "honda-cars", name: "Honda", vehicle: "car" },
  { slug: "volkswagen", name: "Volkswagen", vehicle: "car" },
  { slug: "bmw", name: "BMW", vehicle: "car" },
  { slug: "mercedes-benz", name: "Mercedes-Benz", vehicle: "car" },
  { slug: "mg-motors", name: "MG Motors", vehicle: "car" },
  { slug: "ford", name: "Ford", vehicle: "car" },
  { slug: "volvo", name: "Volvo", vehicle: "car" },
  { slug: "nissan", name: "Nissan", vehicle: "car" },
  { slug: "jeep", name: "Jeep", vehicle: "car" },
  { slug: "honda-bikes", name: "Honda", vehicle: "bike" },
  { slug: "ola-electric", name: "OLA", vehicle: "bike" },
  { slug: "bajaj-chetak", name: "Chetak", vehicle: "bike" },
  { slug: "suzuki-bikes", name: "Suzuki", vehicle: "bike" },
  { slug: "yamaha", name: "Yamaha", vehicle: "bike" },
  { slug: "tvs-motor", name: "TVS Motor", vehicle: "bike" },
  { slug: "royal-enfield", name: "Royal Enfield", vehicle: "bike" },
  { slug: "hero-motocorp", name: "Hero", vehicle: "bike" },
];

export const vehicleBrandsFor = (vehicle: "car" | "bike") => vehicleBrands.filter((b) => b.vehicle === vehicle);

/**
 * Logo files under public/images/vehicle-brands/, keyed by the normalized make name (lowercase,
 * letters/digits only) so a CMS-overridden name list still resolves. Sources: Simple Icons (CC0)
 * recoloured to each brand's official colour, plus Wikimedia Commons SVGs for Maruti Suzuki,
 * Mercedes-Benz, OLA, Royal Enfield and Hero. The logos are the makes' trademarks, shown only to
 * indicate which vehicles the accessories fit. No usable logo was found for TVS Motor or Chetak,
 * so those keep the letter badge. NOT Odoo data — Odoo has no vehicle-make field. See
 * Documentations MD/frontend-foundation-uiux-refactor.md.
 */
const logoFiles: Record<string, string> = {
  audi: "audi", marutisuzuki: "maruti-suzuki", hyundai: "hyundai", tata: "tata", toyota: "toyota", kia: "kia", skoda: "skoda",
  honda: "honda", volkswagen: "volkswagen", bmw: "bmw", mercedesbenz: "mercedes-benz", mgmotors: "mg", mg: "mg", ford: "ford",
  volvo: "volvo", nissan: "nissan", jeep: "jeep", ola: "ola", olaelectric: "ola", suzuki: "suzuki", yamaha: "yamaha",
  royalenfield: "royal-enfield", hero: "hero", heromotocorp: "hero",
};

export const vehicleBrandLogo = (name: string): string | undefined => {
  const file = logoFiles[name.toLowerCase().replace(/[^a-z0-9]/g, "")];
  return file ? `/images/vehicle-brands/${file}.svg` : undefined;
};
