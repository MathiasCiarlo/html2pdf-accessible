/** Header relationships are resolved in the DOM, before pagination changes it. */
export interface TableHeaderInfo {
  scope?: "Column" | "Row" | "Both";
  headers: Element[];
}

export function resolveTableHeaders(
  root: Element
): Map<Element, TableHeaderInfo> {
  const result = new Map<Element, TableHeaderInfo>();
  const tables =
    root.tagName.toLowerCase() === "table"
      ? [root]
      : Array.from(root.querySelectorAll("table"));
  for (const table of tables) {
    const rows = Array.from(table.querySelectorAll("tr")).filter(
      (row) => row.closest("table") === table
    );
    const grid: Element[][] = [];
    const positions = new Map<
      Element,
      { row: number; col: number; width: number; height: number }
    >();
    rows.forEach((row, rowIndex) => {
      grid[rowIndex] = grid[rowIndex] || [];
      let col = 0;
      for (const cell of Array.from(row.children).filter((cell) =>
        /^(th|td)$/i.test(cell.tagName)
      )) {
        while (grid[rowIndex][col]) col++;
        const width = Math.max(1, (cell as HTMLTableCellElement).colSpan);
        const rawHeight = (cell as HTMLTableCellElement).rowSpan;
        const groupRows = rows.filter(
          (candidate) => candidate.parentElement === row.parentElement
        );
        const remaining = groupRows.length - groupRows.indexOf(row);
        const height = Math.min(
          rawHeight === 0 ? remaining : Math.max(1, rawHeight),
          remaining
        );
        positions.set(cell, { row: rowIndex, col, width, height });
        for (let y = rowIndex; y < rowIndex + height; y++) {
          grid[y] = grid[y] || [];
          for (let x = col; x < col + width; x++) grid[y][x] = cell;
        }
        col += width;
      }
    });
    const columns = Math.max(0, ...grid.map((row) => row.length));
    const headerCells = Array.from(positions.keys()).filter(
      (cell) =>
        cell.tagName.toLowerCase() === "th" ||
        ["columnheader", "rowheader"].includes(cell.getAttribute("role") || "")
    );
    const rowGroups = new Set<Element>();
    for (const header of headerCells) {
      const position = positions.get(header);
      if (!position) throw new Error("Missing table header position");
      const scope = header.getAttribute("scope")?.toLowerCase();
      // A lone, full-width TH in TBODY labels a category rather than a column.
      const category =
        header.parentElement?.parentElement?.tagName.toLowerCase() ===
          "tbody" &&
        header.parentElement.children.length === 1 &&
        position.width === columns &&
        columns > 1;
      if (scope === "rowgroup" || (!scope && category)) rowGroups.add(header);
      const role = header.getAttribute("role");
      const inferredRow =
        !scope &&
        header.parentElement?.querySelector("td") &&
        position.col === 0 &&
        position.width === 1 &&
        !category;
      const pdfScope =
        scope === "row" || scope === "rowgroup" || role === "rowheader"
          ? "Row"
          : scope === "both"
          ? "Both"
          : role === "columnheader"
          ? "Column"
          : inferredRow
          ? "Row"
          : "Column";
      result.set(header, {
        scope: rowGroups.has(header) ? "Row" : pdfScope,
        headers: [],
      });
    }
    for (const [cell, position] of positions) {
      const explicit = cell.getAttribute("headers");
      let headers: Element[] = [];
      if (explicit !== null) {
        for (const id of explicit.trim().split(/\s+/).filter(Boolean)) {
          const matches = headerCells.filter((header) => header.id === id);
          if (matches.length !== 1)
            throw new Error(
              `Table headers: '${id}' must identify exactly one TH in the same table`
            );
          if (matches[0] === cell)
            throw new Error(`Table headers: '${id}' refers to the cell itself`);
          headers.push(matches[0]);
        }
      } else if (!rowGroups.has(cell)) {
        headers = headerCells.filter((header) => {
          if (header === cell) return false;
          const hp = positions.get(header);
          if (!hp) throw new Error("Missing table header position");
          if (rowGroups.has(header)) {
            if (
              rows[hp.row].parentElement !== rows[position.row].parentElement ||
              hp.row >= position.row
            )
              return false;
            return !Array.from(rowGroups).some((next) => {
              const np = positions.get(next);
              if (!np) throw new Error("Missing table header position");
              return (
                rows[np.row].parentElement === rows[hp.row].parentElement &&
                np.row > hp.row &&
                np.row <= position.row
              );
            });
          }
          const scope = result.get(header)?.scope;
          const columnOverlap =
            hp.col < position.col + position.width &&
            position.col < hp.col + hp.width;
          const rowOverlap =
            hp.row < position.row + position.height &&
            position.row < hp.row + hp.height;
          return (
            ((scope === "Column" || scope === "Both") &&
              hp.row < position.row &&
              columnOverlap) ||
            ((scope === "Row" || scope === "Both") &&
              hp.col < position.col &&
              rowOverlap)
          );
        });
      }
      const info = result.get(cell) || { headers: [] };
      info.headers = Array.from(new Set(headers));
      result.set(cell, info);
    }
  }
  return result;
}
