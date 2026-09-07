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
