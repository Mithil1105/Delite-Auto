// Real product photography sourced from the client's existing catalog (deliteauto.com),
// downloaded locally and background-removed (see scripts/remove-bg.mjs) so the demo
// doesn't depend on their live server and drops cleanly onto the category-tinted tiles.
// p03, p04, p38 and p48 are intentionally omitted — the source photos on the live site
// for those products are unusable (a dead-image placeholder, two technical line-diagrams
// instead of real photos, and an invoice photo), so those fall back to the icon-on-gradient
// treatment instead of a bad or misleading real photo.
export const productImages: Record<string, string> = {
  p01: "/images/products/442.png", // Dolphin Seat Cover — Hyundai Creta
  p02: "/images/products/508.png", // Dolphin Orbit Seat Cover — Mahindra XUV700
  p05: "/images/products/13.png", // 4N 12mm Grass Mats — Set of 5, Black
  p06: "/images/products/12.png", // 4N 12mm Grass Mats with Border — Grey/Black
  p07: "/images/products/351.png", // ALP 3D Mats — Mahindra Heavy Duty
  p08: "/images/products/26.png", // LLM Floor Mat — Bajaj Chetak EV
  p09: "/images/products/500.png", // Waxpol Silicone Liquid Car Polish
  p10: "/images/products/499.png", // Waxpol Carpet & Upholstery Cleaner Foam
  p11: "/images/products/492.png", // Waxpol Ecosaver Wash Shampoo, 2.5L
  p12: "/images/products/496.png", // Waxpol Rain Repellent Kit
  p13: "/images/products/112.png", // Würth Engine Flush & Cleaner
  p14: "/images/products/396.png", // Würth Brake Paste
  p15: "/images/products/491.png", // JBL Legend 700 Touchscreen Multimedia Receiver
  p16: "/images/products/315.png", // Moco 4GB/64GB — Hyundai Creta 2024
  p17: "/images/products/308.png", // Pricol AHD Reverse Camera
  p18: "/images/products/354.png", // Qubo 2-in-1 Jump Starter & Inflator
  p19: "/images/products/31.png", // Sony car audio amplifier
  p19b: "/images/products/323.png", // Nakamichi speaker set
  p20: "/images/products/116.png", // Wheels Eye W1 GPS Tracker
  p21: "/images/products/303.png", // NV Track Anti-Theft Immobilizer (Wheels Eye dashcam reused)
  p22: "/images/products/287.png", // Godrej Aer Click Gel, 10gm
  p23: "/images/products/284.png", // Godrej Aer Twist Gel, 45g
  p24: "/images/products/339.png", // Vedashree Car Perfume
  p25: "/images/products/10.png", // Front Fender Guard — Honda Activa (Set of 3)
  p26: "/images/products/411.png", // Pathak Footrest Stand — Ola S1X
  p27: "/images/products/410.png", // Pathak Gold Side Stand
  p28: "/images/products/415.png", // Bike Holder Hook, Premium
  p29: "/images/products/505.png", // Waterproof Body Cover — Royal Enfield Classic 650
  p31: "/images/products/394.png", // Vito Indicator Buzzer
  p32: "/images/products/365.png", // Würth Underbody Protection, Black
  p33: "/images/products/301.png", // Würth P20 High Gloss Polish Plus
  p34: "/images/products/397.png", // Würth Angled Circlip Pliers
  p35: "/images/products/383.png", // Würth Electronic Refrigerant Leak Detector
  p36: "/images/products/119.png", // Lumbar Support Cushion
  p37: "/images/products/237.png", // Ergonomic Neck Pillow
  p39: "/images/products/117.png", // Carigiri Car Neck Rest Pillow
  p40: "/images/products/506.png", // Magnetic Hood Strips — All Cars
  p41: "/images/products/504.png", // Sarte Sun Shade for Side Windows
  p42: "/images/products/455.png", // PV Max Chrome Key Cover & Keychain
  p44: "/images/products/417.png", // Amaron Sealed 2-Wheeler Battery
  p45: "/images/products/498.png", // Waxpol 4T Gold Bike Engine Oil
  p46: "/images/products/388.png", // Waxpol CCL170 Chain Lube
  p47: "/images/products/357.png", // Stellar Air Jet Turbo Blower
};
