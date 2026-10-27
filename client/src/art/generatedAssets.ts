import type Phaser from 'phaser';

export interface GeneratedAsset {
  key: string;
  file: string;
  category: 'wall' | 'door' | 'window' | 'floor' | 'roof' | 'stairs' | 'furniture' | 'wall_object';
  source: string;
  processed: string;
}

export const GENERATED_ASSETS: GeneratedAsset[] = [
  { key: 'gen_wall_straight_h', file: 'assets/buildings/wall_straight_h.png', category: 'wall', source: 'cloudflare-flux-2-dev', processed: 'magenta chroma removal + crop' },
  { key: 'gen_wall_face', file: 'assets/buildings/wall_face.png', category: 'wall', source: 'cloudflare-flux-2-dev', processed: 'central face crop from wall_straight_h' },
  { key: 'gen_wall_corner', file: 'assets/buildings/wall_corner.png', category: 'wall', source: 'cloudflare-flux-2-dev', processed: 'magenta chroma removal + crop' },
  { key: 'gen_door_closed', file: 'assets/buildings/door_closed.png', category: 'door', source: 'cloudflare-flux-2-dev', processed: 'magenta chroma removal + crop' },
  { key: 'gen_bed_double', file: 'assets/buildings/bed_double.png', category: 'furniture', source: 'cloudflare-flux-2-dev', processed: 'magenta chroma removal + crop' },
  { key: 'gen_wardrobe', file: 'assets/buildings/wardrobe.png', category: 'furniture', source: 'cloudflare-flux-2-dev', processed: 'magenta chroma removal + crop' },
];

export const GENERATED_FURNITURE: Record<string, string> = {
  bed_double: 'gen_bed_double',
  wardrobe: 'gen_wardrobe',
};

export function generatedFurnitureKey(templateId: string): string | undefined {
  return GENERATED_FURNITURE[templateId];
}

export function loadGeneratedAssets(scene: Phaser.Scene): void {
  for (const asset of GENERATED_ASSETS) {
    if (!scene.textures.exists(asset.key)) scene.load.image(asset.key, asset.file);
  }
}
