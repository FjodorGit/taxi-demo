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
  empty: '#0a0e27',
  taxi: '#fbbf24',
  taxiPickingUp: '#f87171',
  taxiDelivering: '#34d399',
  passenger: '#ec4899',
  destination: '#06b6d4',
  text: '#f1f5f9',
  textMuted: '#94a3b8',
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

export function CityCanvas({ state, metrics, title, width, height, onCellClick, pendingPickup }: CityCanvasProps) {
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
    
    const padding = 20;
    const metricsHeight = 85;
    const titleHeight = 40;
    const availableWidth = width - padding * 2;
    const availableHeight = height - padding * 2 - metricsHeight - titleHeight;
    
    const cellWidth = availableWidth / state.city.width;
    const cellHeight = availableHeight / state.city.height;
    const cellSize = Math.min(cellWidth, cellHeight);
    
    const gridWidth = cellSize * state.city.width;
    const gridHeight = cellSize * state.city.height;
    const offsetX = (width - gridWidth) / 2;
    const offsetY = titleHeight + (availableHeight - gridHeight) / 2 + padding;
    
    ctx.fillStyle = COLORS.background;
    ctx.fillRect(0, 0, width, height);
    
    ctx.fillStyle = COLORS.text;
    ctx.font = '600 18px "Inter", system-ui, -apple-system, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(title, width / 2, 28);
    
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
    
    for (const passenger of state.waitingPassengers) {
      const px = offsetX + passenger.pickup.x * cellSize + cellSize / 2;
      const py = offsetY + passenger.pickup.y * cellSize + cellSize / 2;
      
      const pulse = 1 + Math.sin(animationTime * 2) * 0.15;
      const radius = cellSize * 0.28 * pulse;
      
      ctx.fillStyle = COLORS.passenger;
      ctx.beginPath();
      ctx.arc(px, py, radius, 0, Math.PI * 2);
      ctx.fill();
      
      const dx = offsetX + passenger.destination.x * cellSize + cellSize / 2;
      const dy = offsetY + passenger.destination.y * cellSize + cellSize / 2;
      
      ctx.strokeStyle = COLORS.destination;
      ctx.lineWidth = 1.5;
      ctx.setLineDash([3, 3]);
      ctx.beginPath();
      ctx.moveTo(px, py);
      ctx.lineTo(dx, dy);
      ctx.stroke();
      ctx.setLineDash([]);
      
      ctx.strokeStyle = COLORS.destination;
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.arc(dx, dy, cellSize * 0.22, 0, Math.PI * 2);
      ctx.stroke();
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
    
    const metricsY = height - metricsHeight + 12;
    ctx.fillStyle = COLORS.textMuted;
    ctx.font = '500 12px "Inter", system-ui, sans-serif';
    ctx.textAlign = 'left';
    
    const col1 = 20;
    const col2 = width / 2 + 15;
    const lineHeight = 18;
    
    ctx.fillStyle = COLORS.text;
    ctx.font = '600 13px "Inter", system-ui, sans-serif';
    ctx.fillText(`Tick ${state.tick}`, col1, metricsY);
    
    ctx.fillStyle = COLORS.textMuted;
    ctx.font = '500 12px "Inter", system-ui, sans-serif';
    ctx.fillText(`Waiting: ${metrics.totalPassengersWaiting}`, col1, metricsY + lineHeight);
    ctx.fillText(`Served: ${metrics.totalPassengersServed}`, col1, metricsY + lineHeight * 2);
    ctx.fillText(`Avg Wait: ${metrics.avgWaitTime.toFixed(1)}`, col2, metricsY + lineHeight);
    ctx.fillText(`Avg Trip: ${metrics.avgTripTime.toFixed(1)}`, col2, metricsY + lineHeight * 2);
    
    const legendY = metricsY + lineHeight * 2.8;
    ctx.font = '500 11px "Inter", system-ui, sans-serif';
    
    ctx.fillStyle = COLORS.taxi;
    roundRect(ctx, col1, legendY, 9, 9, 2);
    ctx.fill();
    ctx.fillStyle = COLORS.textMuted;
    ctx.fillText('Idle', col1 + 14, legendY + 7);
    
    ctx.fillStyle = COLORS.taxiPickingUp;
    roundRect(ctx, col1 + 42, legendY, 9, 9, 2);
    ctx.fill();
    ctx.fillStyle = COLORS.textMuted;
    ctx.fillText('Pickup', col1 + 56, legendY + 7);
    
    ctx.fillStyle = COLORS.taxiDelivering;
    roundRect(ctx, col1 + 100, legendY, 9, 9, 2);
    ctx.fill();
    ctx.fillStyle = COLORS.textMuted;
    ctx.fillText('Deliver', col1 + 114, legendY + 7);
    
    ctx.fillText(`Utilization: ${(metrics.avgTaxiUtilization * 100).toFixed(0)}%`, col2, legendY + 7);
    
  }, [state, metrics, title, width, height, pendingPickup, animationTime]);
  
  const handleClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!onCellClick) return;
    
    const canvas = canvasRef.current;
    if (!canvas) return;
    
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    
    const padding = 20;
    const metricsHeight = 85;
    const titleHeight = 40;
    const availableWidth = width - padding * 2;
    const availableHeight = height - padding * 2 - metricsHeight - titleHeight;
    
    const cellWidth = availableWidth / state.city.width;
    const cellHeight = availableHeight / state.city.height;
    const cellSize = Math.min(cellWidth, cellHeight);
    
    const gridWidth = cellSize * state.city.width;
    const gridHeight = cellSize * state.city.height;
    const offsetX = (width - gridWidth) / 2;
    const offsetY = titleHeight + (availableHeight - gridHeight) / 2 + padding;
    
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
        borderRadius: '12px',
      }}
      onClick={handleClick}
    />
  );
}
