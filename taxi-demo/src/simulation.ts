import type { City, Passenger, Taxi, SimulationState, SimulationConfig, Position, Metrics } from './types';
import { generateCity, getRandomPickupSpot, getRandomDifferentPickupSpot } from './cityGenerator';
import { findPath, pathDistance } from './pathfinding';

function seededRandom(seed: number): () => number {
	return () => {
		seed = (seed * 1103515245 + 12345) & 0x7fffffff;
		return seed / 0x7fffffff;
	};
}

export function createSimulation(config: SimulationConfig, seed: number = 42): SimulationState {
	const city = generateCity(config.cityWidth, config.cityHeight, seed);
	const random = seededRandom(seed + 1000);

	const taxis: Taxi[] = [];
	const roadCells: Position[] = [];

	for (let y = 0; y < city.height; y++) {
		for (let x = 0; x < city.width; x++) {
			if (city.grid[y][x] === 'road') {
				roadCells.push({ x, y });
			}
		}
	}

	for (let i = 0; i < config.numTaxis; i++) {
		const idx = Math.floor(random() * roadCells.length);
		taxis.push({
			id: `taxi-${i}`,
			position: { ...roadCells[idx] },
			path: [],
			state: 'idle',
			totalDeliveries: 0,
			totalDistance: 0,
		});
	}

	return {
		city,
		taxis,
		waitingPassengers: [],
		activePassengers: [],
		completedPassengers: [],
		tick: 0,
	};
}

export function cloneSimulationState(state: SimulationState): SimulationState {
	return {
		city: state.city,
		taxis: state.taxis.map(t => ({
			...t,
			position: { ...t.position },
			targetPosition: t.targetPosition ? { ...t.targetPosition } : undefined,
			path: t.path.map(p => ({ ...p })),
			currentPassenger: t.currentPassenger ? { ...t.currentPassenger } : undefined,
		})),
		waitingPassengers: state.waitingPassengers.map(p => ({ ...p })),
		activePassengers: state.activePassengers.map(p => ({ ...p })),
		completedPassengers: state.completedPassengers.map(p => ({ ...p })),
		tick: state.tick,
	};
}

let passengerIdCounter = 0;

export function spawnPassengers(city: City, tick: number, random: () => number): Passenger {
	const pickup = getRandomPickupSpot(city, random);
	const destination = getRandomDifferentPickupSpot(city, pickup, random);

	return {
		id: `passenger-${passengerIdCounter++}`,
		pickup,
		destination,
		spawnTick: tick,
	};
}

export function assignGreedy(state: SimulationState): void {
	const idleTaxis = state.taxis.filter(t => t.state === 'idle');
	const unassignedPassengers = state.waitingPassengers.filter(p => !p.assignedTaxiId);

	let totalDistance = 0;
	let assignmentCount = 0;

	for (const passenger of unassignedPassengers) {
		if (idleTaxis.length === 0) break;

		let closestTaxi: Taxi | null = null;
		let closestDistance = Infinity;

		for (const taxi of idleTaxis) {
			const distance = pathDistance(state.city, taxi.position, passenger.pickup);
			if (distance < closestDistance) {
				closestDistance = distance;
				closestTaxi = taxi;
			}
		}

		if (closestTaxi) {
			passenger.assignedTaxiId = closestTaxi.id;
			closestTaxi.state = 'picking_up';
			closestTaxi.currentPassenger = passenger;
			closestTaxi.targetPosition = passenger.pickup;
			closestTaxi.path = findPath(state.city, closestTaxi.position, passenger.pickup);

			totalDistance += closestDistance;
			assignmentCount++;

			const idx = idleTaxis.indexOf(closestTaxi);
			idleTaxis.splice(idx, 1);
		}
	}

	if (assignmentCount > 0) {
		console.log(`[GREEDY] Assigned ${assignmentCount} taxis, total distance: ${totalDistance}, avg: ${(totalDistance / assignmentCount).toFixed(2)}`);
	}
}

export type OptimizationAssigner = (
	state: SimulationState,
	queueSize: number
) => Array<{ taxiId: string; passengerId: string }>;

export function assignOptimized(
	state: SimulationState,
	queueSize: number,
	optimizer: OptimizationAssigner
): void {
	const assignments = optimizer(state, queueSize);

	for (const { taxiId, passengerId } of assignments) {
		const taxi = state.taxis.find(t => t.id === taxiId);
		const passenger = state.waitingPassengers.find(p => p.id === passengerId);

		if (taxi && passenger && taxi.state === 'idle' && !passenger.assignedTaxiId) {
			passenger.assignedTaxiId = taxi.id;
			taxi.state = 'picking_up';
			taxi.currentPassenger = passenger;
			taxi.targetPosition = passenger.pickup;
			taxi.path = findPath(state.city, taxi.position, passenger.pickup);
		}
	}
}

export function defaultOptimizer(state: SimulationState, queueSize: number): Array<{ taxiId: string; passengerId: string }> {
	const idleTaxis = state.taxis.filter(t => t.state === 'idle');
	const unassignedPassengers = state.waitingPassengers
		.filter(p => !p.assignedTaxiId)

	if (idleTaxis.length === 0 || unassignedPassengers.length < queueSize) {
		return [];
	}

	const n = Math.min(idleTaxis.length, unassignedPassengers.length);
	const costMatrix: number[][] = [];

	for (let i = 0; i < n; i++) {
		costMatrix[i] = [];
		for (let j = 0; j < n; j++) {
			if (i < idleTaxis.length && j < unassignedPassengers.length) {
				costMatrix[i][j] = pathDistance(state.city, idleTaxis[i].position, unassignedPassengers[j].pickup);
			} else {
				costMatrix[i][j] = 0;
			}
		}
	}

	const assignments = hungarianAlgorithm(costMatrix);
	const result: Array<{ taxiId: string; passengerId: string }> = [];

	let totalDistance = 0;
	let assignmentCount = 0;

	for (let i = 0; i < assignments.length; i++) {
		const j = assignments[i];
		if (j >= 0 && i < idleTaxis.length && j < unassignedPassengers.length) {
			result.push({
				taxiId: idleTaxis[i].id,
				passengerId: unassignedPassengers[j].id,
			});
			totalDistance += costMatrix[i][j];
			assignmentCount++;
		}
	}

	if (assignmentCount > 0) {
		console.log(`[OPTIMIZER] Assigned ${assignmentCount} taxis, total distance: ${totalDistance}, avg: ${(totalDistance / assignmentCount).toFixed(2)}`);
		console.log('Cost Matrix:', costMatrix);
		console.log('Assignments (taxi i -> passenger j):', assignments);
	}

	return result;
}

function hungarianAlgorithm(costMatrix: number[][]): number[] {
	const n = costMatrix.length;
	if (n === 0) return [];

	const u = new Array(n + 1).fill(0);
	const v = new Array(n + 1).fill(0);
	const p = new Array(n + 1).fill(0);
	const way = new Array(n + 1).fill(0);

	for (let i = 1; i <= n; i++) {
		p[0] = i;
		let j0 = 0;
		const minv = new Array(n + 1).fill(Infinity);
		const used = new Array(n + 1).fill(false);

		do {
			used[j0] = true;
			const i0 = p[j0];
			let delta = Infinity;
			let j1 = 0;

			for (let j = 1; j <= n; j++) {
				if (!used[j]) {
					const cost = (i0 > 0 && j > 0 && costMatrix[i0 - 1] && costMatrix[i0 - 1][j - 1] !== undefined)
						? costMatrix[i0 - 1][j - 1]
						: 0;
					const cur = cost - u[i0] - v[j];
					if (cur < minv[j]) {
						minv[j] = cur;
						way[j] = j0;
					}
					if (minv[j] < delta) {
						delta = minv[j];
						j1 = j;
					}
				}
			}

			for (let j = 0; j <= n; j++) {
				if (used[j]) {
					u[p[j]] += delta;
					v[j] -= delta;
				} else {
					minv[j] -= delta;
				}
			}

			j0 = j1;
		} while (p[j0] !== 0);

		do {
			const j1 = way[j0];
			p[j0] = p[j1];
			j0 = j1;
		} while (j0);
	}

	const result = new Array(n).fill(-1);
	for (let j = 1; j <= n; j++) {
		if (p[j] > 0) {
			result[p[j] - 1] = j - 1;
		}
	}

	return result;
}

export function tickSimulation(state: SimulationState): void {
	for (const taxi of state.taxis) {
		if (taxi.path.length > 0) {
			taxi.position = taxi.path.shift()!;
			taxi.totalDistance++;

			if (taxi.path.length === 0 && taxi.currentPassenger) {
				if (taxi.state === 'picking_up') {
					taxi.currentPassenger.pickedUpTick = state.tick;
					taxi.state = 'delivering';
					taxi.targetPosition = taxi.currentPassenger.destination;
					taxi.path = findPath(state.city, taxi.position, taxi.currentPassenger.destination);

					const idx = state.waitingPassengers.findIndex(p => p.id === taxi.currentPassenger!.id);
					if (idx >= 0) {
						state.waitingPassengers.splice(idx, 1);
						state.activePassengers.push(taxi.currentPassenger);
					}
				} else if (taxi.state === 'delivering') {
					taxi.currentPassenger.deliveredTick = state.tick;
					taxi.totalDeliveries++;

					const idx = state.activePassengers.findIndex(p => p.id === taxi.currentPassenger!.id);
					if (idx >= 0) {
						state.activePassengers.splice(idx, 1);
						state.completedPassengers.push(taxi.currentPassenger);
					}

					taxi.currentPassenger = undefined;
					taxi.targetPosition = undefined;
					taxi.state = 'idle';
				}
			}
		}
	}

	state.tick++;
}

export function calculateMetrics(state: SimulationState): Metrics {
	const completed = state.completedPassengers;

	let totalWaitTime = 0;
	let totalTripTime = 0;

	for (const p of completed) {
		if (p.pickedUpTick !== undefined) {
			totalWaitTime += p.pickedUpTick - p.spawnTick;
		}
		if (p.deliveredTick !== undefined && p.pickedUpTick !== undefined) {
			totalTripTime += p.deliveredTick - p.pickedUpTick;
		}
	}

	for (const p of state.waitingPassengers) {
		totalWaitTime += state.tick - p.spawnTick;
	}

	const waitingCount = state.waitingPassengers.length;
	const servedCount = completed.length;
	const totalWaiting = waitingCount + servedCount;

	const busyTaxis = state.taxis.filter(t => t.state !== 'idle').length;

	return {
		avgWaitTime: totalWaiting > 0 ? totalWaitTime / totalWaiting : 0,
		avgTripTime: servedCount > 0 ? totalTripTime / servedCount : 0,
		totalPassengersServed: servedCount,
		totalPassengersWaiting: waitingCount,
		avgTaxiUtilization: state.taxis.length > 0 ? busyTaxis / state.taxis.length : 0,
	};
}
