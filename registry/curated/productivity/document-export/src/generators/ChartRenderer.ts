// @ts-nocheck
/**
 * @module ChartRenderer
 *
 * Renders a {@link ChartSpec} into a text-based tabular representation that
 * can be embedded inside paginated formats (PDF, DOCX) which lack native
 * charting primitives. The result includes:
 *
 * - A {@link TableData} representation of the chart data (suitable for
 *   rendering as a styled table via the format-specific generator).
 * - A human-readable `description` string summarising chart type, title,
 *   number of datasets, and category count.
 *
 * For bar, line, and area charts an ASCII "visual" column is appended to
 * each row, giving readers an at-a-glance proportional representation
 * (e.g. `████████░░░░`). Pie and doughnut charts include a percentage
 * column. Scatter charts flatten each dataset's x/y pairs into rows.
 */

import type { ChartSpec, ChartDataSet, TableData } from '../types.js';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Full-block Unicode character used for the filled portion of an ASCII bar. */
const BLOCK_FILLED = '\u2588'; // █

/** Light-shade Unicode character used for the unfilled portion of an ASCII bar. */
const BLOCK_EMPTY = '\u2591'; // ░

/** Total character width of the ASCII bar visualisation column. */
const BAR_WIDTH = 16;

// ---------------------------------------------------------------------------
// Public class
// ---------------------------------------------------------------------------

/**
 * Stateless renderer that converts a {@link ChartSpec} into a table-friendly
 * representation with an accompanying text description.
 *
 * @example
 * ```ts
 * const renderer = new ChartRenderer();
 * const { description, tableData } = renderer.renderChart(myBarChart);
 * // description → "Bar chart: Revenue — 2 datasets, 4 categories"
 * // tableData   → { headers: [...], rows: [...] }
 * ```
 */
export class ChartRenderer {
  /**
   * Convert a chart specification to a text-based tabular representation.
   *
   * Rendering strategy varies by chart type:
   *
   * | Type            | Columns                                        |
   * | --------------- | ---------------------------------------------- |
   * | bar / line / area | Category, dataset-1, dataset-2, ..., Visual  |
   * | pie / doughnut  | Label, Value, Percentage                       |
   * | scatter         | Dataset, X, Y                                  |
   *
   * @param chart - The chart specification to render.
   * @returns An object containing a `description` summary string and the
   *   rendered `tableData` ready for embedding in a document section.
   */
  renderChart(chart: ChartSpec): { description: string; tableData: TableData } {
    switch (chart.type) {
      case 'bar':
      case 'line':
      case 'area':
        return this.renderCategoryChart(chart);

      case 'pie':
      case 'doughnut':
        return this.renderPieChart(chart);

      case 'scatter':
        return this.renderScatterChart(chart);

      default: {
        // Exhaustiveness guard — future chart types will cause a compile error.
        const _exhaustive: never = chart.type;
        throw new Error(`Unsupported chart type: ${_exhaustive}`);
      }
    }
  }

  // -----------------------------------------------------------------------
  // Private — category-axis charts (bar / line / area)
  // -----------------------------------------------------------------------

  /**
   * Render bar, line, or area charts as a table whose rows are categories
   * and whose columns are the dataset values plus a trailing ASCII bar
   * visualisation column.
   *
   * @param chart - A chart spec with type `bar`, `line`, or `area`.
   * @returns Description and table data.
   */
  private renderCategoryChart(chart: ChartSpec): { description: string; tableData: TableData } {
    const datasets = chart.data;
    const categories = this.resolveCategories(datasets);

    // Compute the global maximum value across all datasets so the ASCII
    // bars are proportional to one another.
    const globalMax = this.globalMaxValue(datasets);

    // Headers: Category | Dataset-1 | Dataset-2 | ... | Visual
    const headers = [
      chart.xAxisLabel ?? 'Category',
      ...datasets.map((ds) => ds.label),
      'Visual',
    ];

    // One row per category
    const rows: string[][] = categories.map((cat, catIdx) => {
      const values = datasets.map((ds) => ds.values[catIdx] ?? 0);
      // ASCII bar is based on the sum of all dataset values for this category
      const total = values.reduce((sum, v) => sum + v, 0);
      const visual = this.asciiBar(total, globalMax);

      return [
        cat,
        ...values.map((v) => this.formatNumber(v)),
        visual,
      ];
    });

    const categoryCount = categories.length;
    const description = this.buildDescription(chart, datasets.length, categoryCount);

    return { description, tableData: { headers, rows } };
  }

  // -----------------------------------------------------------------------
  // Private — pie / doughnut charts
  // -----------------------------------------------------------------------

  /**
   * Render pie or doughnut charts as a three-column table showing each
   * slice label, its raw value, and its percentage of the whole.
   *
   * When the chart contains multiple datasets each dataset is rendered
   * in sequence separated by a labelled divider row.
   *
   * @param chart - A chart spec with type `pie` or `doughnut`.
   * @returns Description and table data.
   */
  private renderPieChart(chart: ChartSpec): { description: string; tableData: TableData } {
    const headers = ['Label', 'Value', 'Percentage'];
    const rows: string[][] = [];

    let totalSlices = 0;

    for (const ds of chart.data) {
      const categories = ds.categories ?? ds.values.map((_, i) => `Slice ${i + 1}`);
      const total = ds.values.reduce((sum, v) => sum + v, 0);

      // If there are multiple datasets, insert a dataset label row
      if (chart.data.length > 1) {
        rows.push([`— ${ds.label} —`, '', '']);
      }

      for (let i = 0; i < ds.values.length; i++) {
        const value = ds.values[i] ?? 0;
        const pct = total > 0 ? (value / total) * 100 : 0;
        rows.push([
          categories[i] ?? `Slice ${i + 1}`,
          this.formatNumber(value),
          `${pct.toFixed(1)}%`,
        ]);
        totalSlices++;
      }
    }

    const description = this.buildDescription(chart, chart.data.length, totalSlices);

    return { description, tableData: { headers, rows } };
  }

  // -----------------------------------------------------------------------
  // Private — scatter charts
  // -----------------------------------------------------------------------

  /**
   * Render scatter charts as a three-column table (Dataset, X, Y). For
   * scatter data the values array is interpreted as y-values and the
   * categories array (if present) as x-values. When categories are missing,
   * zero-based indices are used for x.
   *
   * @param chart - A chart spec with type `scatter`.
   * @returns Description and table data.
   */
  private renderScatterChart(chart: ChartSpec): { description: string; tableData: TableData } {
    const headers = [
      'Dataset',
      chart.xAxisLabel ?? 'X',
      chart.yAxisLabel ?? 'Y',
    ];

    const rows: string[][] = [];
    let totalPoints = 0;

    for (const ds of chart.data) {
      for (let i = 0; i < ds.values.length; i++) {
        const xValue = ds.categories?.[i] ?? String(i);
        rows.push([
          ds.label,
          xValue,
          this.formatNumber(ds.values[i] ?? 0),
        ]);
        totalPoints++;
      }
    }

    const description = this.buildDescription(chart, chart.data.length, totalPoints);

    return { description, tableData: { headers, rows } };
  }

  // -----------------------------------------------------------------------
  // Private — utilities
  // -----------------------------------------------------------------------

  /**
   * Resolve category labels from the first dataset that provides them,
   * falling back to 1-based numeric indices.
   *
   * @param datasets - The chart's data series.
   * @returns An array of category label strings.
   */
  private resolveCategories(datasets: ChartDataSet[]): string[] {
    // Use categories from the first dataset that has them
    for (const ds of datasets) {
      if (ds.categories && ds.categories.length > 0) {
        return ds.categories;
      }
    }

    // Fallback: generate numeric indices based on the longest dataset
    const maxLen = Math.max(...datasets.map((ds) => ds.values.length), 0);
    return Array.from({ length: maxLen }, (_, i) => String(i + 1));
  }

  /**
   * Compute the maximum possible row-total across all categories so the
   * ASCII bar widths are globally proportional.
   *
   * @param datasets - The chart's data series.
   * @returns The maximum summed value (minimum 1 to avoid division by zero).
   */
  private globalMaxValue(datasets: ChartDataSet[]): number {
    if (datasets.length === 0) return 1;

    const maxLen = Math.max(...datasets.map((ds) => ds.values.length));
    let max = 0;

    for (let i = 0; i < maxLen; i++) {
      const rowTotal = datasets.reduce((sum, ds) => sum + Math.abs(ds.values[i] ?? 0), 0);
      if (rowTotal > max) max = rowTotal;
    }

    return Math.max(max, 1); // Avoid division by zero
  }

  /**
   * Generate an ASCII bar string proportional to `value / max`.
   *
   * @param value - The current value to represent.
   * @param max   - The maximum reference value (full bar width).
   * @returns A string of filled and empty block characters.
   *
   * @example
   * ```
   * asciiBar(50, 100) // "████████░░░░░░░░"
   * ```
   */
  private asciiBar(value: number, max: number): string {
    const ratio = Math.max(0, Math.min(Math.abs(value) / max, 1));
    const filled = Math.round(ratio * BAR_WIDTH);
    const empty = BAR_WIDTH - filled;
    return BLOCK_FILLED.repeat(filled) + BLOCK_EMPTY.repeat(empty);
  }

  /**
   * Format a number for table display — integers stay as-is, floats get
   * up to two decimal places with trailing zeros stripped.
   *
   * @param n - The number to format.
   * @returns A human-readable string representation.
   */
  private formatNumber(n: number): string {
    if (Number.isInteger(n)) return String(n);
    return n.toFixed(2).replace(/\.?0+$/, '');
  }

  /**
   * Build a human-readable description string summarising the chart.
   *
   * @param chart        - The original chart spec (for type and title).
   * @param datasetCount - Number of data series.
   * @param itemCount    - Number of categories, slices, or data points.
   * @returns A summary string such as
   *   `"Bar chart: Revenue — 2 datasets, 4 categories"`.
   */
  private buildDescription(chart: ChartSpec, datasetCount: number, itemCount: number): string {
    const typeLabel = chart.type.charAt(0).toUpperCase() + chart.type.slice(1);
    const titlePart = chart.title ? `: ${chart.title}` : '';

    let itemLabel: string;
    switch (chart.type) {
      case 'pie':
      case 'doughnut':
        itemLabel = 'slices';
        break;
      case 'scatter':
        itemLabel = 'points';
        break;
      default:
        itemLabel = 'categories';
    }

    return `${typeLabel} chart${titlePart} — ${datasetCount} dataset${datasetCount !== 1 ? 's' : ''}, ${itemCount} ${itemLabel}`;
  }
}
