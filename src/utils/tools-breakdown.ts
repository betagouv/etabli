export interface ToolUsageRow {
  name: string;
  initiativesCount: number;
}

export interface ToolsBreakdownItem {
  name: string;
  percentage: number;
}

export interface ToolsBreakdown {
  tools: ToolsBreakdownItem[]; // Most used first
  othersPercentage: number; // Initiatives using at least a tool not listed above
  notSpecifiedPercentage: number; // Initiatives without any tool of this type
}

export interface ToolsBreakdownCounts {
  initiativesCount: number;
  initiativesWithToolCount: number; // Having at least one tool of the type
  initiativesWithOtherToolCount: number; // Having at least one tool that is not listed
}

// Percentages tell how many initiatives use a tool: an initiative can use several of them so they do not sum to 100
export function computeToolsBreakdown(rows: ToolUsageRow[], counts: ToolsBreakdownCounts): ToolsBreakdown {
  if (counts.initiativesCount === 0) {
    return { tools: [], othersPercentage: 0, notSpecifiedPercentage: 0 };
  }

  const toPercentage = (initiativesCount: number) => (initiativesCount / counts.initiativesCount) * 100;

  return {
    tools: rows.map((row) => ({ name: row.name, percentage: toPercentage(row.initiativesCount) })),
    othersPercentage: toPercentage(counts.initiativesWithOtherToolCount),
    notSpecifiedPercentage: toPercentage(counts.initiativesCount - counts.initiativesWithToolCount),
  };
}
