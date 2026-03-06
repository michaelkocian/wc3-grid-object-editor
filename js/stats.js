// ================================================================
// STATISTICS & CHARTS MODULE
//
// Canvas-based histograms and pie charts with presentation-quality
// visuals.  No external dependencies – pure Canvas 2D API.
// ================================================================

import { editorState } from './state.js';
import { KNOWN } from './consts/columns.js';
import {
  ALL_TAB_TYPES, TAB_DISPLAY_LABELS,
} from './consts/constants.js';
import { lookupObjectCodeName } from './utils.js';

// ================================================================
// COLOUR PALETTE  (shared across charts)
// ================================================================

const PALETTE = [
  '#e94560', '#3ab6ff', '#27ae60', '#f39c12', '#9b59b6',
  '#1abc9c', '#e67e22', '#2ecc71', '#e74c3c', '#3498db',
  '#8e44ad', '#16a085', '#d35400', '#c0392b', '#2980b9',
  '#f1c40f', '#7f8c8d', '#2c3e50', '#00cec9', '#fd79a8',
];

const CHART_BG      = '#12122a';
const CHART_GRID    = 'rgba(255,255,255,0.06)';
const CHART_TEXT    = '#b0b8c8';
const CHART_MUTED   = '#556';
const ACCENT        = '#e94560';

// ================================================================
// DATA COLLECTORS
// ================================================================

/** Count objects (unique groupIds) per tab. */
function getObjectCountsPerTab() {
  const counts = {};
  for (const tab of ALL_TAB_TYPES) {
    const d = editorState[tab];
    if (!d) { counts[tab] = 0; continue; }
    counts[tab] = new Set(d.rows.map(r => r.groupId)).size;
  }
  return counts;
}

/** Original vs Custom split per loaded tab. */
function getTableSplit() {
  const result = {};
  for (const tab of ALL_TAB_TYPES) {
    const d = editorState[tab];
    if (!d) continue;
    const orig   = new Set(d.rows.filter(r => r.table === 'original').map(r => r.groupId)).size;
    const custom = new Set(d.rows.filter(r => r.table === 'custom').map(r => r.groupId)).size;
    result[tab] = { original: orig, custom };
  }
  return result;
}

/** Count filled values per data type across all loaded tabs. */
function getValueTypeCounts() {
  const counts = {};
  for (const tab of ALL_TAB_TYPES) {
    const d = editorState[tab];
    if (!d) continue;
    for (const row of d.rows) {
      for (const cell of Object.values(row.values)) {
        const t = cell.type || 'unknown';
        counts[t] = (counts[t] || 0) + 1;
      }
    }
  }
  return counts;
}

/** Count fields per category (from KNOWN metadata). */
function getFieldCategoryCounts() {
  const cats = {};
  for (const tab of ALL_TAB_TYPES) {
    const d = editorState[tab];
    if (!d) continue;
    for (const col of d.columns) {
      const k = KNOWN[col.id];
      const cat = (k && k.c) ? k.c : 'other';
      cats[cat] = (cats[cat] || 0) + 1;
    }
  }
  return cats;
}

/** For a specific tab, count how many unique fields each object has. */
function getFieldCountDistribution(tabType) {
  const d = editorState[tabType];
  if (!d) return [];
  // Group rows by groupId, count unique fields
  const groups = {};
  for (const row of d.rows) {
    if (!groups[row.groupId]) groups[row.groupId] = new Set();
    for (const fid of Object.keys(row.values)) groups[row.groupId].add(fid);
  }
  return Object.values(groups).map(s => s.size);
}

/** Top N most-used field IDs across all loaded data. */
function getTopFields(n = 12) {
  const counts = {};
  for (const tab of ALL_TAB_TYPES) {
    const d = editorState[tab];
    if (!d) continue;
    for (const row of d.rows) {
      for (const fid of Object.keys(row.values)) {
        counts[fid] = (counts[fid] || 0) + 1;
      }
    }
  }
  return Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, n)
    .map(([id, count]) => {
      const k = KNOWN[id];
      return { id, name: k ? k.n : id, count };
    });
}

/** For numeric fields in a tab, gather aggregate stats. */
function getNumericFieldStats(tabType) {
  const d = editorState[tabType];
  if (!d) return [];
  const fieldVals = {};
  for (const row of d.rows) {
    for (const [fid, cell] of Object.entries(row.values)) {
      if (cell.type === 'int' || cell.type === 'real' || cell.type === 'unreal') {
        if (!fieldVals[fid]) fieldVals[fid] = [];
        fieldVals[fid].push(Number(cell.value) || 0);
      }
    }
  }
  // Pick the fields with the most data points
  return Object.entries(fieldVals)
    .filter(([, v]) => v.length >= 3)
    .sort((a, b) => b[1].length - a[1].length)
    .slice(0, 6)
    .map(([id, vals]) => {
      const k = KNOWN[id];
      vals.sort((a, b) => a - b);
      return {
        id,
        name: k ? k.n : id,
        min: vals[0],
        max: vals[vals.length - 1],
        avg: vals.reduce((s, v) => s + v, 0) / vals.length,
        median: vals[Math.floor(vals.length / 2)],
        count: vals.length,
        values: vals,
      };
    });
}

// ================================================================
// CANVAS CHART HELPERS
// ================================================================

function createCanvas(width, height) {
  const canvas = document.createElement('canvas');
  const dpr = window.devicePixelRatio || 1;
  canvas.width  = width * dpr;
  canvas.height = height * dpr;
  canvas.style.width  = width + 'px';
  canvas.style.height = height + 'px';
  const ctx = canvas.getContext('2d');
  ctx.scale(dpr, dpr);
  return { canvas, ctx, w: width, h: height };
}

// ================================================================
// PIE CHART
// ================================================================

function drawPieChart(ctx, cx, cy, radius, slices, title) {
  const total = slices.reduce((s, sl) => s + sl.value, 0);
  if (total === 0) return;

  // Title
  ctx.fillStyle = '#fff';
  ctx.font = 'bold 14px "Segoe UI", sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(title, cx, 22);

  // Draw slices
  let startAngle = -Math.PI / 2;
  const sliceAngles = [];

  for (let i = 0; i < slices.length; i++) {
    const sl = slices[i];
    const sliceAngle = (sl.value / total) * 2 * Math.PI;
    sliceAngles.push({ start: startAngle, end: startAngle + sliceAngle });

    // Slice
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.arc(cx, cy, radius, startAngle, startAngle + sliceAngle);
    ctx.closePath();
    ctx.fillStyle = sl.color;
    ctx.fill();

    // Subtle border
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = CHART_BG;
    ctx.stroke();

    // Label on slice if large enough
    if (sliceAngle > 0.25) {
      const midAngle = startAngle + sliceAngle / 2;
      const labelR = radius * 0.65;
      const lx = cx + Math.cos(midAngle) * labelR;
      const ly = cy + Math.sin(midAngle) * labelR;

      ctx.fillStyle = '#fff';
      ctx.font = 'bold 11px "Segoe UI", sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      const pct = ((sl.value / total) * 100).toFixed(0) + '%';
      ctx.fillText(pct, lx, ly);
    }

    startAngle += sliceAngle;
  }

  // Inner circle (donut)
  ctx.beginPath();
  ctx.arc(cx, cy, radius * 0.38, 0, Math.PI * 2);
  ctx.fillStyle = CHART_BG;
  ctx.fill();

  // Center total
  ctx.fillStyle = '#fff';
  ctx.font = 'bold 18px "Segoe UI", sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(total.toLocaleString(), cx, cy - 6);
  ctx.font = '10px "Segoe UI", sans-serif';
  ctx.fillStyle = CHART_MUTED;
  ctx.fillText('total', cx, cy + 10);

  // Legend
  const legendStartY = cy + radius + 18;
  const legendX = cx - radius;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';

  const cols = Math.min(2, Math.ceil(slices.length / 8));
  const colW = (radius * 2) / cols;

  slices.forEach((sl, i) => {
    const col = Math.floor(i / 8);
    const row = i % 8;
    const x = legendX + col * colW;
    const y = legendStartY + row * 16;

    ctx.fillStyle = sl.color;
    ctx.beginPath();
    ctx.roundRect(x, y + 1, 10, 10, 2);
    ctx.fill();

    ctx.fillStyle = CHART_TEXT;
    ctx.font = '11px "Segoe UI", sans-serif';
    const label = sl.label.length > 16 ? sl.label.slice(0, 15) + '…' : sl.label;
    ctx.fillText(label + '  ' + sl.value, x + 14, y);
  });
}

// ================================================================
// BAR CHART / HISTOGRAM
// ================================================================

function drawBarChart(ctx, x, y, w, h, bars, title, opts = {}) {
  const {
    barColor = ACCENT,
    showValues = true,
    horizontal = false,
    gradient = true,
    roundedBars = true,
  } = opts;

  // Title
  ctx.fillStyle = '#fff';
  ctx.font = 'bold 14px "Segoe UI", sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(title, x + w / 2, y - 8);

  const maxVal = Math.max(...bars.map(b => b.value), 1);
  const padding = 4;

  if (horizontal) {
    // ---------- Horizontal bars ----------
    const barH = Math.min(28, (h - 20) / bars.length - padding);
    const labelW = 110;
    const chartW = w - labelW - 40;

    bars.forEach((bar, i) => {
      const by = y + i * (barH + padding);
      const bw = (bar.value / maxVal) * chartW;

      // Label
      ctx.fillStyle = CHART_TEXT;
      ctx.font = '11px "Segoe UI", sans-serif';
      ctx.textAlign = 'right';
      ctx.textBaseline = 'middle';
      const label = bar.label.length > 18 ? bar.label.slice(0, 17) + '…' : bar.label;
      ctx.fillText(label, x + labelW - 6, by + barH / 2);

      // Bar
      if (gradient) {
        const grad = ctx.createLinearGradient(x + labelW, by, x + labelW + bw, by);
        grad.addColorStop(0, bar.color || barColor);
        grad.addColorStop(1, shiftColor(bar.color || barColor, 30));
        ctx.fillStyle = grad;
      } else {
        ctx.fillStyle = bar.color || barColor;
      }

      if (roundedBars) {
        ctx.beginPath();
        ctx.roundRect(x + labelW, by, Math.max(bw, 3), barH, [0, 4, 4, 0]);
        ctx.fill();
      } else {
        ctx.fillRect(x + labelW, by, Math.max(bw, 3), barH);
      }

      // Value
      if (showValues) {
        ctx.fillStyle = '#fff';
        ctx.font = 'bold 11px "Segoe UI", sans-serif';
        ctx.textAlign = 'left';
        ctx.fillText(bar.value.toLocaleString(), x + labelW + bw + 6, by + barH / 2);
      }
    });
  } else {
    // ---------- Vertical bars ----------
    const barCount = bars.length;
    const gap = Math.max(4, Math.min(10, w / barCount / 4));
    const barW = (w - gap * (barCount + 1)) / barCount;
    const chartH = h - 30;

    // Grid lines
    ctx.strokeStyle = CHART_GRID;
    ctx.lineWidth = 1;
    for (let g = 0; g <= 4; g++) {
      const gy = y + chartH - (g / 4) * chartH;
      ctx.beginPath();
      ctx.moveTo(x, gy);
      ctx.lineTo(x + w, gy);
      ctx.stroke();
    }

    bars.forEach((bar, i) => {
      const bx = x + gap + i * (barW + gap);
      const bh = (bar.value / maxVal) * chartH;
      const by2 = y + chartH - bh;

      // Bar with gradient
      if (gradient) {
        const grad = ctx.createLinearGradient(bx, by2, bx, y + chartH);
        grad.addColorStop(0, bar.color || barColor);
        grad.addColorStop(1, shiftColor(bar.color || barColor, -40));
        ctx.fillStyle = grad;
      } else {
        ctx.fillStyle = bar.color || barColor;
      }

      if (roundedBars) {
        ctx.beginPath();
        ctx.roundRect(bx, by2, barW, bh, [4, 4, 0, 0]);
        ctx.fill();
      } else {
        ctx.fillRect(bx, by2, barW, bh);
      }

      // Glow effect
      ctx.shadowColor = bar.color || barColor;
      ctx.shadowBlur = 8;
      ctx.fillRect(bx + 2, by2, barW - 4, 2);
      ctx.shadowBlur = 0;

      // Value on top
      if (showValues && bh > 16) {
        ctx.fillStyle = '#fff';
        ctx.font = 'bold 11px "Segoe UI", sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(bar.value.toLocaleString(), bx + barW / 2, by2 - 4);
      }

      // Label below
      ctx.fillStyle = CHART_TEXT;
      ctx.font = '10px "Segoe UI", sans-serif';
      ctx.textAlign = 'center';
      ctx.save();
      ctx.translate(bx + barW / 2, y + chartH + 6);
      if (barW < 40) ctx.rotate(-0.5);
      const lbl = bar.label.length > 10 ? bar.label.slice(0, 9) + '…' : bar.label;
      ctx.fillText(lbl, 0, 0);
      ctx.restore();
    });
  }
}

// ================================================================
// HISTOGRAM  (distribution)
// ================================================================

function drawHistogram(ctx, x, y, w, h, values, title, binCount = 12) {
  if (!values.length) return;

  ctx.fillStyle = '#fff';
  ctx.font = 'bold 14px "Segoe UI", sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(title, x + w / 2, y - 8);

  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const bins = new Array(binCount).fill(0);

  for (const v of values) {
    let idx = Math.floor(((v - min) / range) * binCount);
    if (idx >= binCount) idx = binCount - 1;
    bins[idx]++;
  }

  const maxBin = Math.max(...bins, 1);
  const gap = 2;
  const barW = (w - gap * (binCount + 1)) / binCount;
  const chartH = h - 32;

  // Grid
  ctx.strokeStyle = CHART_GRID;
  ctx.lineWidth = 1;
  for (let g = 0; g <= 3; g++) {
    const gy = y + chartH - (g / 3) * chartH;
    ctx.beginPath();
    ctx.moveTo(x, gy);
    ctx.lineTo(x + w, gy);
    ctx.stroke();
  }

  bins.forEach((count, i) => {
    const bx = x + gap + i * (barW + gap);
    const bh = (count / maxBin) * chartH;
    const by2 = y + chartH - bh;

    const grad = ctx.createLinearGradient(bx, by2, bx, y + chartH);
    grad.addColorStop(0, '#3ab6ff');
    grad.addColorStop(1, '#0f3460');
    ctx.fillStyle = grad;

    ctx.beginPath();
    ctx.roundRect(bx, by2, barW, bh, [3, 3, 0, 0]);
    ctx.fill();

    // Glow
    ctx.shadowColor = '#3ab6ff';
    ctx.shadowBlur = 6;
    ctx.fillRect(bx + 1, by2, barW - 2, 2);
    ctx.shadowBlur = 0;

    if (count > 0) {
      ctx.fillStyle = '#fff';
      ctx.font = '9px "Segoe UI", sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(count, bx + barW / 2, by2 - 3);
    }
  });

  // Axis labels
  ctx.fillStyle = CHART_MUTED;
  ctx.font = '9px "Segoe UI", sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText(formatNum(min), x, y + chartH + 14);
  ctx.textAlign = 'right';
  ctx.fillText(formatNum(max), x + w, y + chartH + 14);
  ctx.textAlign = 'center';
  ctx.fillText('Distribution', x + w / 2, y + chartH + 26);
}

// ================================================================
// UTILITIES
// ================================================================

function shiftColor(hex, amount) {
  let col = hex.replace('#', '');
  if (col.length === 3) col = col[0]+col[0]+col[1]+col[1]+col[2]+col[2];
  let [r, g, b] = [
    parseInt(col.substring(0, 2), 16),
    parseInt(col.substring(2, 4), 16),
    parseInt(col.substring(4, 6), 16),
  ];
  r = Math.min(255, Math.max(0, r + amount));
  g = Math.min(255, Math.max(0, g + amount));
  b = Math.min(255, Math.max(0, b + amount));
  return '#' + [r, g, b].map(v => v.toString(16).padStart(2, '0')).join('');
}

function formatNum(n) {
  if (Number.isInteger(n)) return n.toLocaleString();
  return n.toFixed(1);
}

// ================================================================
// MAIN RENDER  –  Builds all charts inside the modal
// ================================================================

export function showStatsModal() {
  // Check for any loaded data
  const hasData = ALL_TAB_TYPES.some(t => editorState[t] !== null);
  if (!hasData) {
    alert('Load data first to view statistics.');
    return;
  }

  // Remove any existing modal
  const existing = document.getElementById('statsModal');
  if (existing) existing.remove();

  // Create modal overlay
  const overlay = document.createElement('div');
  overlay.id = 'statsModal';
  overlay.className = 'stats-overlay';

  const modal = document.createElement('div');
  modal.className = 'stats-modal';

  // Header
  const header = document.createElement('div');
  header.className = 'stats-header';
  header.innerHTML = '<h2>📊 Data Statistics</h2>';
  const closeBtn = document.createElement('button');
  closeBtn.className = 'stats-close';
  closeBtn.textContent = '✕';
  closeBtn.onclick = () => overlay.remove();
  header.appendChild(closeBtn);
  modal.appendChild(header);

  // Scrollable body
  const body = document.createElement('div');
  body.className = 'stats-body';

  // ---- Summary cards row ----
  const summaryRow = document.createElement('div');
  summaryRow.className = 'stats-cards';

  const loadedTabs = ALL_TAB_TYPES.filter(t => editorState[t] !== null);
  const totalObjects = loadedTabs.reduce((s, t) => {
    return s + new Set(editorState[t].rows.map(r => r.groupId)).size;
  }, 0);
  const totalValues = loadedTabs.reduce((s, t) => {
    return s + editorState[t].rows.reduce((s2, r) => s2 + Object.keys(r.values).length, 0);
  }, 0);
  const totalColumns = loadedTabs.reduce((s, t) => s + editorState[t].columns.length, 0);

  summaryRow.appendChild(makeSummaryCard('📁', 'Loaded Tabs', loadedTabs.length + ' / ' + ALL_TAB_TYPES.length));
  summaryRow.appendChild(makeSummaryCard('🧩', 'Total Objects', totalObjects.toLocaleString()));
  summaryRow.appendChild(makeSummaryCard('🔢', 'Data Values', totalValues.toLocaleString()));
  summaryRow.appendChild(makeSummaryCard('📋', 'Columns', totalColumns.toLocaleString()));
  body.appendChild(summaryRow);

  // ---- Chart grid ----
  const chartGrid = document.createElement('div');
  chartGrid.className = 'stats-chart-grid';

  // 1. Objects per tab  (bar chart)
  const objCounts = getObjectCountsPerTab();
  const barsPerTab = ALL_TAB_TYPES
    .filter(t => editorState[t] !== null)
    .map((t, i) => ({ label: TAB_DISPLAY_LABELS[t], value: objCounts[t], color: PALETTE[i] }));

  if (barsPerTab.length > 0) {
    const cw = 420, ch = 280;
    const { canvas, ctx } = createCanvas(cw, ch);
    drawBarChart(ctx, 10, 36, cw - 20, ch - 50, barsPerTab, 'Objects per Tab');
    chartGrid.appendChild(wrapChart(canvas, 'Object count by editor tab'));
  }

  // 2. Original vs Custom pie chart
  const tableSplit = getTableSplit();
  const totalOrig   = Object.values(tableSplit).reduce((s, v) => s + v.original, 0);
  const totalCustom = Object.values(tableSplit).reduce((s, v) => s + v.custom, 0);
  if (totalOrig + totalCustom > 0) {
    const cw = 340, ch = 380;
    const { canvas, ctx } = createCanvas(cw, ch);
    drawPieChart(ctx, cw / 2, 160, 110, [
      { label: 'Original', value: totalOrig, color: '#3ab6ff' },
      { label: 'Custom',   value: totalCustom, color: '#e94560' },
    ], 'Original vs Custom');
    chartGrid.appendChild(wrapChart(canvas, 'Original table vs custom modifications'));
  }

  // 3. Value types pie  
  const typeCounts = getValueTypeCounts();
  const typeSlices = Object.entries(typeCounts)
    .sort((a, b) => b[1] - a[1])
    .map(([t, c], i) => ({ label: t, value: c, color: PALETTE[i % PALETTE.length] }));
  if (typeSlices.length > 0) {
    const cw = 340, ch = 420;
    const { canvas, ctx } = createCanvas(cw, ch);
    drawPieChart(ctx, cw / 2, 160, 110, typeSlices, 'Value Types');
    chartGrid.appendChild(wrapChart(canvas, 'Data distribution by wire type'));
  }

  // 4. Field categories pie
  const catCounts = getFieldCategoryCounts();
  const catSlices = Object.entries(catCounts)
    .sort((a, b) => b[1] - a[1])
    .map(([cat, c], i) => ({ label: cat, value: c, color: PALETTE[i % PALETTE.length] }));
  if (catSlices.length > 0) {
    const cw = 340, ch = 460;
    const { canvas, ctx } = createCanvas(cw, ch);
    drawPieChart(ctx, cw / 2, 160, 110, catSlices, 'Field Categories');
    chartGrid.appendChild(wrapChart(canvas, 'Columns grouped by metadata category'));
  }

  // 5. Top used fields (horizontal bar chart)
  const topFields = getTopFields(12);
  if (topFields.length > 0) {
    const cw = 480, ch = topFields.length * 32 + 50;
    const { canvas, ctx } = createCanvas(cw, ch);
    const bars = topFields.map((f, i) => ({
      label: f.name, value: f.count, color: PALETTE[i % PALETTE.length],
    }));
    drawBarChart(ctx, 10, 36, cw - 20, ch - 46, bars, 'Most Used Fields', { horizontal: true });
    chartGrid.appendChild(wrapChart(canvas, 'Fields with the most data entries'));
  }

  // 6. Original vs Custom per tab  (stacked-style bar)
  if (Object.keys(tableSplit).length > 1) {
    const entries = Object.entries(tableSplit);
    const cw = 440, ch = entries.length * 36 + 50;
    const { canvas, ctx } = createCanvas(cw, ch);

    const bars = entries.map(([tab, counts]) => ({
      label: TAB_DISPLAY_LABELS[tab],
      value: counts.original + counts.custom,
      color: '#3ab6ff',
    }));
    drawBarChart(ctx, 10, 36, cw - 20, ch - 46, bars, 'Data Volume per Tab', { horizontal: true, barColor: '#3ab6ff' });

    // Overlay custom portion
    const maxVal = Math.max(...bars.map(b => b.value), 1);
    const barH = Math.min(28, (ch - 70) / entries.length - 4);
    const labelW = 110;
    const chartW = cw - 20 - labelW - 40;
    entries.forEach(([, counts], i) => {
      const by = 36 + i * (barH + 4);
      const customW = (counts.custom / maxVal) * chartW;
      if (counts.custom > 0) {
        ctx.fillStyle = '#e94560';
        ctx.globalAlpha = 0.85;
        ctx.beginPath();
        ctx.roundRect(10 + labelW, by, Math.max(customW, 3), barH, [0, 4, 4, 0]);
        ctx.fill();
        ctx.globalAlpha = 1.0;
      }
    });

    // Mini legend
    const ly = ch - 8;
    ctx.fillStyle = '#3ab6ff';
    ctx.fillRect(cw / 2 - 80, ly - 8, 10, 10);
    ctx.fillStyle = CHART_TEXT;
    ctx.font = '10px "Segoe UI", sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText('Original', cw / 2 - 66, ly);
    ctx.fillStyle = '#e94560';
    ctx.fillRect(cw / 2 + 10, ly - 8, 10, 10);
    ctx.fillStyle = CHART_TEXT;
    ctx.fillText('Custom', cw / 2 + 24, ly);

    chartGrid.appendChild(wrapChart(canvas, 'Original + Custom breakdown per tab'));
  }

  // 7. Field count distribution histograms per loaded tab
  for (const tab of loadedTabs) {
    const dist = getFieldCountDistribution(tab);
    if (dist.length < 3) continue;
    const cw = 400, ch = 220;
    const { canvas, ctx } = createCanvas(cw, ch);
    drawHistogram(ctx, 15, 36, cw - 30, ch - 50, dist,
      TAB_DISPLAY_LABELS[tab] + ' – Fields per Object', Math.min(15, Math.max(5, Math.ceil(dist.length / 4))));
    chartGrid.appendChild(wrapChart(canvas, 'How many fields each ' + tab.slice(0, -1) + ' object defines'));
  }

  // 8. Numeric field stats histograms (for each loaded tab with enough data)
  for (const tab of loadedTabs) {
    const numStats = getNumericFieldStats(tab);
    for (const fs of numStats.slice(0, 3)) {
      const cw = 400, ch = 220;
      const { canvas, ctx } = createCanvas(cw, ch);
      drawHistogram(ctx, 15, 36, cw - 30, ch - 50, fs.values,
        TAB_DISPLAY_LABELS[tab] + ' – ' + fs.name,
        Math.min(15, Math.max(5, Math.ceil(fs.values.length / 4))));
      chartGrid.appendChild(wrapChart(canvas, 
        'n=' + fs.count + '  min=' + formatNum(fs.min) + '  avg=' + formatNum(fs.avg) + '  max=' + formatNum(fs.max)));
    }
  }

  body.appendChild(chartGrid);
  modal.appendChild(body);
  overlay.appendChild(modal);
  document.body.appendChild(overlay);

  // Close on overlay click
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) overlay.remove();
  });

  // Close on Escape
  const escHandler = (e) => {
    if (e.key === 'Escape') {
      overlay.remove();
      document.removeEventListener('keydown', escHandler);
    }
  };
  document.addEventListener('keydown', escHandler);
}

// ================================================================
// DOM helpers
// ================================================================

function makeSummaryCard(icon, label, value) {
  const card = document.createElement('div');
  card.className = 'stats-card';
  card.innerHTML =
    '<div class="stats-card-icon">' + icon + '</div>' +
    '<div class="stats-card-value">' + value + '</div>' +
    '<div class="stats-card-label">' + label + '</div>';
  return card;
}

function wrapChart(canvas, subtitle) {
  const wrapper = document.createElement('div');
  wrapper.className = 'stats-chart-wrap';
  wrapper.appendChild(canvas);
  if (subtitle) {
    const sub = document.createElement('div');
    sub.className = 'stats-chart-subtitle';
    sub.textContent = subtitle;
    wrapper.appendChild(sub);
  }
  return wrapper;
}
