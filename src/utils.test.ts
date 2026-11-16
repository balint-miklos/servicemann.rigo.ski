import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  computeDesktopTimelineLayout,
  formatDate,
  formatDuration,
  getSeasonTimelineRange,
  getSkiSeason,
  getWeekRangeLabel,
  summarizeSeason,
  type Session,
} from "./utils.ts";

const makeSession = (
  id: string,
  date: string,
  durationMinutes: number,
): Session => ({
  id,
  date,
  durationMinutes,
  description: `Session ${id}`,
  tags: ["ski"],
});

describe("getSkiSeason", () => {
  it("assigns August through December to the starting year season", () => {
    assert.equal(getSkiSeason("2025-08-01T10:00:00Z"), "25/26");
    assert.equal(getSkiSeason("2025-11-15T12:00:00Z"), "25/26");
    assert.equal(getSkiSeason("2026-11-13T14:54:26Z"), "26/27");
  });

  it("assigns January through July to the ending year season", () => {
    assert.equal(getSkiSeason("2026-01-05T10:00:00Z"), "25/26");
    assert.equal(getSkiSeason("2026-05-13T07:09:15Z"), "25/26");
    assert.equal(getSkiSeason("2026-07-31T23:59:59Z"), "25/26");
  });
});

describe("formatDuration", () => {
  it("formats durations under 60 minutes in minutes", () => {
    assert.equal(formatDuration(0), "0m");
    assert.equal(formatDuration(45), "45m");
    assert.equal(formatDuration(59), "59m");
  });

  it("formats exact hours without trailing minutes", () => {
    assert.equal(formatDuration(60), "1h");
    assert.equal(formatDuration(120), "2h");
  });

  it("formats durations >= 60 minutes as hours and minutes", () => {
    assert.equal(formatDuration(64), "1h 4m");
    assert.equal(formatDuration(242), "4h 2m");
  });
});

describe("getWeekRangeLabel", () => {
  it("formats same-month week ranges concisely", () => {
    const monday = new Date("2026-11-09T00:00:00Z");
    assert.equal(getWeekRangeLabel(monday), "Nov 09–15");
  });

  it("formats cross-month week ranges with both month names", () => {
    const monday = new Date("2025-10-27T00:00:00Z");
    assert.equal(getWeekRangeLabel(monday), "Oct 27–Nov 02");
  });
});

describe("getSeasonTimelineRange", () => {
  it("starts at the first non-empty week and skips earlier empty weeks in that month", () => {
    const sessions = [
      makeSession("1", "2026-11-13T14:54:26Z", 87),
      makeSession("2", "2026-11-15T16:27:08Z", 48),
    ];

    const range = getSeasonTimelineRange(sessions);

    assert.equal(formatDate(range.gridStart), "2026-11-09");
    assert.equal(range.prunedMondays.length, 1);
    assert.equal(formatDate(range.prunedMondays[0]), "2026-11-09");
    assert.equal(range.allDays.length, range.mondays.length * 7);
    assert.equal(formatDate(range.allDays[0]), "2026-11-09");
  });

  it("includes empty weeks between the first and last active weeks", () => {
    const sessions = [
      makeSession("1", "2025-11-07T10:00:00Z", 95),
      makeSession("2", "2025-11-26T08:00:00Z", 60),
    ];

    const range = getSeasonTimelineRange(sessions);
    const weekKeys = range.prunedMondays.map(formatDate);

    assert.deepEqual(weekKeys, [
      "2025-11-24",
      "2025-11-17",
      "2025-11-10",
      "2025-11-03",
    ]);
    assert.equal(range.allDays.length, range.mondays.length * 7);
  });
});

describe("summarizeSeason", () => {
  it("computes scorecard metrics with hour-and-minute durations", () => {
    const sessions = [
      makeSession("1", "2025-11-07T10:00:00Z", 95),
      makeSession("2", "2025-11-26T08:00:00Z", 45),
      makeSession("3", "2025-12-04T11:00:00Z", 100),
    ];
    const totalMins = 95 + 45 + 100;

    const summary = summarizeSeason("25/26", sessions, totalMins);

    assert.equal(summary.season, "25/26");
    assert.equal(summary.totalSessions, 3);
    assert.equal(summary.totalDurationStr, "4h");
    assert.equal(summary.avgSessionStr, "1h 20m");
    assert.equal(summary.longestServiceStr, "1h 40m (Dec 04)");
    assert.equal(summary.peakMonthStr, "November (2 sess.)");
    assert.equal(summary.weeksCount, 5);
    assert.equal(summary.dateRangeStr, "Nov 2025 – Dec 2025");
    assert.equal(summary.sessionsPerWeekStr, "0.30 / wk");
  });
});

describe("computeDesktopTimelineLayout", () => {
  it("separates consecutive months with a wider inter-month gap than intra-month gap", () => {
    const { mondays } = getSeasonTimelineRange([
      makeSession("1", "2025-11-07T10:00:00Z", 95),
      makeSession("2", "2025-12-12T10:00:00Z", 60),
    ]);

    const layout = computeDesktopTimelineLayout(mondays, 1140);

    assert.equal(layout.monthGroups.length, 2);
    assert.equal(layout.monthGroups[0].label, "November");
    assert.equal(layout.monthGroups[1].label, "December");
    assert.ok(layout.monthGap > layout.weekGap);

    const decFirstWeek = layout.monthGroups[1].firstWeekIdx;
    const intraStep = layout.weekX[1] - layout.weekX[0];
    const interStep = layout.weekX[decFirstWeek] - layout.weekX[decFirstWeek - 1];
    assert.ok(Math.abs(intraStep - (layout.cellSize + layout.weekGap)) < 1e-6);
    assert.ok(Math.abs(interStep - (layout.cellSize + layout.monthGap)) < 1e-6);
  });

  it("fills 100% of container width for a full 7-month season at desktop width", () => {
    const { mondays } = getSeasonTimelineRange([
      makeSession("1", "2025-11-07T10:00:00Z", 95),
      makeSession("2", "2026-05-13T07:09:15Z", 60),
    ]);

    const layout = computeDesktopTimelineLayout(mondays, 1140);

    assert.equal(layout.monthGroups.length, 7);
    assert.ok(Math.abs(layout.svgWidth - 1140) < 1e-6);
  });
});

