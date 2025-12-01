import { useState, useEffect, useRef, useCallback } from 'react';
import { CityCanvas } from './CityCanvas';
import type { SimulationState, SimulationConfig, Metrics, Passenger } from './types';
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
	cityWidth: 25,
	cityHeight: 20,
	numTaxis: 5,
	queueSize: 8,
	passengerSpawnChance: 0.7,
	ticksPerSpawnCheck: 1,
	burstChance: 1.0,
	burstMinSize: 3,
	burstMaxSize: 7,
};

const SEED = 12345;
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

function App() {
	const [states, setStates] = useState<SimStates | null>(null);
	const [greedyMetrics, setGreedyMetrics] = useState<Metrics | null>(null);
	const [optimizedMetrics, setOptimizedMetrics] = useState<Metrics | null>(null);
	const [isRunning, setIsRunning] = useState(false);
	const [speed, setSpeed] = useState(1);

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
		setStates(prev => {
			if (!prev) return prev;

			const greedy = cloneSimulationState(prev.greedy);
			const optimized = cloneSimulationState(prev.optimized);

			const newPassengers: Passenger[] = [];
			if (greedy.tick % CONFIG.ticksPerSpawnCheck === 0) {
				const burstRoll = randomRef.current();
				if (burstRoll < CONFIG.burstChance) {
					burstFiredRef.current = true;
					const burstSize = CONFIG.burstMinSize +
						Math.floor(randomRef.current() * (CONFIG.burstMaxSize - CONFIG.burstMinSize + 1));
					for (let i = 0; i < burstSize; i++) {
						newPassengers.push(spawnPassengers(greedy.city, greedy.tick, randomRef.current));
					}
				} else if (randomRef.current() < CONFIG.passengerSpawnChance) {
					newPassengers.push(spawnPassengers(greedy.city, greedy.tick, randomRef.current));
				}
			}

			for (const passenger of newPassengers) {
				greedy.waitingPassengers.push({ ...passenger });
				optimized.waitingPassengers.push({
					...passenger,
					id: passenger.id + '-opt',
					assignedTaxiId: undefined
				});
			}
			console.log("greedy.waitingPassengers: ", greedy.waitingPassengers)
			console.log("optimized.waitingPassengers: ", optimized.waitingPassengers)

			assignGreedy(greedy);
			tickSimulation(greedy);

			assignOptimized(optimized, CONFIG.queueSize, optimizer);
			tickSimulation(optimized);

			setGreedyMetrics(calculateMetrics(greedy));
			setOptimizedMetrics(calculateMetrics(optimized));

			return { greedy, optimized };
		});
	}, []);

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

		const greedy = createSimulation(CONFIG, SEED);
		const optimized = cloneSimulationState(greedy);

		setStates({ greedy, optimized });
		setGreedyMetrics(calculateMetrics(greedy));
		setOptimizedMetrics(calculateMetrics(optimized));
	};

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
				/>
				<CityCanvas
					state={states.optimized}
					metrics={optimizedMetrics}
					title="Optimized Assignment (Hungarian)"
					width={canvasWidth}
					height={canvasHeight}
				/>
			</div>
		</div>
	);
}

export default App;
