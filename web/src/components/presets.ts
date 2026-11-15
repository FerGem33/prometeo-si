export interface MissionPreset {
  id: string;
  name: string;
  badge: string;
  destination: string;
  tagline: string;
  scenario: {
    o2: number;
    p: number;
    flow?: number;
    material: string;
  };
  designId: string;
  rationale: string;
}

export const NASA_MISSION_PRESETS: MissionPreset[] = [
  {
    id: "artemis_lunar",
    name: "Artemis Lunar Base Alpha",
    badge: "🌕 Moon · Surface",
    destination: "Shackleton Crater Rim",
    tagline: "Reduced-pressure enriched oxygen habitat with dustlock seal",
    scenario: { o2: 24, p: 0.70, flow: 0.05, material: "PMMA" },
    designId: "lunar_base",
    rationale: "Optimized for minimal decompression sickness during EVA preparation (NASA-STD-3001).",
  },
  {
    id: "iss_columbus",
    name: "ISS Microgravity Laboratory",
    badge: "🛰️ Low Earth Orbit",
    destination: "400 km Orbital Altitude",
    tagline: "Standard sea-level atmospheric pressure with active micro-convection",
    scenario: { o2: 21, p: 1.00, flow: 0.20, material: "PMMA" },
    designId: "space_station",
    rationale: "Long-baseline reference environment for microgravity combustion investigations (BASS/CIR).",
  },
  {
    id: "eva_suit_ingress",
    name: "EVA Suit Ingress Airlock",
    badge: "🧑‍🚀 Ingress Airlock",
    destination: "Lunar / Gateway Airlock",
    tagline: "High-oxygen pre-breathe environment with stagnant air envelope",
    scenario: { o2: 32, p: 0.40, flow: 0.00, material: "PMMA" },
    designId: "spacesuit",
    rationale: "Critical flammability boundary conditions with elevated O₂ concentration.",
  },
  {
    id: "pressurized_rover",
    name: "Lunar Terrain Rover (LTV)",
    badge: "🚜 Mobile Habitat",
    destination: "Artemis Extended Traverses",
    tagline: "Compact pressurized cabin with high structural polymer shielding",
    scenario: { o2: 26, p: 0.55, flow: 0.10, material: "PMMA" },
    designId: "pressurized_rover",
    rationale: "Fast-ingress rapid-traverse architecture with low convective ventilation.",
  },
];
