"use client";

import { useState } from "react";
import type { DailyCount } from "@/lib/dashboard-queries";

// Geometria do gráfico (unidades do viewBox; o SVG escala com a largura).
const W = 640;
const H = 220;
const PAD = { top: 16, right: 12, bottom: 28, left: 32 };
const PLOT_W = W - PAD.left - PAD.right;
const PLOT_H = H - PAD.top - PAD.bottom;
const MAX_BAR = 24; // espessura máxima da coluna (guia: <= 24px)
const GAP = 2; // vão de 2px entre colunas vizinhas
const RADIUS = 4; // 4px arredondado na ponta, reto na base

/** Teto "limpo" do eixo (múltiplo de 1, 2, 5 ou 10) e os ticks inteiros. */
function niceAxis(max: number) {
  const top = Math.max(max, 1);
  const step = [1, 2, 5, 10, 20, 50].find((s) => top / s <= 4) ?? 100;
  const ceil = Math.ceil(top / step) * step;
  const ticks: number[] = [];
  for (let v = 0; v <= ceil; v += step) ticks.push(v);
  return { ceil, ticks };
}

/** Coluna com a base reta e a ponta arredondada (4px). */
function columnPath(x: number, y: number, w: number, h: number) {
  const r = Math.min(RADIUS, w / 2, h);
  const b = y + h;
  return `M${x},${b} V${y + r} Q${x},${y} ${x + r},${y} H${x + w - r} Q${x + w},${y} ${x + w},${y + r} V${b} Z`;
}

export function DailyChart({
  data,
  title,
}: {
  data: DailyCount[];
  title: string;
}) {
  const [active, setActive] = useState<number | null>(null);

  const max = Math.max(...data.map((d) => d.count), 0);
  const { ceil, ticks } = niceAxis(max);
  const slot = PLOT_W / data.length;
  const barW = Math.min(MAX_BAR, slot - GAP);
  const y = (v: number) => PAD.top + PLOT_H - (v / ceil) * PLOT_H;
  const peak = max > 0 ? data.findIndex((d) => d.count === max) : -1;
  const total = data.reduce((a, d) => a + d.count, 0);

  const show = active !== null ? data[active] : null;
  // Posição do tooltip em % do contêiner, para acompanhar o SVG responsivo.
  // Limitada às bordas (12%-88%) para o tooltip nunca vazar do cartão.
  const tipLeft =
    active !== null
      ? Math.min(
          88,
          Math.max(12, ((PAD.left + slot * active + slot / 2) / W) * 100),
        )
      : 0;

  return (
    <div className="space-y-2">
      <div className="relative">
        <svg
          viewBox={`0 0 ${W} ${H}`}
          role="img"
          aria-label={`${title}. Total de ${total} chamados em ${data.length} dias.`}
          className="h-auto w-full"
        >
          {/* grade e eixo Y: hairline sólida, recessiva */}
          {ticks.map((t) => (
            <g key={t}>
              <line
                x1={PAD.left}
                x2={W - PAD.right}
                y1={y(t)}
                y2={y(t)}
                stroke={t === 0 ? "var(--viz-baseline)" : "var(--viz-grid)"}
                strokeWidth={1}
              />
              <text
                x={PAD.left - 8}
                y={y(t)}
                textAnchor="end"
                dominantBaseline="middle"
                fontSize={11}
                fill="var(--viz-muted)"
              >
                {t}
              </text>
            </g>
          ))}

          {data.map((d, i) => {
            const cx = PAD.left + slot * i + slot / 2;
            const h = (d.count / ceil) * PLOT_H;
            const isActive = active === i;
            return (
              <g key={d.key}>
                {d.count > 0 && (
                  <path
                    d={columnPath(cx - barW / 2, y(d.count), barW, h)}
                    fill="var(--viz-series-1)"
                    opacity={active === null || isActive ? 1 : 0.55}
                  />
                )}

                {/* rótulo só no pico (nunca um número em cada coluna) */}
                {i === peak && (
                  <text
                    x={cx}
                    y={y(d.count) - 6}
                    textAnchor="middle"
                    fontSize={11}
                    fontWeight={600}
                    fill="var(--viz-text-primary)"
                  >
                    {d.count}
                  </text>
                )}

                {/* eixo X: uma data sim, outra não, para caber */}
                {i % 2 === (data.length - 1) % 2 && (
                  <text
                    x={cx}
                    y={H - 8}
                    textAnchor="middle"
                    fontSize={11}
                    fill="var(--viz-muted)"
                  >
                    {d.label}
                  </text>
                )}

                {/* alvo de hover/foco: a faixa inteira, bem maior que a coluna */}
                <rect
                  x={PAD.left + slot * i}
                  y={PAD.top}
                  width={slot}
                  height={PLOT_H}
                  fill="transparent"
                  tabIndex={0}
                  role="img"
                  aria-label={`${d.label}: ${d.count} ${d.count === 1 ? "chamado" : "chamados"}`}
                  onPointerEnter={() => setActive(i)}
                  onPointerLeave={() => setActive(null)}
                  onFocus={() => setActive(i)}
                  onBlur={() => setActive(null)}
                  className="outline-none focus-visible:stroke-[var(--viz-text-secondary)]"
                  strokeWidth={1}
                />
              </g>
            );
          })}
        </svg>

        {show && (
          <div
            role="tooltip"
            style={{ left: `${tipLeft}%` }}
            className="pointer-events-none absolute top-0 z-10 -translate-x-1/2 whitespace-nowrap rounded-md border border-black/10 bg-[var(--viz-surface)] px-2.5 py-1.5 text-xs shadow-sm"
          >
            <p className="text-[var(--viz-text-secondary)]">{show.label}</p>
            <p className="flex items-center gap-1.5 font-semibold text-[var(--viz-text-primary)]">
              <span
                aria-hidden
                className="inline-block h-0.5 w-3 rounded"
                style={{ background: "var(--viz-series-1)" }}
              />
              {show.count} {show.count === 1 ? "chamado" : "chamados"}
            </p>
          </div>
        )}
      </div>

      {/* visão em tabela: toda informação acessível sem passar o mouse */}
      <details className="text-xs text-zinc-600">
        <summary className="cursor-pointer select-none hover:text-zinc-900">
          Ver como tabela
        </summary>
        <table className="mt-2 w-full text-left">
          <thead className="text-zinc-500">
            <tr>
              <th className="py-1 font-medium">Dia</th>
              <th className="py-1 text-right font-medium">Chamados</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100">
            {data.map((d) => (
              <tr key={d.key}>
                <td className="py-1">{d.label}</td>
                <td className="py-1 text-right tabular-nums">{d.count}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </div>
  );
}
