import { useRef, useEffect } from 'react';
import type { SimulationState, Metrics } from './types';

interface CityCanvasProps {
  state: SimulationState;
  metrics: Metrics;
  title: string;
  width: number;
  height: number;
}

const COLORS = {
  background: '#1a1a2e',
  road: '#2d2d44',
  building: '#404060',
  empty: '#1a1a2e',
  taxi: '#ffd93d',
  taxiPickingUp: '#ff6b6b',
  taxiDelivering: '#6bcb77',
  passenger: '#ff6b6b',
  destination: '#4ecdc4',
  text: '#e8e8e8',
  textMuted: '#888899',
};

export function CityCanvas({ state, metrics, title, width, height }: CityCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  
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
    const metricsHeight = 80;
    const titleHeight = 30;
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
    ctx.font = 'bold 16px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(title, width / 2, 22);
    
    for (let y = 0; y < state.city.height; y++) {
      for (let x = 0; x < state.city.width; x++) {
        const cell = state.city.grid[y][x];
        const px = offsetX + x * cellSize;
        const py = offsetY + y * cellSize;
        
        if (cell === 'road') {
          ctx.fillStyle = COLORS.road;
          ctx.fillRect(px, py, cellSize, cellSize);
        } else if (cell === 'building') {
          ctx.fillStyle = COLORS.building;
          const margin = cellSize * 0.1;
          ctx.fillRect(px + margin, py + margin, cellSize - margin * 2, cellSize - margin * 2);
        }
      }
    }
    
    for (const passenger of state.waitingPassengers) {
      const px = offsetX + passenger.pickup.x * cellSize + cellSize / 2;
      const py = offsetY + passenger.pickup.y * cellSize + cellSize / 2;
      
      ctx.fillStyle = COLORS.passenger;
      ctx.beginPath();
      ctx.arc(px, py, cellSize * 0.25, 0, Math.PI * 2);
      ctx.fill();
      
      const dx = offsetX + passenger.destination.x * cellSize + cellSize / 2;
      const dy = offsetY + passenger.destination.y * cellSize + cellSize / 2;
      
      ctx.strokeStyle = COLORS.destination;
      ctx.lineWidth = 1;
      ctx.setLineDash([2, 2]);
      ctx.beginPath();
      ctx.moveTo(px, py);
      ctx.lineTo(dx, dy);
      ctx.stroke();
      ctx.setLineDash([]);
      
      ctx.strokeStyle = COLORS.destination;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(dx, dy, cellSize * 0.2, 0, Math.PI * 2);
      ctx.stroke();
    }
    
    for (const passenger of state.activePassengers) {
      const dx = offsetX + passenger.destination.x * cellSize + cellSize / 2;
      const dy = offsetY + passenger.destination.y * cellSize + cellSize / 2;
      
      ctx.fillStyle = COLORS.destination;
      ctx.beginPath();
      ctx.arc(dx, dy, cellSize * 0.2, 0, Math.PI * 2);
      ctx.fill();
    }
    
    for (const taxi of state.taxis) {
      const px = offsetX + taxi.position.x * cellSize + cellSize / 2;
      const py = offsetY + taxi.position.y * cellSize + cellSize / 2;
      
      if (taxi.state === 'idle') {
        ctx.fillStyle = COLORS.taxi;
      } else if (taxi.state === 'picking_up') {
        ctx.fillStyle = COLORS.taxiPickingUp;
      } else {
        ctx.fillStyle = COLORS.taxiDelivering;
      }
      
      const size = cellSize * 0.35;
      ctx.fillRect(px - size / 2, py - size / 2, size, size);
    }
    
    const metricsY = height - metricsHeight + 10;
    ctx.fillStyle = COLORS.textMuted;
    ctx.font = '11px system-ui, sans-serif';
    ctx.textAlign = 'left';
    
    const col1 = 15;
    const col2 = width / 2 + 10;
    const lineHeight = 16;
    
    ctx.fillText(`Tick: ${state.tick}`, col1, metricsY);
    ctx.fillText(`Waiting: ${metrics.totalPassengersWaiting}`, col1, metricsY + lineHeight);
    ctx.fillText(`Served: ${metrics.totalPassengersServed}`, col1, metricsY + lineHeight * 2);
    ctx.fillText(`Avg Wait: ${metrics.avgWaitTime.toFixed(1)}`, col2, metricsY);
    ctx.fillText(`Avg Trip: ${metrics.avgTripTime.toFixed(1)}`, col2, metricsY + lineHeight);
    ctx.fillText(`Utilization: ${(metrics.avgTaxiUtilization * 100).toFixed(0)}%`, col2, metricsY + lineHeight * 2);
    
    ctx.fillStyle = COLORS.taxi;
    ctx.fillRect(col1, metricsY + lineHeight * 3 + 5, 8, 8);
    ctx.fillStyle = COLORS.textMuted;
    ctx.fillText('Idle', col1 + 12, metricsY + lineHeight * 3 + 12);
    
    ctx.fillStyle = COLORS.taxiPickingUp;
    ctx.fillRect(col1 + 50, metricsY + lineHeight * 3 + 5, 8, 8);
    ctx.fillStyle = COLORS.textMuted;
    ctx.fillText('Pickup', col1 + 62, metricsY + lineHeight * 3 + 12);
    
    ctx.fillStyle = COLORS.taxiDelivering;
    ctx.fillRect(col1 + 115, metricsY + lineHeight * 3 + 5, 8, 8);
    ctx.fillStyle = COLORS.textMuted;
    ctx.fillText('Deliver', col1 + 127, metricsY + lineHeight * 3 + 12);
    
  }, [state, metrics, title, width, height]);
  
  return (
    <canvas
      ref={canvasRef}
      style={{ width, height }}
    />
  );
}
