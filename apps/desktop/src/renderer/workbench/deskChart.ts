function asNumArr(value: unknown): number[] {
  return Array.isArray(value)
    ? value.map((item) => Number(item)).filter((item) => Number.isFinite(item))
    : [];
}

export const DESK_SERIES_COLORS = ["#1f4d45", "#3d9a8a", "#c4a35a", "#6b7c6e"];

function svgEl(name: string, attrs: Record<string, string>): SVGElement {
  const node = document.createElementNS("http://www.w3.org/2000/svg", name);
  for (const [key, val] of Object.entries(attrs)) {
    node.setAttribute(key, val);
  }
  return node;
}

function niceTicks(min: number, max: number, count = 5): number[] {
  if (!Number.isFinite(min) || !Number.isFinite(max) || min === max) {
    return [min - 1, min, min + 1];
  }
  const span = max - min;
  const step = span / Math.max(1, count - 1);
  const mag = 10 ** Math.floor(Math.log10(step));
  const niceStep = [1, 2, 5, 10].map((n) => n * mag).find((n) => n >= step) ?? step;
  const start = Math.floor(min / niceStep) * niceStep;
  const ticks: number[] = [];
  for (let v = start; v <= max + niceStep / 2; v += niceStep) {
    ticks.push(Number(v.toFixed(6)));
  }
  return ticks.length ? ticks : [min, max];
}

export function renderDeskChart(payload: Record<string, unknown>, width: number, height: number): SVGSVGElement {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", `0 0 ${width} ${height}`);
  svg.setAttribute("class", "desk-chart");
  const labels = Array.isArray(payload.labels) ? payload.labels.map((item) => String(item)) : [];
  const seriesRaw = Array.isArray(payload.series) ? payload.series : [];
  const series = seriesRaw.map((row) => {
    const rec = row && typeof row === "object" ? (row as Record<string, unknown>) : {};
    const values = asNumArr(rec.values);
    return {
      name: String(rec.name ?? ""),
      values,
      right: rec.axis === "right",
      errors: asNumArr(rec.errors).slice(0, values.length)
    };
  });
  const chartType = payload.chartType === "bar" || payload.chartType === "pie" ? payload.chartType : "line";
  const leftVals = series.filter((row) => !row.right).flatMap((row) => row.values);
  const rightVals = series.filter((row) => row.right).flatMap((row) => row.values);
  const hasRight = rightVals.length > 0 && chartType !== "pie";
  const rangeOf = (vals: number[]): { yMin: number; yMax: number } => {
    const minVal = vals.length ? Math.min(...vals) : 0;
    const maxVal = vals.length ? Math.max(...vals) : 1;
    const pad = (maxVal - minVal) * 0.14 || 1;
    return { yMin: minVal - pad, yMax: maxVal + pad };
  };
  const leftRange = rangeOf(leftVals.length ? leftVals : series.flatMap((row) => row.values));
  const rightRange = rangeOf(rightVals.length ? rightVals : leftRange.yMin === 0 ? [0, 1] : [leftRange.yMin, leftRange.yMax]);
  const leftPad = 52;
  const rightPad = hasRight ? 52 : 16;
  const top = 22;
  const bottom = 36;
  const innerW = Math.max(40, width - leftPad - rightPad);
  const innerH = Math.max(40, height - top - bottom);
  const n = Math.max(1, labels.length);
  const yOfSide = (value: number, right: boolean): number => {
    const { yMin, yMax } = right && hasRight ? rightRange : leftRange;
    return top + innerH - ((value - yMin) / (yMax - yMin || 1)) * innerH;
  };
  const xOf = (i: number): number => leftPad + (n === 1 ? innerW / 2 : (i / Math.max(1, n - 1)) * innerW);
  const fmt = (value: number): string => {
    if (Math.abs(value) >= 100) return String(Math.round(value));
    return String(Math.round(value * 10) / 10);
  };

  if (chartType === "pie") {
    const values = series[0]?.values ?? [];
    const total = values.reduce((sum, item) => sum + Math.max(0, item), 0) || 1;
    let angle = -Math.PI / 2;
    const cx = width / 2;
    const cy = height / 2 - 8;
    const r = Math.min(innerW, innerH) / 2.4;
    values.forEach((value, index) => {
      const slice = (Math.max(0, value) / total) * Math.PI * 2;
      const x1 = cx + r * Math.cos(angle);
      const y1 = cy + r * Math.sin(angle);
      angle += slice;
      const x2 = cx + r * Math.cos(angle);
      const y2 = cy + r * Math.sin(angle);
      const large = slice > Math.PI ? 1 : 0;
      svg.appendChild(
        svgEl("path", {
          d: `M ${cx} ${cy} L ${x1} ${y1} A ${r} ${r} 0 ${large} 1 ${x2} ${y2} Z`,
          fill: DESK_SERIES_COLORS[index % DESK_SERIES_COLORS.length]
        })
      );
    });
    return svg as SVGSVGElement;
  }

  const paintTicks = (range: { yMin: number; yMax: number }, side: "left" | "right"): void => {
    const ticks = niceTicks(range.yMin, range.yMax, 5);
    const xTick = side === "left" ? leftPad : leftPad + innerW;
    for (const tick of ticks) {
      const y = yOfSide(tick, side === "right");
      if (side === "left") {
        svg.appendChild(
          svgEl("line", {
            x1: String(leftPad),
            x2: String(leftPad + innerW),
            y1: String(y),
            y2: String(y),
            stroke: "#eceee9",
            "stroke-dasharray": "3 4"
          })
        );
      }
      svg.appendChild(
        svgEl("text", {
          x: String(side === "left" ? leftPad - 8 : xTick + 8),
          y: String(y + 3),
          "text-anchor": side === "left" ? "end" : "start",
          fill: "#9aa39c",
          "font-size": "10"
        })
      ).textContent = fmt(tick);
    }
  };
  paintTicks(leftRange, "left");
  if (hasRight) {
    paintTicks(rightRange, "right");
  }
  svg.appendChild(
    svgEl("line", {
      x1: String(leftPad),
      x2: String(leftPad),
      y1: String(top),
      y2: String(top + innerH),
      stroke: "#d7dbd4"
    })
  );
  if (hasRight) {
    svg.appendChild(
      svgEl("line", {
        x1: String(leftPad + innerW),
        x2: String(leftPad + innerW),
        y1: String(top),
        y2: String(top + innerH),
        stroke: "#d7dbd4"
      })
    );
  }
  svg.appendChild(
    svgEl("line", {
      x1: String(leftPad),
      x2: String(leftPad + innerW),
      y1: String(top + innerH),
      y2: String(top + innerH),
      stroke: "#d7dbd4"
    })
  );
  labels.forEach((label, i) => {
    svg.appendChild(
      svgEl("text", {
        x: String(xOf(i)),
        y: String(top + innerH + 16),
        "text-anchor": "middle",
        fill: "#8b938c",
        "font-size": "10"
      })
    ).textContent = label;
  });
  const yTitle = [payload.yLabel, payload.unit].filter((item) => typeof item === "string" && item.trim()).join(" ");
  if (yTitle) {
    svg.appendChild(
      svgEl("text", {
        x: String(leftPad),
        y: String(12),
        fill: "#8b938c",
        "font-size": "10"
      })
    ).textContent = yTitle;
  }
  const y2Title = [payload.y2Label, payload.y2Unit].filter((item) => typeof item === "string" && item.trim()).join(" ");
  if (y2Title && hasRight) {
    svg.appendChild(
      svgEl("text", {
        x: String(leftPad + innerW),
        y: String(12),
        "text-anchor": "end",
        fill: "#8b938c",
        "font-size": "10"
      })
    ).textContent = y2Title;
  }
  const xTitle = String(payload.xLabel || "");
  if (xTitle) {
    svg.appendChild(
      svgEl("text", {
        x: String(leftPad + innerW / 2),
        y: String(height - 4),
        "text-anchor": "middle",
        fill: "#8b938c",
        "font-size": "10"
      })
    ).textContent = xTitle;
  }

  const errorYs = (value: number, err: number, right: boolean): { lo: number; hi: number } => ({
    lo: yOfSide(value - err, right),
    hi: yOfSide(value + err, right)
  });

  const labelStep = n > 8 ? 2 : 1;
  series.forEach((row, s) => {
    const color = DESK_SERIES_COLORS[s % DESK_SERIES_COLORS.length];
    const yOf = (value: number): number => yOfSide(value, row.right && hasRight);
    const paintErr = (x: number, value: number, i: number): void => {
      const err = row.errors[i];
      if (!(err > 0)) return;
      const { lo, hi } = errorYs(value, err, row.right && hasRight);
      svg.appendChild(
        svgEl("line", {
          x1: String(x),
          x2: String(x),
          y1: String(lo),
          y2: String(hi),
          stroke: color,
          "stroke-width": "1.2"
        })
      );
      svg.appendChild(
        svgEl("line", {
          x1: String(x - 3),
          x2: String(x + 3),
          y1: String(lo),
          y2: String(lo),
          stroke: color,
          "stroke-width": "1.2"
        })
      );
      svg.appendChild(
        svgEl("line", {
          x1: String(x - 3),
          x2: String(x + 3),
          y1: String(hi),
          y2: String(hi),
          stroke: color,
          "stroke-width": "1.2"
        })
      );
    };
    const paintLabel = (x: number, y: number, value: number, i: number): void => {
      if (i % labelStep !== 0) return;
      svg.appendChild(
        svgEl("text", {
          x: String(x),
          y: String(y - 8),
          "text-anchor": "middle",
          fill: "#4d5752",
          "font-size": "9"
        })
      ).textContent = fmt(value);
    };
    if (chartType === "bar") {
      const groupW = innerW / n;
      row.values.forEach((value, i) => {
        const barW = Math.max(4, (groupW - 10) / Math.max(1, series.length));
        const x = leftPad + i * groupW + s * barW + 6;
        const y = yOf(value);
        const h = top + innerH - y;
        svg.appendChild(
          svgEl("rect", {
            x: String(x),
            y: String(y),
            width: String(barW),
            height: String(Math.max(0, h)),
            rx: "3",
            fill: color
          })
        );
        const cx = x + barW / 2;
        paintErr(cx, value, i);
        paintLabel(cx, y, value, i);
      });
      return;
    }
    const pts = row.values.map((value, i) => `${xOf(i)},${yOf(value)}`);
    const area = `M ${xOf(0)} ${top + innerH} L ${pts.join(" L ")} L ${xOf(row.values.length - 1)} ${top + innerH} Z`;
    svg.appendChild(svgEl("path", { d: area, fill: color, opacity: s === 0 ? "0.12" : "0.08" }));
    svg.appendChild(
      svgEl("polyline", {
        points: pts.join(" "),
        fill: "none",
        stroke: color,
        "stroke-width": "2.2",
        "stroke-linecap": "round",
        "stroke-linejoin": "round"
      })
    );
    row.values.forEach((value, i) => {
      const x = xOf(i);
      const y = yOf(value);
      paintErr(x, value, i);
      svg.appendChild(
        svgEl("circle", {
          cx: String(x),
          cy: String(y),
          r: "3.2",
          fill: "#fbfbf8",
          stroke: color,
          "stroke-width": "2"
        })
      );
      paintLabel(x, y, value, i);
    });
  });
  return svg as SVGSVGElement;
}
