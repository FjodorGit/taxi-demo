import { useState, useEffect, useRef, useCallback } from 'react';
import { CityCanvas } from './CityCanvas';
import type { SimulationState, SimulationConfig, Metrics, Passenger, Position } from './types';
import {
	createSimulation,
	cloneSimulationState,
	spawnPassengers,
	assignGreedy,
	assignOptimized,
	defaultOptimizer,
	tickSimulation,
	calculateMetrics,
	type OptimizationAssigner,
} from './simulation';

const CONFIG: SimulationConfig = {
	cityWidth: 40,
	cityHeight: 36,
	numTaxis: 12,
	queueSize: 12,
	passengerSpawnChance: 0.7,
	ticksPerSpawnCheck: 5,
	burstChance: 0.1,
	burstMinSize: 4,
	burstMaxSize: 11,
};

const SEED = 12344;
const TICK_INTERVAL_MS = 100;

function seededRandom(seed: number): () => number {
	return () => {
		seed = (seed * 1103515245 + 12345) & 0x7fffffff;
		return seed / 0x7fffffff;
	};
}

export const optimizer: OptimizationAssigner = defaultOptimizer;

interface SimStates {
	greedy: SimulationState;
	optimized: SimulationState;
}

let manualPassengerIdCounter = 0;

function App() {
	const [states, setStates] = useState<SimStates | null>(null);
	const [greedyMetrics, setGreedyMetrics] = useState<Metrics | null>(null);
	const [optimizedMetrics, setOptimizedMetrics] = useState<Metrics | null>(null);
	const [isRunning, setIsRunning] = useState(false);
	const [speed, setSpeed] = useState(1);
	const [pendingPickup, setPendingPickup] = useState<Position | null>(null);

	const randomRef = useRef(seededRandom(SEED + 5000));
	const intervalRef = useRef<number | null>(null);
	const burstFiredRef = useRef(false);

	useEffect(() => {
		const greedy = createSimulation(CONFIG, SEED);
		const optimized = cloneSimulationState(greedy);

		setStates({ greedy, optimized });
		setGreedyMetrics(calculateMetrics(greedy));
		setOptimizedMetrics(calculateMetrics(optimized));
	}, []);

	const tick = useCallback(() => {
		if (!states) return;

		const newPassengers: Passenger[] = [];
		if (states.greedy.tick % CONFIG.ticksPerSpawnCheck === 0) {
			const burstRoll = randomRef.current();
			if (!burstFiredRef.current && burstRoll < CONFIG.burstChance) {
				const burstSize = CONFIG.burstMinSize +
					Math.floor(randomRef.current() * (CONFIG.burstMaxSize - CONFIG.burstMinSize + 1));
				for (let i = 0; i < burstSize; i++) {
					newPassengers.push(spawnPassengers(states.greedy.city, states.greedy.tick, randomRef.current));
				}
			} else if (randomRef.current() < CONFIG.passengerSpawnChance) {
				newPassengers.push(spawnPassengers(states.greedy.city, states.greedy.tick, randomRef.current));
			}
		}

		setStates(prev => {
			if (!prev) return prev;

			const greedy = cloneSimulationState(prev.greedy);
			const optimized = cloneSimulationState(prev.optimized);

			tickSimulation(greedy);
			tickSimulation(optimized);

			for (const passenger of newPassengers) {
				greedy.waitingPassengers.push({ ...passenger });
				optimized.waitingPassengers.push({
					...passenger,
					id: passenger.id + '-opt',
					assignedTaxiId: undefined
				});
			}

			assignGreedy(greedy);
			assignOptimized(optimized, CONFIG.queueSize, optimizer);

			for (const p of greedy.waitingPassengers) {
				if (!p.assignedTaxiId && (greedy.tick - p.spawnTick) > 100) {
					console.error(`[GREEDY] Passenger ${p.id} stuck waiting for ${greedy.tick - p.spawnTick} ticks at (${p.pickup.x}, ${p.pickup.y})`);
				}
			}

			for (const p of optimized.waitingPassengers) {
				if (!p.assignedTaxiId && (optimized.tick - p.spawnTick) > 100) {
					console.error(`[OPTIMIZER] Passenger ${p.id} stuck waiting for ${optimized.tick - p.spawnTick} ticks at (${p.pickup.x}, ${p.pickup.y})`);
				}
			}

			setGreedyMetrics(calculateMetrics(greedy));
			setOptimizedMetrics(calculateMetrics(optimized));

			return { greedy, optimized };
		});
	}, [states]);

	useEffect(() => {
		if (isRunning) {
			intervalRef.current = window.setInterval(tick, TICK_INTERVAL_MS / speed);
		} else if (intervalRef.current) {
			clearInterval(intervalRef.current);
			intervalRef.current = null;
		}

		return () => {
			if (intervalRef.current) {
				clearInterval(intervalRef.current);
			}
		};
	}, [isRunning, speed, tick]);

	const reset = () => {
		setIsRunning(false);
		randomRef.current = seededRandom(SEED + 5000);
		burstFiredRef.current = false;
		setPendingPickup(null);

		const greedy = createSimulation(CONFIG, SEED);
		const optimized = cloneSimulationState(greedy);

		setStates({ greedy, optimized });
		setGreedyMetrics(calculateMetrics(greedy));
		setOptimizedMetrics(calculateMetrics(optimized));
	};

	const handleCellClick = useCallback((position: Position) => {
		if (!states) return;

		if (!pendingPickup) {
			setPendingPickup(position);
		} else {
			if (position.x === pendingPickup.x && position.y === pendingPickup.y) {
				setPendingPickup(null);
				return;
			}

			const manualPassenger: Passenger = {
				id: `manual-${manualPassengerIdCounter++}`,
				pickup: pendingPickup,
				destination: position,
				spawnTick: states.greedy.tick,
			};

			setStates(prev => {
				if (!prev) return prev;

				const greedy = cloneSimulationState(prev.greedy);
				const optimized = cloneSimulationState(prev.optimized);

				greedy.waitingPassengers.push({ ...manualPassenger });
				optimized.waitingPassengers.push({
					...manualPassenger,
					id: manualPassenger.id + '-opt',
					assignedTaxiId: undefined
				});

				assignGreedy(greedy);
				assignOptimized(optimized, CONFIG.queueSize, optimizer);

				setGreedyMetrics(calculateMetrics(greedy));
				setOptimizedMetrics(calculateMetrics(optimized));

				return { greedy, optimized };
			});

			setPendingPickup(null);
		}
	}, [states, pendingPickup]);

	if (!states || !greedyMetrics || !optimizedMetrics) {
		return <div style={{ color: '#fff', padding: 20 }}>Loading...</div>;
	}

	const canvasWidth = Math.floor((window.innerWidth - 40) / 2);
	const canvasHeight = window.innerHeight - 80;

	return (
		<div style={{
			background: '#0f0f1a',
			minHeight: '100vh',
			display: 'flex',
			flexDirection: 'column',
		}}>
			<div style={{
				display: 'flex',
				gap: 10,
				padding: '10px 20px',
				alignItems: 'center',
				borderBottom: '1px solid #2d2d44',
			}}>
				<button
					onClick={() => setIsRunning(!isRunning)}
					style={{
						padding: '8px 20px',
						background: isRunning ? '#ff6b6b' : '#6bcb77',
						border: 'none',
						borderRadius: 4,
						color: '#fff',
						cursor: 'pointer',
						fontWeight: 'bold',
					}}
				>
					{isRunning ? 'Pause' : 'Start'}
				</button>
				<button
					onClick={tick}
					disabled={isRunning}
					style={{
						padding: '8px 20px',
						background: '#4ecdc4',
						border: 'none',
						borderRadius: 4,
						color: '#fff',
						cursor: isRunning ? 'not-allowed' : 'pointer',
						opacity: isRunning ? 0.5 : 1,
					}}
				>
					Step
				</button>
				<button
					onClick={reset}
					style={{
						padding: '8px 20px',
						background: '#888899',
						border: 'none',
						borderRadius: 4,
						color: '#fff',
						cursor: 'pointer',
					}}
				>
					Reset
				</button>
				<div style={{ color: '#888899', marginLeft: 10 }}>
					Speed:
					<select
						value={speed}
						onChange={e => setSpeed(Number(e.target.value))}
						style={{
							marginLeft: 5,
							padding: '4px 8px',
							background: '#2d2d44',
							color: '#fff',
							border: '1px solid #404060',
							borderRadius: 4,
						}}
					>
						<option value={0.5}>0.5x</option>
						<option value={1}>1x</option>
						<option value={2}>2x</option>
						<option value={4}>4x</option>
						<option value={8}>8x</option>
					</select>
				</div>
				{pendingPickup && (
					<div style={{
						color: '#ffa500',
						marginLeft: 10,
						fontWeight: 'bold',
					}}>
						Click destination...
					</div>
				)}
				<div style={{ color: '#888899', marginLeft: 'auto', fontSize: 12 }}>
					Taxis: {CONFIG.numTaxis} | Queue Size: {CONFIG.queueSize} | City: {CONFIG.cityWidth}x{CONFIG.cityHeight}
				</div>
			</div>
			<div style={{
				display: 'flex',
				flex: 1,
				gap: 10,
				padding: 10,
			}}>
				<CityCanvas
					state={states.greedy}
					metrics={greedyMetrics}
					title="Greedy Assignment (Nearest Taxi)"
					width={canvasWidth}
					height={canvasHeight}
					onCellClick={handleCellClick}
					pendingPickup={pendingPickup}
				/>
				<CityCanvas
					state={states.optimized}
					metrics={optimizedMetrics}
					title="Optimized Assignment"
					width={canvasWidth}
					height={canvasHeight}
					onCellClick={handleCellClick}
					pendingPickup={pendingPickup}
				/>
			</div>
		</div>
	);
}

export default App;
