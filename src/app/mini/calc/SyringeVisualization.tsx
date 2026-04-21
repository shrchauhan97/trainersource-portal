'use client';

interface Props {
  drawUpUnits: number;
  warning?: string | null;
}

const SVG_W = 320;
const SVG_H = 120;
const BARREL_X = 20;
const BARREL_Y = 40;
const BARREL_W = 240;
const BARREL_H = 40;

export default function SyringeVisualization({ drawUpUnits, warning }: Props) {
  const unitsClamped = Math.max(0, Math.min(100, drawUpUnits));
  const fillW = (BARREL_W * unitsClamped) / 100;
  const markerX = BARREL_X + fillW;
  const fillColor = warning ? '#f59e0b' : '#60a5fa';

  const ticks = Array.from({ length: 11 }, (_, i) => i * 10);

  return (
    <div className="w-full">
      <svg
        viewBox={`0 0 ${SVG_W} ${SVG_H}`}
        role="img"
        aria-label={`Insulin syringe showing ${drawUpUnits.toFixed(1)} units`}
        className="w-full h-auto"
      >
        <rect
          x={4}
          y={BARREL_Y - 6}
          width={12}
          height={BARREL_H + 12}
          rx={2}
          fill="#94a3b8"
        />
        <rect
          x={BARREL_X}
          y={BARREL_Y}
          width={BARREL_W}
          height={BARREL_H}
          fill="#1e293b"
          stroke="#475569"
          strokeWidth={1}
          rx={2}
        />
        <rect
          x={BARREL_X}
          y={BARREL_Y + 2}
          width={fillW}
          height={BARREL_H - 4}
          fill={fillColor}
          fillOpacity={0.7}
        />
        {ticks.map((u) => {
          const x = BARREL_X + (BARREL_W * u) / 100;
          const isMajor = u % 20 === 0;
          return (
            <g key={u}>
              <line
                x1={x}
                y1={BARREL_Y}
                x2={x}
                y2={BARREL_Y + (isMajor ? 14 : 8)}
                stroke="#94a3b8"
                strokeWidth={1}
              />
              {isMajor && (
                <text
                  x={x}
                  y={BARREL_Y - 4}
                  textAnchor="middle"
                  fontSize={10}
                  fill="#cbd5e1"
                >
                  {u}
                </text>
              )}
            </g>
          );
        })}
        <rect
          x={BARREL_X + BARREL_W}
          y={BARREL_Y + BARREL_H / 2 - 1}
          width={50}
          height={2}
          fill="#94a3b8"
        />
        <polygon
          points={`${BARREL_X + BARREL_W + 50},${BARREL_Y + BARREL_H / 2 - 2} ${BARREL_X + BARREL_W + 58},${BARREL_Y + BARREL_H / 2} ${BARREL_X + BARREL_W + 50},${BARREL_Y + BARREL_H / 2 + 2}`}
          fill="#94a3b8"
        />
        <g>
          <line
            x1={markerX}
            y1={BARREL_Y - 12}
            x2={markerX}
            y2={BARREL_Y + BARREL_H + 12}
            stroke="#f43f5e"
            strokeWidth={2}
            strokeDasharray="3,2"
          />
          <polygon
            points={`${markerX - 6},${BARREL_Y + BARREL_H + 12} ${markerX + 6},${BARREL_Y + BARREL_H + 12} ${markerX},${BARREL_Y + BARREL_H + 6}`}
            fill="#f43f5e"
          />
          <text
            x={markerX}
            y={BARREL_Y + BARREL_H + 26}
            textAnchor="middle"
            fontSize={11}
            fill="#f43f5e"
            fontWeight={700}
          >
            {drawUpUnits.toFixed(1)}u
          </text>
        </g>
      </svg>
    </div>
  );
}
