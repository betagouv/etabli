/**
 * @jest-environment node
 */
import { computeToolsBreakdown } from '@etabli/src/utils/tools-breakdown';

describe('computeToolsBreakdown()', () => {
  it('should count initiatives without tools as not specified', () => {
    const breakdown = computeToolsBreakdown([{ name: 'PHP', initiativesCount: 3 }], {
      initiativesCount: 4,
      initiativesWithToolCount: 3,
      initiativesWithOtherToolCount: 0,
    });

    expect(breakdown.tools).toStrictEqual([{ name: 'PHP', percentage: 75 }]);
    expect(breakdown.notSpecifiedPercentage).toBe(25);
    expect(breakdown.othersPercentage).toBe(0);
  });

  it('should count an initiative fully for each of its tools', () => {
    // 2 initiatives with both tools, 1 with only CakePHP, 1 without any
    const breakdown = computeToolsBreakdown(
      [
        { name: 'CakePHP', initiativesCount: 3 },
        { name: 'Bootstrap', initiativesCount: 2 },
      ],
      { initiativesCount: 4, initiativesWithToolCount: 3, initiativesWithOtherToolCount: 0 }
    );

    expect(breakdown.tools.map((tool) => tool.percentage)).toStrictEqual([75, 50]);
    expect(breakdown.notSpecifiedPercentage).toBe(25);
  });

  it('should tell how many initiatives use tools not listed', () => {
    const breakdown = computeToolsBreakdown([{ name: 'A', initiativesCount: 2 }], {
      initiativesCount: 4,
      initiativesWithToolCount: 4,
      initiativesWithOtherToolCount: 1,
    });

    expect(breakdown.othersPercentage).toBe(25);
    expect(breakdown.notSpecifiedPercentage).toBe(0);
  });

  it('should handle an empty scope', () => {
    expect(computeToolsBreakdown([], { initiativesCount: 0, initiativesWithToolCount: 0, initiativesWithOtherToolCount: 0 })).toStrictEqual({
      tools: [],
      othersPercentage: 0,
      notSpecifiedPercentage: 0,
    });
  });
});
