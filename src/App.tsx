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
		return <div style={{ color: '#f1f5f9', padding: 20, fontFamily: '"Inter", system-ui, sans-serif' }}>Loading...</div>;
	}

	const canvasWidth = Math.floor((window.innerWidth - 40) / 2);
	const canvasHeight = window.innerHeight - 80;

	const buttonStyle = (color: string, disabled = false) => ({
		padding: '10px 24px',
		background: color,
		border: 'none',
		borderRadius: '8px',
		color: '#fff',
		cursor: disabled ? 'not-allowed' : 'pointer',
		fontWeight: '600',
		fontSize: '14px',
		fontFamily: '"Inter", system-ui, sans-serif',
		opacity: disabled ? 0.5 : 1,
		transition: 'all 0.2s ease',
		boxShadow: disabled ? 'none' : '0 2px 8px rgba(0, 0, 0, 0.15)',
	});

	return (
		<div style={{
			background: '#0a0e27',
			minHeight: '100vh',
			display: 'flex',
			flexDirection: 'column',
			fontFamily: '"Inter", system-ui, -apple-system, sans-serif',
		}}>
			<div style={{
				display: 'flex',
				gap: 12,
				padding: '16px 24px',
				alignItems: 'center',
				borderBottom: '1px solid #1e293b',
				background: 'linear-gradient(180deg, #0f1420 0%, #0a0e27 100%)',
			}}>
				<button
					onClick={() => setIsRunning(!isRunning)}
					style={buttonStyle(isRunning ? '#ef4444' : '#10b981')}
				>
					{isRunning ? '⏸ Pause' : '▶ Start'}
				</button>
				<button
					onClick={tick}
					disabled={isRunning}
					style={buttonStyle('#06b6d4', isRunning)}
				>
					⏭ Step
				</button>
				<button
					onClick={reset}
					style={buttonStyle('#64748b')}
				>
					↻ Reset
				</button>
				<div style={{
					color: '#94a3b8',
					marginLeft: 12,
					display: 'flex',
					alignItems: 'center',
					gap: 8,
					fontSize: '14px',
					fontWeight: '500',
				}}>
					Speed:
					<select
						value={speed}
						onChange={e => setSpeed(Number(e.target.value))}
						style={{
							padding: '6px 12px',
							background: '#1e293b',
							color: '#f1f5f9',
							border: '1px solid #334155',
							borderRadius: '6px',
							fontSize: '14px',
							fontFamily: '"Inter", system-ui, sans-serif',
							cursor: 'pointer',
							fontWeight: '500',
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
						color: '#fb923c',
						marginLeft: 12,
						fontWeight: '600',
						fontSize: '14px',
						padding: '8px 16px',
						background: 'rgba(251, 146, 60, 0.1)',
						borderRadius: '6px',
						border: '1px solid rgba(251, 146, 60, 0.3)',
					}}>
						📍 Click destination...
					</div>
				)}
				<div style={{
					color: '#64748b',
					marginLeft: 'auto',
					fontSize: '13px',
					fontWeight: '500',
				}}>
					🚕 {CONFIG.numTaxis} Taxis • 📋 Queue {CONFIG.queueSize} • 🗺️ {CONFIG.cityWidth}×{CONFIG.cityHeight}
				</div>
			</div>
			<div style={{
				display: 'flex',
				flex: 1,
				gap: 12,
				padding: 12,
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
