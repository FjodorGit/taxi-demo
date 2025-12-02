import type { City, CellType, Position } from './types';

function seededRandom(seed: number): () => number {
  return () => {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    return seed / 0x7fffffff;
  };
}

export function generateCity(width: number, height: number, seed: number = 42): City {
  const random = seededRandom(seed);
  const grid: CellType[][] = Array(height).fill(null).map(() => Array(width).fill('empty'));
  
  const mainRoadSpacingX = 4 + Math.floor(random() * 2);
  const mainRoadSpacingY = 4 + Math.floor(random() * 2);
  
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const isMainRoadX = x % mainRoadSpacingX === 0;
      const isMainRoadY = y % mainRoadSpacingY === 0;
      
      if (isMainRoadX || isMainRoadY) {
        grid[y][x] = 'road';
      }
    }
  }
  
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (grid[y][x] === 'road') continue;
      
      const hasAdjacentRoad = [
        [0, -1], [0, 1], [-1, 0], [1, 0]
      ].some(([dx, dy]) => {
        const nx = x + dx;
        const ny = y + dy;
        return nx >= 0 && nx < width && ny >= 0 && ny < height && grid[ny][nx] === 'road';
      });
      
      if (hasAdjacentRoad && random() > 0.15) {
        grid[y][x] = 'building';
      } else if (random() > 0.7) {
        grid[y][x] = 'building';
      }
    }
  }
  
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      if (grid[y][x] !== 'road' && random() > 0.85) {
        const canBreak = grid[y-1][x] === 'road' || grid[y+1][x] === 'road' ||
                        grid[y][x-1] === 'road' || grid[y][x+1] === 'road';
        if (!canBreak) {
          grid[y][x] = 'empty';
        }
      }
    }
  }
  
  const pickupSpots = findPickupSpots(grid, width, height);
  
  return { grid, width, height, pickupSpots };
}

function findPickupSpots(grid: CellType[][], width: number, height: number): Position[] {
  const spots: Position[] = [];
  
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (grid[y][x] !== 'road') continue;
      
      const adjacentToBuilding = [
        [0, -1], [0, 1], [-1, 0], [1, 0]
      ].some(([dx, dy]) => {
        const nx = x + dx;
        const ny = y + dy;
        return nx >= 0 && nx < width && ny >= 0 && ny < height && grid[ny][nx] === 'building';
      });
      
      if (adjacentToBuilding) {
        spots.push({ x, y });
      }
    }
  }
  
  return spots;
}

export function isRoad(city: City, pos: Position): boolean {
  if (pos.x < 0 || pos.x >= city.width || pos.y < 0 || pos.y >= city.height) {
    return false;
  }
  return city.grid[pos.y][pos.x] === 'road';
}

export function getRandomPickupSpot(city: City, random: () => number): Position {
  const idx = Math.floor(random() * city.pickupSpots.length);
  return { ...city.pickupSpots[idx] };
}

export function getRandomDifferentPickupSpot(city: City, exclude: Position, random: () => number): Position {
  const filtered = city.pickupSpots.filter(p => p.x !== exclude.x || p.y !== exclude.y);
  const idx = Math.floor(random() * filtered.length);
  return { ...filtered[idx] };
}
