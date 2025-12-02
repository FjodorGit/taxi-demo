export type CellType = 'road' | 'building' | 'empty';

export interface Position {
	x: number;
	y: number;
}

export interface Passenger {
	id: string;
	pickup: Position;
	destination: Position;
	spawnTick: number;
	pickedUpTick?: number;
	deliveredTick?: number;
	assignedTaxiId?: string;
}

export interface Taxi {
	id: string;
	position: Position;
	targetPosition?: Position;
	path: Position[];
	currentPassenger?: Passenger;
	state: 'idle' | 'picking_up' | 'delivering';
	totalDeliveries: number;
	totalDistance: number;
}

export interface City {
	grid: CellType[][];
	width: number;
	height: number;
	pickupSpots: Position[];
}

export interface SimulationState {
	city: City;
	taxis: Taxi[];
	waitingPassengers: Passenger[];
	activePassengers: Passenger[];
	completedPassengers: Passenger[];
	tick: number;
}

export interface Metrics {
	avgWaitTime: number;
	avgTripTime: number;
	totalPassengersServed: number;
	totalPassengersWaiting: number;
	avgTaxiUtilization: number;
}

export interface SimulationConfig {
	cityWidth: number;
	cityHeight: number;
	numTaxis: number;
	queueSize: number;
	passengerSpawnChance: number;
	ticksPerSpawnCheck: number;
	burstChance: number;
	burstMinSize: number;
	burstMaxSize: number;
}
