import React, { useRef, useState, useEffect, useCallback } from 'react';
import { useEvent } from '@/hooks';
import { inputSelector, updateValue, useQRScoutState } from '../../store/store';
import { ConfigurableInputProps } from './ConfigurableInput';

// Vertex point definition
export interface VertexPoint {
  x: number;
  y: number;
}

// RoutineRecord data type
export interface ImageDrawData {
  title: string;
  type: 'image-draw';
  code: string;
  required: boolean;
  formResetBehavior: 'reset' | 'preserve';
  defaultValue: VertexPoint[];
  imageUrl?: string;
  disabled?: boolean;
}
const lineWidth = 10;
// // Good but lets keep it simple
// function DrawPolyLineWithGradiant(points: VertexPoint[], ctx: CanvasRenderingContext2D, color1: { r: number, g: number, b: number }, color2: { r: number, g: number, b: number }) {
//   if (points.length > 1) {
//     ctx.lineWidth = lineWidth;

//     for (let i = 1; i < points.length; i++) {
//       const t = i / (points.length - 1); // 0=start, 1=end
//       const r = Math.round(color1.r + (color2.r - color1.r) * t);
//       const g = Math.round(color1.g + (color2.g - color1.g) * t);
//       const b = Math.round(color1.b + (color2.b - color1.b) * t);

//       ctx.strokeStyle = `rgb(${r},${g},${b})`;

//       ctx.beginPath();
//       ctx.moveTo(points[i - 1].x, points[i - 1].y);
//       ctx.lineTo(points[i].x, points[i].y);
//       ctx.stroke();
//     }
//   }
// }
function DrawPolyLineStaticColor(points: VertexPoint[], ctx: CanvasRenderingContext2D, color: { r: number, g: number, b: number }) {
  if (points.length > 0) {
    ctx.strokeStyle = `rgb(${color.r}, ${color.g}, ${color.b})`;
    ctx.lineWidth = lineWidth * 0.75;
    ctx.beginPath();
    ctx.moveTo(points[0].x, points[0].y);
    for (let i = 1; i < points.length; i++) {
      ctx.lineTo(points[i].x, points[i].y);
    }
    ctx.stroke();

    const last = points[points.length - 1];

    ctx.fillStyle = `rgb(${color.r}, ${color.g}, ${color.b})`;
    ctx.beginPath();
    ctx.arc(last.x, last.y, 5, 0, Math.PI * 2); // radius = 5
    ctx.fill();
  }
  
}
export function encodePolyline(points: VertexPoint[]): string {
  let lastX = 0;
  let lastY = 0;
  let result = "";

  for (const p of points) {
    result += encodeValue(p.x - lastX);
    result += encodeValue(p.y - lastY);

    lastX = p.x;
    lastY = p.y;
  }

  return result;

  function encodeValue(value: number): string {
  value <<= 1;
  if (value < 0) value = ~value;

  let encoded = "";

  while (value >= 0x20) {
    encoded += String.fromCharCode((0x20 | (value & 0x1f)) + 63);
    value >>= 5;
  }

  encoded += String.fromCharCode(value + 63);
  return encoded;
}
}
export function decodePolyline(str: string): VertexPoint[] {
  let index = 0;
  let x = 0;
  let y = 0;

  const points: VertexPoint[] = [];

  while (index < str.length) {
    x += decodeValue();
    y += decodeValue();

    points.push({ x, y });
  }

  return points;

  function decodeValue(): number {
    let result = 0;
    let shift = 0;
    let b: number;

    do {
      b = str.charCodeAt(index++) - 63;
      result |= (b & 0x1f) << shift;
      shift += 5;
    } while (b >= 0x20);

    return (result & 1) ? ~(result >> 1) : (result >> 1);
  }
}
export default function ImageDrawInput(props: ConfigurableInputProps) {
  const data = useQRScoutState(inputSelector<ImageDrawData>(props.section, props.code));
  if (!data) return <div>Invalid input</div>;

  const [points, setPoints] = useState<VertexPoint[]>(data.defaultValue || []);
  const [imageLoaded, setImageLoaded] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const ClearButtonRef = useRef<HTMLButtonElement>(null);

  const drawing = useRef(false);
  const backgroundImage = useRef<HTMLImageElement | null>(null);

  // Format points for storage
  const formatPoints = useCallback((pts: VertexPoint[]) => {
    return encodePolyline(pts);
    // return pts.map(p => `${Math.round(p.x)},${Math.round(p.y)}`).join(' ');
  }, []);
  const clearCanvas = useCallback(() => {
    setPoints([]);
  }, []);
  // Draw function
  const drawPath = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Clear canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Draw background
    if (backgroundImage.current) {
      ctx.drawImage(backgroundImage.current, 0, 0, canvas.width, canvas.height);
    }
    // Draw points
    DrawPolyLineStaticColor(points, ctx, {r: 10, g:255, b:10})
    // DrawPolyLineWithGradiant(points, ctx, {r: 10, g:255, b:10}, {r: 10, g:255, b:255})
  }, [points]);

  // Load background image
  useEffect(() => {
    const img = new Image();
    img.src = data.imageUrl || './field.png';
    img.onload = () => {
      backgroundImage.current = img;
      const canvas = canvasRef.current;
      if (canvas) {
        const aspectRatio = img.height / img.width;
        canvas.height = canvas.width * aspectRatio;
      }
      setImageLoaded(true);
      requestAnimationFrame(drawPath);
    };
  }, [data.imageUrl, drawPath]);

  // Update store whenever points change
  useEffect(() => {
    updateValue(props.code, formatPoints(points));
    if (imageLoaded) drawPath();
  }, [points, imageLoaded, drawPath, formatPoints, props.code]);

  // Reset handler
  const resetState = useCallback(
    ({ force }: { force: boolean }) => {
      if (force || data.formResetBehavior !== 'preserve') {
        setPoints([]);
      }
    },
    [data.formResetBehavior]
  );
  useEvent('resetFields', resetState);

  // Add a point
  const addPoint = useCallback((x: number, y: number) => {
    setPoints(prev => [...prev, { x, y }]);
  }, []);

  // Convert client coordinates to canvas
  const getCanvasCoordinates = (clientX: number, clientY: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    return { x: ((clientX - rect.left) / rect.width) * canvas.width, y: ((clientY - rect.top) / rect.height) * canvas.height };
  };

  // Mouse handlers
  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    drawing.current = true;
    const { x, y } = getCanvasCoordinates(e.clientX, e.clientY);
    addPoint(x, y);
  };
  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!drawing.current) return;
    const { x, y } = getCanvasCoordinates(e.clientX, e.clientY);
    addPoint(x, y);
  };
  const handleMouseUp = () => { drawing.current = false; };

  // Touch handlers
  const handleTouchStart = (e: React.TouchEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    drawing.current = true;
    const touch = e.touches[0];
    const { x, y } = getCanvasCoordinates(touch.clientX, touch.clientY);
    addPoint(x, y);
  };
  const handleTouchMove = (e: React.TouchEvent<HTMLCanvasElement>) => {
    if (!drawing.current) return;
    e.preventDefault();
    const touch = e.touches[0];
    const { x, y } = getCanvasCoordinates(touch.clientX, touch.clientY);
    addPoint(x, y);
  };
  const handleTouchEnd = () => { drawing.current = false; };

  return (
    <div>
      <canvas
        ref={canvasRef}
        width={800}   // actual pixel width
        style={{
          border: '0px solid black',
          width: '100%',
          height: 'auto',
          display: 'block',
          cursor: 'crosshair',
          touchAction: 'none'
        }}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      />
      <button
        onClick={clearCanvas}
        ref={ClearButtonRef}
        style={{
          marginTop: '8px',
          padding: `2px 3px`,
          width: "100%",
          textAlign: 'center',
          cursor: 'pointer',
          backgroundColor: 'gray',
          color: 'black',
          fontSize: '20px',
          font: 'Garamond'
        }}
      >
        [ CLEAR ]
      </button>
    </div>
  );
}
