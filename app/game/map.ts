export type TileType = 'grass' | 'path' | 'water' | 'tree' | 'flower' | 'building';

export type MapTile = {
  type: TileType;
  walkable: boolean;
};

// Game map: 16x12 tiles (512x384 pixels at 32px per tile)
export const MAP_WIDTH = 16;
export const MAP_HEIGHT = 12;
export const TILE_SIZE = 32;

// Legend: G=grass, P=path, W=water, T=tree, F=flower, B=building
const mapLayout = `
TTTTTTTTTTTTTTTT
TGGGGGPGGGGGGBBT
TGFGGPPPGGFGGGGT
TGGGGPPPPGGGGGGT
TGGGGPPPPGGGGGGT
TFGGGPPPPPPPGGFT
TGGGGPPPPGGPGGGT
TGGGGPPPGGFPGGGT
TWWWGPPGGGGGPGGT
TWWWGPPGGGGGPFGT
TGGGGPPPPPPPPGGT
TTTTTTTTTTTTTTTT
`;

const tileMap: Record<string, MapTile> = {
  'G': { type: 'grass', walkable: true },
  'P': { type: 'path', walkable: true },
  'W': { type: 'water', walkable: false },
  'T': { type: 'tree', walkable: false },
  'F': { type: 'flower', walkable: true },
  'B': { type: 'building', walkable: false },
};

export const getGameMap = (): MapTile[][] => {
  const rows = mapLayout.trim().split('\n');
  return rows.map(row =>
    row.split('').map(char => tileMap[char] || tileMap['G'])
  );
};

export const isWalkable = (map: MapTile[][], x: number, y: number): boolean => {
  if (x < 0 || x >= MAP_WIDTH || y < 0 || y >= MAP_HEIGHT) return false;
  return map[y]?.[x]?.walkable ?? false;
};
