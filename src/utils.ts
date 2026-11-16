import * as d3 from "d3";

export interface Session {
  id: string;
  date: string;
  durationMinutes: number;
  description: string;
  tags: string[];
}

export interface ClockifyData {
  lastUpdated: string;
  availableTags: string[];
  sessions: Session[];
}

export function getSkiSeason(dateString: string): string {
  const d = new Date(dateString);
  const year = d.getUTCFullYear();
  const month = d.getUTCMonth();
  if (month >= 7) {
    return `${year.toString().slice(-2)}/${(year + 1).toString().slice(-2)}`;
  }
  return `${(year - 1).toString().slice(-2)}/${year.toString().slice(-2)}`;
}

export function formatDate(date: Date): string {
  return date.toISOString().split("T")[0];
}

export function formatDuration(mins: number): string {
  const rounded = Math.round(mins);
  if (rounded < 60) return `${rounded}m`;
  const h = Math.floor(rounded / 60);
  const m = rounded % 60;
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

export function getWeekRangeLabel(monday: Date): string {
  const sunday = d3.utcDay.offset(monday, 6);
  const monFormat = d3.utcFormat("%b %d");
  if (monday.getUTCMonth() === sunday.getUTCMonth()) {
    return `${monFormat(monday)}–${d3.utcFormat("%d")(sunday)}`;
  }
  return `${monFormat(monday)}–${monFormat(sunday)}`;
}

export function getSeasonTimelineRange(sessions: Session[]) {
  const dates = sessions.map((s) => new Date(s.date));
  const extent = d3.extent(dates) as [Date | undefined, Date | undefined];
  const fallback = new Date();
  const minDate = extent[0] || fallback;
  const maxDate = extent[1] || fallback;

  const startDate = d3.utcMonth.floor(minDate);
  const endDate = d3.utcMonth.ceil(maxDate);
  const gridStart = d3.utcMonday.floor(minDate);
  const lastSessionMonday = d3.utcMonday.floor(maxDate);
  const activeEndDate = d3.utcDay.offset(lastSessionMonday, 7);

  const mondays = d3.utcMondays(gridStart, endDate);
  const prunedMondays = d3.utcMondays(gridStart, activeEndDate).reverse();
  const gridEnd =
    mondays.length > 0
      ? d3.utcDay.offset(mondays[mondays.length - 1], 7)
      : endDate;
  const allDays = d3.utcDays(gridStart, gridEnd);

  return {
    startDate,
    endDate,
    gridStart,
    activeEndDate,
    mondays,
    prunedMondays,
    gridEnd,
    allDays,
  };
}

export function summarizeSeason(
  season: string,
  sessions: Session[],
  totalMins: number,
) {
  const totalSessions = sessions.length;
  const totalDurationStr = formatDuration(totalMins);
  const avgMinutes = totalSessions ? Math.round(totalMins / totalSessions) : 0;
  const avgSessionStr = formatDuration(avgMinutes);

  let longestServiceStr = "-";
  if (totalSessions > 0) {
    const longest = sessions.reduce(
      (max, curr) => (curr.durationMinutes > max.durationMinutes ? curr : max),
      sessions[0],
    );
    const longestDate = d3.utcFormat("%b %d")(new Date(longest.date));
    longestServiceStr = `${formatDuration(longest.durationMinutes)} (${longestDate})`;
  }

  let peakMonthStr = "-";
  if (totalSessions > 0) {
    const monthGroups = d3.groups(sessions, (s) =>
      d3.utcFormat("%B")(new Date(s.date)),
    );
    monthGroups.sort((a, b) => b[1].length - a[1].length);
    const peakMonthName = monthGroups[0][0];
    const peakMonthCount = monthGroups[0][1].length;
    peakMonthStr = `${peakMonthName} (${peakMonthCount} sess.)`;
  }

  let sessionsPerWeekStr = "-";
  let weeksCount = 0;
  let dateRangeStr = "-";
  if (totalSessions > 0) {
    const dates = sessions.map((s) => new Date(s.date));
    const extent = d3.extent(dates) as [Date, Date];
    const start = d3.utcMonth.floor(extent[0]);
    const end = d3.utcMonth.ceil(extent[1]);
    const monthGridStart = d3.utcMonday.floor(start);
    const metricWeeksCount = d3.utcMondays(monthGridStart, end).length || 1;
    sessionsPerWeekStr = `${(totalSessions / metricWeeksCount).toFixed(2)} / wk`;

    const firstSessionMonday = d3.utcMonday.floor(extent[0]);
    const lastSessionMonday = d3.utcMonday.floor(extent[1]);
    const activeEndDate = d3.utcDay.offset(lastSessionMonday, 7);
    weeksCount = d3.utcMondays(firstSessionMonday, activeEndDate).length || 1;

    const monthYearFmt = d3.utcFormat("%b %Y");
    const startStr = monthYearFmt(extent[0]);
    const endStr = monthYearFmt(extent[1]);
    dateRangeStr = startStr === endStr ? startStr : `${startStr} – ${endStr}`;
  }

  return {
    season,
    totalSessions,
    totalDurationStr,
    avgSessionStr,
    longestServiceStr,
    peakMonthStr,
    sessionsPerWeekStr,
    weeksCount,
    dateRangeStr,
  };
}
