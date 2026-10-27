import type Phaser from 'phaser';

export interface GeneratedAsset {
  key: string;
  file: string;
  category: 'wall' | 'door' | 'window' | 'floor' | 'roof' | 'stairs' | 'furniture' | 'wall_object';
  source: string;
  processed: string;
}

export const GENERATED_ASSETS: GeneratedAsset[] = [
  { key: 'gen_wall_brick_face', file: 'assets/buildings/wall_brick_face.png', category: 'wall', source: 'gemini-imagen', processed: 'seamless authentic red clay brick with stone coping' },
  { key: 'gen_wall_brick_plain', file: 'assets/buildings/wall_brick_plain.png', category: 'wall', source: 'gemini-imagen', processed: 'seamless plain red clay brick' },
  { key: 'gen_wall_concrete_face', file: 'assets/buildings/wall_concrete_face.png', category: 'wall', source: 'procedural-texture', processed: 'industrial basement concrete' },
  { key: 'gen_wall_interior_face', file: 'assets/buildings/wall_interior_face.png', category: 'wall', source: 'procedural-texture', processed: 'vintage residential partition plaster' },
  { key: 'gen_wall_interior_damaged', file: 'assets/buildings/wall_interior_damaged.png', category: 'wall', source: 'gemini-imagen', processed: 'peeling damaged wallpaper and plaster' },
  { key: 'gen_floor_wood', file: 'assets/buildings/floor_wood.png', category: 'floor', source: 'gemini-imagen', processed: 'weathered residential wooden floorboards' },
  { key: 'gen_floor_wood_dark', file: 'assets/buildings/floor_wood_dark.png', category: 'floor', source: 'gemini-imagen', processed: 'aged dark walnut wooden floorboards' },
  { key: 'gen_floor_wood_scuffed', file: 'assets/buildings/floor_wood_scuffed.png', category: 'floor', source: 'gemini-imagen', processed: 'scuffed weathered timber floorboards' },
  { key: 'gen_ground_postapo', file: 'assets/buildings/ground_postapo.png', category: 'floor', source: 'gemini-imagen', processed: 'post-apocalyptic wild grass and dry dirt terrain' },
  { key: 'gen_floor_concrete', file: 'assets/buildings/floor_concrete.png', category: 'floor', source: 'gemini-imagen', processed: 'industrial basement concrete floor slab' },
  { key: 'gen_roof_tar', file: 'assets/buildings/roof_tar.png', category: 'roof', source: 'gemini-imagen', processed: 'weathered commercial tar and gravel roofing' },
  { key: 'gen_roof_ac_unit', file: 'assets/buildings/roof_ac_unit.png', category: 'roof', source: 'gemini-imagen', processed: 'weathered rooftop industrial HVAC unit' },
  { key: 'gen_window_unit', file: 'assets/buildings/window_unit.png', category: 'window', source: 'gemini-imagen', processed: 'weathered wooden double-hung sash window with stone sill' },
  { key: 'gen_wall_straight_h', file: 'assets/buildings/wall_straight_h.png', category: 'wall', source: 'cloudflare-flux-2-dev', processed: 'magenta chroma removal + crop' },
  { key: 'gen_wall_face', file: 'assets/buildings/wall_brick_face.png', category: 'wall', source: 'cloudflare-flux-2-dev', processed: 'seamless leveled brick face' },
  { key: 'gen_wall_corner', file: 'assets/buildings/wall_corner.png', category: 'wall', source: 'cloudflare-flux-2-dev', processed: 'magenta chroma removal + crop' },
  { key: 'gen_door_frame', file: 'assets/buildings/door_frame.png', category: 'door', source: 'cloudflare-flux-2-dev', processed: 'stationary door frame and wall opening' },
  { key: 'gen_door_leaf', file: 'assets/buildings/door_leaf.png', category: 'door', source: 'cloudflare-flux-2-dev', processed: 'isolated wooden door leaf (closed)' },
  { key: 'gen_door_leaf_open', file: 'assets/buildings/door_leaf_open.png', category: 'door', source: 'cloudflare-flux-2-dev', processed: 'swung 90 deg inward door leaf' },
  { key: 'gen_door_cutaway', file: 'assets/buildings/door_cutaway.png', category: 'door', source: 'cloudflare-flux-2-dev', processed: 'waist-height cutaway doorway' },
  { key: 'gen_door_closed', file: 'assets/buildings/door_closed.png', category: 'door', source: 'cloudflare-flux-2-dev', processed: 'legacy composite door' },
  { key: 'gen_bed_double', file: 'assets/buildings/bed_double.png', category: 'furniture', source: 'cloudflare-flux-2-dev', processed: 'magenta chroma removal + crop' },
  { key: 'gen_wardrobe', file: 'assets/buildings/wardrobe.png', category: 'furniture', source: 'cloudflare-flux-2-dev', processed: 'magenta chroma removal + crop' },
  { key: 'gen_crate', file: 'assets/props/prop_crate.png', category: 'furniture', source: 'game-props', processed: 'military wooden crate' },
  { key: 'gen_sofa', file: 'assets/props/prop_sofa.png', category: 'furniture', source: 'game-props', processed: 'chesterfield sofa' },
  { key: 'gen_barrel', file: 'assets/props/prop_barrel.png', category: 'furniture', source: 'game-props', processed: 'weathered rusted barrel' },
];

export const GENERATED_FURNITURE: Record<string, string> = {
  bed_double: 'gen_bed_double',
  wardrobe: 'gen_wardrobe',
  crate: 'gen_crate',
  barrel: 'gen_barrel',
  sofa: 'gen_sofa',
};

export function generatedFurnitureKey(templateId: string): string | undefined {
  return GENERATED_FURNITURE[templateId];
}

export function loadGeneratedAssets(scene: Phaser.Scene): void {
  for (const asset of GENERATED_ASSETS) {
    if (!scene.textures.exists(asset.key)) scene.load.image(asset.key, asset.file);
  }
}
