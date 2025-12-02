import type { City, Position } from './types';

interface Node {
	pos: Position;
	g: number;
	h: number;
	f: number;
	parent?: Node;
}

function heuristic(a: Position, b: Position): number {
	return Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
}

function posKey(pos: Position): string {
	return `${pos.x},${pos.y}`;
}

export function findPath(city: City, start: Position, end: Position): Position[] {
	if (start.x === end.x && start.y === end.y) {
		return [end];
	}

	const openSet: Node[] = [];
	const closedSet = new Set<string>();

	const startNode: Node = {
		pos: start,
		g: 0,
		h: heuristic(start, end),
		f: heuristic(start, end),
	};

	openSet.push(startNode);

	while (openSet.length > 0) {
		openSet.sort((a, b) => a.f - b.f);
		const current = openSet.shift()!;

		if (current.pos.x === end.x && current.pos.y === end.y) {
			const path: Position[] = [];
			let node: Node | undefined = current;
			while (node) {
				path.unshift({ ...node.pos });
				node = node.parent;
			}
			return path.slice(1);
		}

		closedSet.add(posKey(current.pos));

		const neighbors: Position[] = [
			{ x: current.pos.x, y: current.pos.y - 1 },
			{ x: current.pos.x, y: current.pos.y + 1 },
			{ x: current.pos.x - 1, y: current.pos.y },
			{ x: current.pos.x + 1, y: current.pos.y },
		];

		for (const neighborPos of neighbors) {
			if (
				neighborPos.x < 0 || neighborPos.x >= city.width ||
				neighborPos.y < 0 || neighborPos.y >= city.height
			) continue;

			if (city.grid[neighborPos.y][neighborPos.x] !== 'road') continue;
			if (closedSet.has(posKey(neighborPos))) continue;

			const g = current.g + 1;
			const h = heuristic(neighborPos, end);
			const f = g + h;

			const existing = openSet.find(n => n.pos.x === neighborPos.x && n.pos.y === neighborPos.y);
			if (existing) {
				if (g < existing.g) {
					existing.g = g;
					existing.f = f;
					existing.parent = current;
				}
			} else {
				openSet.push({
					pos: neighborPos,
					g,
					h,
					f,
					parent: current,
				});
			}
		}
	}

	return [];
}

export function manhattanDistance(a: Position, b: Position): number {
	return Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
}

export function pathDistance(city: City, start: Position, end: Position): number {
	const path = findPath(city, start, end);
	return path.length > 0 ? path.length : Infinity;
}
