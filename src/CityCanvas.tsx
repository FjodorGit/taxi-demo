import { useRef, useEffect, useState } from 'react';
import type { SimulationState, Metrics, Position } from './types';

interface CityCanvasProps {
  state: SimulationState;
  metrics: Metrics;
  title: string;
  width: number;
  height: number;
  onCellClick?: (position: Position) => void;
  pendingPickup?: Position | null;
}

const COLORS = {
  background: '#0a0e27',
  road: '#1e293b',
  building: '#334155',
  buildingAccent: '#475569',
  taxi: '#fbbf24',
  taxiPickingUp: '#f87171',
  taxiDelivering: '#34d399',
  passenger: '#ec4899',
  destination: '#06b6d4',
  highlight: '#fb923c',
  highlightGlow: 'rgba(251, 146, 60, 0.3)',
};

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number
) {
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + width - radius, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
  ctx.lineTo(x + width, y + height - radius);
  ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
  ctx.lineTo(x + radius, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
  ctx.lineTo(x, y + radius);
  ctx.quadraticCurveTo(x, y, x + radius, y);
  ctx.closePath();
}

function GridCanvas({ state, width, height, onCellClick, pendingPickup }: CityCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [animationTime, setAnimationTime] = useState(0);
  
  useEffect(() => {
    const interval = setInterval(() => {
      setAnimationTime(t => t + 0.05);
    }, 50);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    
    const dpr = window.devicePixelRatio || 1;
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    ctx.scale(dpr, dpr);
    
    const padding = 8;
    const availableWidth = width - padding * 2;
    const availableHeight = height - padding * 2;
    
    const cellWidth = availableWidth / state.city.width;
    const cellHeight = availableHeight / state.city.height;
    const cellSize = Math.min(cellWidth, cellHeight);
    
    const gridWidth = cellSize * state.city.width;
    const gridHeight = cellSize * state.city.height;
    const offsetX = (width - gridWidth) / 2;
    const offsetY = (height - gridHeight) / 2;
    
    ctx.fillStyle = COLORS.background;
    ctx.fillRect(0, 0, width, height);
    
    for (let y = 0; y < state.city.height; y++) {
      for (let x = 0; x < state.city.width; x++) {
        const cell = state.city.grid[y][x];
        const px = offsetX + x * cellSize;
        const py = offsetY + y * cellSize;
        
        if (cell === 'road') {
          ctx.fillStyle = COLORS.road;
          roundRect(ctx, px + 0.5, py + 0.5, cellSize - 1, cellSize - 1, cellSize * 0.1);
          ctx.fill();
        } else if (cell === 'building') {
          const variation = ((x * 7 + y * 13) % 3) / 10;
          ctx.fillStyle = variation > 0.6 ? COLORS.buildingAccent : COLORS.building;
          const margin = cellSize * 0.12;
          roundRect(
            ctx,
            px + margin,
            py + margin,
            cellSize - margin * 2,
            cellSize - margin * 2,
            cellSize * 0.15
          );
          ctx.fill();
        }
      }
    }
    
    if (pendingPickup) {
      const px = offsetX + pendingPickup.x * cellSize;
      const py = offsetY + pendingPickup.y * cellSize;
      
      const pulseScale = 1 + Math.sin(animationTime * 3) * 0.1;
      const glowRadius = cellSize * 0.6 * pulseScale;
      
      const gradient = ctx.createRadialGradient(
        px + cellSize / 2,
        py + cellSize / 2,
        cellSize * 0.2,
        px + cellSize / 2,
        py + cellSize / 2,
        glowRadius
      );
      gradient.addColorStop(0, COLORS.highlightGlow);
      gradient.addColorStop(1, 'rgba(251, 146, 60, 0)');
      
      ctx.fillStyle = gradient;
      ctx.fillRect(px - cellSize * 0.2, py - cellSize * 0.2, cellSize * 1.4, cellSize * 1.4);
      
      ctx.strokeStyle = COLORS.highlight;
      ctx.lineWidth = 3;
      roundRect(ctx, px + 1, py + 1, cellSize - 2, cellSize - 2, cellSize * 0.15);
      ctx.stroke();
    }
    
    ctx.strokeStyle = COLORS.destination;
    ctx.lineWidth = 1.5;
    ctx.setLineDash([3, 3]);
    for (const passenger of state.waitingPassengers) {
      const px = offsetX + passenger.pickup.x * cellSize + cellSize / 2;
      const py = offsetY + passenger.pickup.y * cellSize + cellSize / 2;
      const dx = offsetX + passenger.destination.x * cellSize + cellSize / 2;
      const dy = offsetY + passenger.destination.y * cellSize + cellSize / 2;
      
      ctx.beginPath();
      ctx.moveTo(px, py);
      ctx.lineTo(dx, dy);
      ctx.stroke();
    }
    ctx.setLineDash([]);
    
    for (const passenger of state.waitingPassengers) {
      const dx = offsetX + passenger.destination.x * cellSize + cellSize / 2;
      const dy = offsetY + passenger.destination.y * cellSize + cellSize / 2;
      
      ctx.strokeStyle = COLORS.destination;
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.arc(dx, dy, cellSize * 0.22, 0, Math.PI * 2);
      ctx.stroke();
    }
    
    for (const passenger of state.waitingPassengers) {
      const px = offsetX + passenger.pickup.x * cellSize + cellSize / 2;
      const py = offsetY + passenger.pickup.y * cellSize + cellSize / 2;
      
      const pulse = 1 + Math.sin(animationTime * 2) * 0.15;
      const radius = cellSize * 0.28 * pulse;
      
      ctx.fillStyle = COLORS.passenger;
      ctx.beginPath();
      ctx.arc(px, py, radius, 0, Math.PI * 2);
      ctx.fill();
    }
    
    for (const passenger of state.activePassengers) {
      const dx = offsetX + passenger.destination.x * cellSize + cellSize / 2;
      const dy = offsetY + passenger.destination.y * cellSize + cellSize / 2;
      
      ctx.fillStyle = COLORS.destination;
      ctx.beginPath();
      ctx.arc(dx, dy, cellSize * 0.22, 0, Math.PI * 2);
      ctx.fill();
    }
    
    for (let i = 0; i < state.taxis.length; i++) {
      const taxi = state.taxis[i];
      const px = offsetX + taxi.position.x * cellSize + cellSize / 2;
      const py = offsetY + taxi.position.y * cellSize + cellSize / 2;
      
      if (taxi.state === 'idle') {
        ctx.fillStyle = COLORS.taxi;
      } else if (taxi.state === 'picking_up') {
        ctx.fillStyle = COLORS.taxiPickingUp;
      } else {
        ctx.fillStyle = COLORS.taxiDelivering;
      }
      
      const size = cellSize * 0.38;
      roundRect(ctx, px - size / 2, py - size / 2, size, size, size * 0.25);
      ctx.fill();
    }
    
  }, [state, width, height, pendingPickup, animationTime]);
  
  const handleClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!onCellClick) return;
    
    const canvas = canvasRef.current;
    if (!canvas) return;
    
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    
    const padding = 8;
    const availableWidth = width - padding * 2;
    const availableHeight = height - padding * 2;
    
    const cellWidth = availableWidth / state.city.width;
    const cellHeight = availableHeight / state.city.height;
    const cellSize = Math.min(cellWidth, cellHeight);
    
    const gridWidth = cellSize * state.city.width;
    const gridHeight = cellSize * state.city.height;
    const offsetX = (width - gridWidth) / 2;
    const offsetY = (height - gridHeight) / 2;
    
    const gridX = Math.floor((x - offsetX) / cellSize);
    const gridY = Math.floor((y - offsetY) / cellSize);
    
    if (gridX >= 0 && gridX < state.city.width && gridY >= 0 && gridY < state.city.height) {
      if (state.city.grid[gridY][gridX] === 'road') {
        onCellClick({ x: gridX, y: gridY });
      }
    }
  };
  
  return (
    <canvas
      ref={canvasRef}
      style={{ 
        width, 
        height, 
        cursor: onCellClick ? 'pointer' : 'default',
        borderRadius: '8px',
      }}
      onClick={handleClick}
    />
  );
}

export function CityCanvas({ state, metrics, title, width, height, onCellClick, pendingPickup }: CityCanvasProps) {
  const titleHeight = 32;
  const metricsHeight = 100;
  const gap = 8;
  const canvasHeight = height - titleHeight - metricsHeight - gap * 2;
  
  return (
    <div style={{
      width,
      height,
      display: 'flex',
      flexDirection: 'column',
      gap: `${gap}px`,
      fontFamily: '"Inter", system-ui, -apple-system, sans-serif',
    }}>
      <div style={{
        fontSize: '16px',
        fontWeight: '600',
        color: '#f1f5f9',
        textAlign: 'center',
        height: `${titleHeight}px`,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}>
        {title}
      </div>
      
      <GridCanvas 
        state={state}
        metrics={metrics}
        title={title}
        width={width}
        height={canvasHeight}
        onCellClick={onCellClick}
        pendingPickup={pendingPickup}
      />
      
      <div style={{
        background: 'rgba(30, 41, 59, 0.5)',
        borderRadius: '8px',
        padding: '12px',
        height: `${metricsHeight}px`,
        display: 'flex',
        flexDirection: 'column',
        gap: '10px',
      }}>
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(6, 1fr)',
          gap: '8px',
          flex: 1,
        }}>
          <MetricCard label="Tick" value={state.tick} />
          <MetricCard label="Waiting" value={metrics.totalPassengersWaiting} />
          <MetricCard label="Served" value={metrics.totalPassengersServed} />
          <MetricCard label="Avg Wait" value={metrics.avgWaitTime.toFixed(1)} />
          <MetricCard label="Avg Trip" value={metrics.avgTripTime.toFixed(1)} />
          <MetricCard label="Util" value={`${(metrics.avgTaxiUtilization * 100).toFixed(0)}%`} />
        </div>
        
        <div style={{
          display: 'flex',
          justifyContent: 'center',
          gap: '20px',
          paddingTop: '6px',
          borderTop: '1px solid rgba(148, 163, 184, 0.2)',
        }}>
          <LegendItem color="#fbbf24" label="Idle" />
          <LegendItem color="#f87171" label="Picking Up" />
          <LegendItem color="#34d399" label="Delivering" />
        </div>
      </div>
    </div>
  );
}

function MetricCard({ label, value }: { label: string; value: string | number }) {
  return (
    <div style={{
      background: 'rgba(15, 23, 42, 0.6)',
      borderRadius: '6px',
      padding: '6px 8px',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      gap: '2px',
    }}>
      <div style={{
        fontSize: '10px',
        color: '#94a3b8',
        fontWeight: '500',
        textTransform: 'uppercase',
        letterSpacing: '0.5px',
      }}>
        {label}
      </div>
      <div style={{
        fontSize: '16px',
        color: '#f1f5f9',
        fontWeight: '700',
        lineHeight: '1',
      }}>
        {value}
      </div>
    </div>
  );
}

function LegendItem({ color, label }: { color: string; label: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
      <div style={{
        width: '10px',
        height: '10px',
        backgroundColor: color,
        borderRadius: '2.5px',
      }} />
      <span style={{ 
        color: '#94a3b8', 
        fontWeight: '500',
        fontSize: '11px',
      }}>
        {label}
      </span>
    </div>
  );
}
