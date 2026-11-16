import { useMemo, useState, useEffect } from "react";
import {
  Activity,
  Clock,
  Tag,
  CalendarDays,
  TrendingUp,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import * as d3 from "d3";

// --- DATA SOURCE ---
import rawData from "./data/data.json";
import {
  formatDate,
  formatDuration,
  getSeasonTimelineRange,
  getSkiSeason,
  getWeekRangeLabel,
  summarizeSeason,
  type ClockifyData,
  type Session,
} from "./utils.ts";

const typedData = rawData as ClockifyData;

// --- HEATMAP COMPONENT ---
const Heatmap = ({
  sessions,
  isMobile,
}: {
  sessions: Session[];
  isMobile: boolean;
}) => {
  const [activeTooltip, setActiveTooltip] = useState<{
    dateStr: string;
    mins: number;
    items: Session[];
    x: number;
    y: number;
    isWeeklyVol?: boolean;
  } | null>(null);

  const dailyData = useMemo(() => {
    const map = new Map<string, { mins: number; items: Session[] }>();
    sessions.forEach((s) => {
      const day = s.date.split("T")[0];
      const existing = map.get(day) || { mins: 0, items: [] };
      map.set(day, {
        mins: existing.mins + s.durationMinutes,
        items: [...existing.items, s],
      });
    });
    return map;
  }, [sessions]);

  const weeklyMinsMap = useMemo(() => {
    const map = new Map<string, number>();
    sessions.forEach((s) => {
      const date = new Date(s.date);
      const mon = d3.utcMonday.floor(date);
      const key = formatDate(mon);
      map.set(key, (map.get(key) || 0) + s.durationMinutes);
    });
    return map;
  }, [sessions]);

  const maxWeeklyMins = useMemo(() => {
    return d3.max(Array.from(weeklyMinsMap.values())) || 1;
  }, [weeklyMinsMap]);

  const { startDate, endDate, gridStart, mondays, prunedMondays, allDays } =
    useMemo(() => getSeasonTimelineRange(sessions), [sessions]);

  const maxMins = useMemo(() => {
    return d3.max(Array.from(dailyData.values()), (d) => d.mins) || 1;
  }, [dailyData]);

  const colorScale = useMemo(() => {
    return d3
      .scaleSequential((t) => d3.interpolateBlues(0.22 + t * 0.78))
      .domain([0, maxMins]);
  }, [maxMins]);

  const cellSize = isMobile ? 36 : 24;
  const cellPadding = 6;
  const totalCellSize = cellSize + cellPadding;

  const handleMouseEnter = (
    e: React.MouseEvent<SVGRectElement>,
    dateStr: string,
    data?: { mins: number; items: Session[] },
  ) => {
    if (!data || isMobile) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const container = e.currentTarget
      .closest(".heatmap-container")
      ?.getBoundingClientRect();
    if (rect && container) {
      setActiveTooltip({
        dateStr,
        mins: data.mins,
        items: data.items,
        x: rect.left - container.left + rect.width / 2,
        y: rect.top - container.top,
      });
    }
  };

  const handleVolMouseEnter = (
    e: React.MouseEvent<SVGRectElement>,
    monday: Date,
    mins: number,
  ) => {
    if (isMobile) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const container = e.currentTarget
      .closest(".heatmap-container")
      ?.getBoundingClientRect();
    if (rect && container) {
      const nextMon = d3.utcDay.offset(monday, 7);
      const weeklySessions = sessions.filter((s) => {
        const d = new Date(s.date);
        return d >= monday && d < nextMon;
      });

      setActiveTooltip({
        dateStr: formatDate(monday),
        mins,
        items: weeklySessions,
        x: rect.left - container.left + rect.width / 2,
        y: rect.top - container.top,
        isWeeklyVol: true,
      });
    }
  };

  const handleMouseLeave = () => {
    if (isMobile) return;
    setActiveTooltip(null);
  };

  const handleCellClick = (
    e: React.MouseEvent,
    dateStr: string,
    data?: { mins: number; items: Session[] },
  ) => {
    e.stopPropagation();
    if (!data) return;

    if (isMobile) {
      setActiveTooltip({
        dateStr,
        mins: data.mins,
        items: data.items,
        x: 0,
        y: 0,
      });
    }
  };

  const handleMobileVolClick = (
    e: React.MouseEvent,
    monday: Date,
    mins: number,
  ) => {
    e.stopPropagation();
    if (mins === 0) return;

    const nextMon = d3.utcDay.offset(monday, 7);
    const weeklySessions = sessions.filter((s) => {
      const d = new Date(s.date);
      return d >= monday && d < nextMon;
    });

    setActiveTooltip({
      dateStr: formatDate(monday),
      mins,
      items: weeklySessions,
      x: 0,
      y: 0,
      isWeeklyVol: true,
    });
  };

  if (isMobile) {
    return (
      <div className="w-full relative heatmap-container">
        {/* Sticky floating header on mobile that sits directly under page branding bar */}
        <div className="sticky top-[58px] bg-[#fbfcfd]/90 backdrop-blur-md z-35 py-3 -mx-4 px-4 flex justify-between items-center text-[10px] text-slate-400 uppercase font-black border-b border-slate-100 tracking-widest transition-all">
          <div className="w-24 text-left">Week Range</div>
          <div className="flex-1 flex justify-between max-w-[280px] mx-auto w-full px-1">
            {["M", "T", "W", "T", "F", "S", "S"].map((d) => (
              <div key={d} style={{ width: cellSize }} className="text-center">
                {d}
              </div>
            ))}
          </div>
        </div>

        <div className="space-y-3 pt-3">
          {prunedMondays.map((monday) => {
            const mKey = formatDate(monday);
            const weeklyMins = weeklyMinsMap.get(mKey) || 0;

            return (
              <div
                key={monday.toString()}
                className="flex items-center justify-between"
              >
                {/* Mobile stacked left column containing week label and refined slate sparkbar */}
                <div
                  onClick={(e) => handleMobileVolClick(e, monday, weeklyMins)}
                  className={`w-24 flex flex-col items-start justify-center pr-2 ${weeklyMins > 0 ? "cursor-pointer active:opacity-75" : ""}`}
                >
                  <span
                    className={`text-[10px] font-bold leading-tight uppercase tabular-nums ${
                      weeklyMins > 0 ? "text-slate-400" : "text-slate-300"
                    }`}
                  >
                    {getWeekRangeLabel(monday)}
                  </span>
                  {weeklyMins > 0 && (
                    <div className="flex items-center gap-1.5 mt-1 w-full">
                      <span className="text-[9px] text-slate-500 font-black tracking-tight shrink-0 whitespace-nowrap leading-none">
                        {formatDuration(weeklyMins)}
                      </span>
                      <div className="h-1 bg-slate-100 rounded-full flex-1 overflow-hidden min-w-[20px]">
                        <div
                          className="h-full bg-slate-500 rounded-full"
                          style={{
                            width: `${(weeklyMins / maxWeeklyMins) * 100}%`,
                          }}
                        />
                      </div>
                    </div>
                  )}
                </div>

                <div className="flex-1 flex justify-between max-w-[280px] mx-auto w-full px-1">
                  {d3
                    .utcDays(monday, d3.utcDay.offset(monday, 7))
                    .map((day) => {
                      const data = dailyData.get(formatDate(day));
                      return (
                        <div
                          key={day.toString()}
                          onClick={(e) =>
                            handleCellClick(e, formatDate(day), data)
                          }
                          className={`rounded-lg transition-all duration-300 border ${
                            data
                              ? "cursor-pointer active:scale-95 border-transparent shadow-xs"
                              : "pointer-events-none border-slate-200/90"
                          }`}
                          style={{
                            width: cellSize,
                            height: cellSize,
                            backgroundColor: data
                              ? colorScale(data.mins)
                              : "#f8fafc",
                          }}
                        />
                      );
                    })}
                </div>
              </div>
            );
          })}
        </div>

        {activeTooltip && isMobile && (
          <div
            className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs z-50 flex items-end justify-center p-4 animate-in fade-in duration-200"
            onClick={() => setActiveTooltip(null)}
          >
            <div
              className="bg-white w-full max-w-md rounded-[2rem] p-6 space-y-4 shadow-2xl animate-in slide-in-from-bottom duration-300"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex justify-between items-start">
                <div>
                  <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
                    {activeTooltip.isWeeklyVol
                      ? "Weekly Summary"
                      : "Servicemann Session"}
                  </h4>
                  <h3 className="text-xl font-black text-slate-900 leading-tight mt-0.5">
                    {activeTooltip.isWeeklyVol
                      ? `Week of ${d3.utcFormat("%b %d, %Y")(new Date(activeTooltip.dateStr + "T00:00:00Z"))}`
                      : d3.utcFormat("%A, %b %d, %Y")(
                          new Date(activeTooltip.dateStr + "T00:00:00Z"),
                        )}
                  </h3>
                </div>
                <div className="bg-blue-50 text-blue-600 px-3 py-1.5 rounded-full text-xs font-black uppercase">
                  {formatDuration(activeTooltip.mins)} total
                </div>
              </div>

              <div className="border-t border-slate-100 my-2"></div>

              <div className="space-y-3 max-h-64 overflow-y-auto pr-1">
                {activeTooltip.items.map((item, idx) => (
                  <div
                    key={idx}
                    className="bg-slate-50/50 p-4 rounded-2xl border border-slate-100/50 space-y-2"
                  >
                    <div className="flex justify-between items-center gap-2">
                      <span className="text-xs font-black text-slate-500 uppercase tracking-wider">
                        {activeTooltip.isWeeklyVol
                          ? `${formatDuration(item.durationMinutes)} (${d3.utcFormat("%a")(new Date(item.date))})`
                          : formatDuration(item.durationMinutes)}
                      </span>
                      <div className="flex flex-wrap gap-1">
                        {item.tags.map((t) => (
                          <span
                            key={t}
                            className="bg-blue-100/60 text-blue-700 text-[8px] font-black px-1.5 py-0.5 rounded uppercase"
                          >
                            {t}
                          </span>
                        ))}
                      </div>
                    </div>
                    {item.description && (
                      <p className="text-sm text-slate-700 font-semibold leading-relaxed">
                        {item.description}
                      </p>
                    )}
                  </div>
                ))}
              </div>

              <button
                onClick={() => setActiveTooltip(null)}
                className="w-full bg-slate-950 text-white font-black uppercase text-xs py-4 rounded-2xl hover:bg-slate-900 active:scale-[0.98] transition-all"
              >
                Close View
              </button>
            </div>
          </div>
        )}
      </div>
    );
  }

  // Desktop horizontal flow
  const weeksCount = mondays.length;
  const margin = { top: 50, right: 30, bottom: 20, left: 70 };
  const svgWidth =
    (weeksCount + 1) * totalCellSize + margin.left + margin.right;
  const volTrackY = 7 * totalCellSize + 14;
  const volTrackHeight = 54;
  const svgHeight =
    7 * totalCellSize + margin.top + margin.bottom + volTrackHeight + 20;

  const monthLabels = d3
    .utcMonths(startDate, endDate)
    .map((month) => {
      const weekIdx = Math.max(0, d3.utcMonday.count(gridStart, month));
      return {
        label: d3.utcFormat("%B")(month),
        weekIdx,
        x: weekIdx * totalCellSize,
      };
    })
    .filter(
      (item, idx, arr) =>
        idx === arr.length - 1 || item.weekIdx !== arr[idx + 1].weekIdx,
    );

  return (
    <div className="w-full overflow-x-auto py-6 relative scrollbar-hide heatmap-container">
      <svg width={svgWidth} height={svgHeight} className="mx-auto block">
        <g transform={`translate(${margin.left}, ${margin.top})`}>
          {monthLabels.map((m, i) => (
            <text
              key={i}
              x={m.x}
              y="-20"
              className="fill-slate-500 text-[13px] font-black uppercase tracking-[0.25em]"
            >
              {m.label}
            </text>
          ))}

          {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun", "Vol"].map(
            (d, i) => {
              const isVol = d === "Vol";
              const yPos = isVol
                ? volTrackY + volTrackHeight / 2 + 4
                : i * totalCellSize + cellSize / 1.4;

              return (
                <text
                  key={d}
                  x="-15"
                  y={yPos}
                  textAnchor="end"
                  className={`text-[11px] font-black uppercase tracking-tight ${isVol ? "fill-slate-500 font-bold" : "fill-slate-400"}`}
                >
                  {d}
                </text>
              );
            },
          )}

          {allDays.map((day) => {
            const weekIdx = d3.utcMonday.count(gridStart, day);
            const dayIdx = (day.getUTCDay() + 6) % 7;
            const data = dailyData.get(formatDate(day));

            return (
              <rect
                key={day.toString()}
                x={weekIdx * totalCellSize}
                y={dayIdx * totalCellSize}
                width={cellSize}
                height={cellSize}
                rx={7}
                fill={data ? colorScale(data.mins) : "#f8fafc"}
                onMouseEnter={(e) => handleMouseEnter(e, formatDate(day), data)}
                onMouseLeave={handleMouseLeave}
                className="transition-all duration-300 hover:stroke-blue-400 hover:stroke-[3px] cursor-help"
                stroke={data ? "none" : "#e2e8f0"}
                strokeWidth={data ? 0 : 1}
              />
            );
          })}

          {mondays.map((monday) => {
            const mKey = formatDate(monday);
            const weeklyMins = weeklyMinsMap.get(mKey) || 0;
            const weekIdx = d3.utcMonday.count(gridStart, monday);

            const xPos = weekIdx * totalCellSize;
            const barHeight =
              weeklyMins > 0 && maxWeeklyMins > 0
                ? Math.max(4, (weeklyMins / maxWeeklyMins) * volTrackHeight)
                : 0;
            const barY = volTrackY + volTrackHeight - barHeight;

            return (
              <g key={monday.toString()} className="cursor-help">
                <rect
                  x={xPos}
                  y={volTrackY}
                  width={cellSize}
                  height={volTrackHeight}
                  rx={5}
                  fill="#f1f5f9"
                  onMouseEnter={(e) =>
                    handleVolMouseEnter(e, monday, weeklyMins)
                  }
                  onMouseLeave={handleMouseLeave}
                />
                {/* Sleek Charcoal Slate Fill bar matching recommendations (#475569) */}
                {weeklyMins > 0 && (
                  <rect
                    x={xPos}
                    y={barY}
                    width={cellSize}
                    height={barHeight}
                    rx={5}
                    fill="#475569"
                    className="pointer-events-none"
                  />
                )}
              </g>
            );
          })}
        </g>
      </svg>

      {activeTooltip && !isMobile && (
        <div
          className="absolute z-50 bg-white/95 backdrop-blur-md border border-slate-100 p-4 rounded-2xl shadow-xl w-80 pointer-events-none transition-all duration-150"
          style={{
            left: activeTooltip.x,
            top: activeTooltip.y,
            transform: "translate(-50%, -100%)",
            marginTop: "-10px",
          }}
        >
          <div className="flex justify-between items-start gap-4 mb-2">
            <div>
              <h4 className="text-[9px] font-black text-slate-400 uppercase tracking-widest leading-none">
                {activeTooltip.isWeeklyVol
                  ? "Weekly Volume"
                  : d3.utcFormat("%A")(
                      new Date(activeTooltip.dateStr + "T00:00:00Z"),
                    )}
              </h4>
              <h3 className="text-sm font-black text-slate-950 mt-1">
                {activeTooltip.isWeeklyVol
                  ? `Week of ${d3.utcFormat("%b %d, %Y")(new Date(activeTooltip.dateStr + "T00:00:00Z"))}`
                  : d3.utcFormat("%b %d, %Y")(
                      new Date(activeTooltip.dateStr + "T00:00:00Z"),
                    )}
              </h3>
            </div>
            <div className="bg-blue-50 text-blue-600 px-2 py-1 rounded-md text-[10px] font-black uppercase whitespace-nowrap">
              {formatDuration(activeTooltip.mins)} total
            </div>
          </div>

          <div className="border-t border-slate-100 my-2"></div>

          <div className="space-y-3 max-h-48 overflow-y-auto pr-1">
            {activeTooltip.items.length === 0 ? (
              <p className="text-slate-400 text-xs italic text-center py-2">
                No activity recorded
              </p>
            ) : (
              activeTooltip.items.map((item, idx) => (
                <div key={idx} className="text-xs space-y-1">
                  <div className="flex justify-between items-start gap-2">
                    <span className="font-black text-slate-800 uppercase tracking-wide">
                      {activeTooltip.isWeeklyVol
                        ? `${formatDuration(item.durationMinutes)} (${d3.utcFormat("%a")(new Date(item.date))})`
                        : formatDuration(item.durationMinutes)}
                    </span>
                    <div className="flex flex-wrap gap-0.5 justify-end">
                      {item.tags.map((t) => (
                        <span
                          key={t}
                          className="bg-blue-50 text-blue-600 text-[8px] font-black px-1.5 py-0.5 rounded uppercase"
                        >
                          {t}
                        </span>
                      ))}
                    </div>
                  </div>
                  {item.description && (
                    <p className="text-slate-600 font-semibold leading-relaxed">
                      {item.description}
                    </p>
                  )}
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
};

// --- MAIN APP ---
export default function App() {
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);
  const [expandedTimelines, setExpandedTimelines] = useState<
    Record<string, boolean>
  >({});

  const toggleSeasonTimeline = (season: string) => {
    setExpandedTimelines((prev) => ({
      ...prev,
      [season]: !prev[season],
    }));
  };

  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  const lastSyncStr = useMemo(() => {
    const d = new Date(typedData.lastUpdated);
    const datePart = d.toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
    const timePart = d.toLocaleTimeString(undefined, {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });
    return `last sync on ${datePart}, ${timePart}`;
  }, []);

  const seasonsData = useMemo(() => {
    const seasonMap: Record<
      string,
      { sessions: Session[]; totalMins: number }
    > = {};

    typedData.sessions.forEach((session) => {
      const season = getSkiSeason(session.date);
      if (!seasonMap[season]) {
        seasonMap[season] = { sessions: [], totalMins: 0 };
      }
      seasonMap[season].sessions.push(session);
      seasonMap[season].totalMins += session.durationMinutes;
    });

    const sortedSeasons = Object.entries(seasonMap).sort((a, b) =>
      b[0].localeCompare(a[0]),
    );

    return sortedSeasons.map(([season, data]) => {
      const summary = summarizeSeason(season, data.sessions, data.totalMins);

      return {
        season,
        sessions: data.sessions,
        weeksCount: summary.weeksCount,
        dateRangeStr: summary.dateRangeStr,
        totalDurationStr: summary.totalDurationStr,
        metrics: [
          {
            label: "Total Sessions",
            val: summary.totalSessions,
            icon: Activity,
            color: "blue",
          },
          {
            label: "Workshop Time",
            val: summary.totalDurationStr,
            icon: Clock,
            color: "emerald",
          },
          {
            label: "Avg Session",
            val: summary.avgSessionStr,
            icon: TrendingUp,
            color: "indigo",
          },
          {
            label: "Longest Service",
            val: summary.longestServiceStr,
            icon: CalendarDays,
            color: "amber",
          },
          {
            label: "Peak Month",
            val: summary.peakMonthStr,
            icon: Tag,
            color: "sky",
          },
          {
            label: "Sessions / Week",
            val: summary.sessionsPerWeekStr,
            icon: Activity,
            color: "rose",
          },
        ],
      };
    });
  }, []);

  return (
    <div className="min-h-screen bg-[#fbfcfd] px-4 py-0 md:p-12 font-sans text-slate-900">
      <div className="max-w-7xl mx-auto space-y-4 md:space-y-12">
        {/* Header (Sticky floating bar on mobile) */}
        <header className="sticky top-0 bg-[#fbfcfd]/90 backdrop-blur-md z-40 pt-4 pb-2 -mx-4 px-4 border-b border-slate-100/60 md:static md:bg-transparent md:backdrop-blur-none md:p-0 md:m-0 md:border-b-0 md:pb-8">
          <div className="space-y-0.5">
            <h1 className="text-3xl md:text-5xl font-black tracking-tighter text-slate-950 italic lowercase leading-none">
              servicemann.rigo.ski
            </h1>
            <p className="text-slate-400 text-[10px] md:text-xs font-semibold flex items-center gap-1.5 tracking-[0.05em] normal-case leading-none">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shadow-[0_0_12px_rgba(16,185,129,0.8)]"></span>
              {lastSyncStr}
            </p>
          </div>
        </header>

        {/* Live Workshop Activity Feed */}
        <div className="space-y-10 md:space-y-16 pb-8">
          {seasonsData.map(
            (
              {
                season,
                sessions,
                metrics,
                weeksCount,
                dateRangeStr,
                totalDurationStr,
              },
              index,
            ) => {
              const isPreviousSeason = index > 0;
              const isTimelineExpanded =
                !isPreviousSeason || !!expandedTimelines[season];

              return (
                <section key={season} className="space-y-6 md:space-y-8">
                  {isPreviousSeason ? (
                    <div className="pt-6 md:pt-10">
                      <div className="flex items-center gap-3 mb-6">
                        <div className="h-px bg-slate-200 flex-1" />
                        <span className="text-[11px] font-black uppercase tracking-[0.25em] text-slate-400 bg-slate-100/80 px-3.5 py-1 rounded-full border border-slate-200/60">
                          Season {season}
                        </span>
                        <div className="h-px bg-slate-200 flex-1" />
                      </div>
                    </div>
                  ) : (
                    /* Season Section Title (Desktop-only to keep mobile completely stream-focused) */
                    <div className="hidden md:flex items-center justify-between border-b border-slate-100 pb-3">
                      <h2 className="text-3xl font-black tracking-tight uppercase italic text-slate-900">
                        Season {season}
                      </h2>
                      <span className="bg-slate-100 text-slate-500 text-xs font-bold px-3 py-1 rounded-full uppercase tracking-widest">
                        {sessions.length} sessions
                      </span>
                    </div>
                  )}

                  {/* Visual Heatmap Grid (Expanded for current season, collapsible for previous seasons) */}
                  {isPreviousSeason ? (
                    <div className="bg-white rounded-[1.5rem] border border-slate-200/80 shadow-xs overflow-hidden transition-all">
                      <button
                        type="button"
                        onClick={() => toggleSeasonTimeline(season)}
                        className="w-full p-4 flex items-center justify-between text-left hover:bg-slate-50/60 active:bg-slate-100/50 transition-colors cursor-pointer"
                      >
                        <div className="flex items-center gap-3.5 min-w-0">
                          <div className="bg-slate-100 text-slate-600 p-2.5 rounded-xl shrink-0">
                            <CalendarDays size={18} strokeWidth={2.5} />
                          </div>
                          <div className="min-w-0">
                            <p className="text-xs md:text-sm font-black uppercase italic text-slate-900 tracking-tight truncate">
                              Season {season} Timeline
                            </p>
                            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider truncate mt-0.5">
                              {dateRangeStr} • {weeksCount}{" "}
                              {weeksCount === 1 ? "week" : "weeks"} •{" "}
                              {sessions.length}{" "}
                              {sessions.length === 1 ? "session" : "sessions"} (
                              {totalDurationStr})
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-1.5 bg-slate-100 text-slate-600 px-3 py-1.5 rounded-full text-[10px] font-black uppercase tracking-wider shrink-0 ml-3">
                          <span>
                            {isTimelineExpanded ? "Hide" : "Timeline"}
                          </span>
                          {isTimelineExpanded ? (
                            <ChevronUp size={14} strokeWidth={2.5} />
                          ) : (
                            <ChevronDown size={14} strokeWidth={2.5} />
                          )}
                        </div>
                      </button>

                      {isTimelineExpanded && (
                        <div className="px-4 pb-5 pt-2 border-t border-slate-100">
                          <Heatmap sessions={sessions} isMobile={isMobile} />
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="py-2">
                      <Heatmap sessions={sessions} isMobile={isMobile} />
                    </div>
                  )}

                  {/* Scorecard: 6 items wide in a single row on desktop */}
                  <div className="space-y-4 pt-4 md:pt-0">
                    <div className="px-2">
                      <span className="text-[11px] font-black uppercase text-slate-400 tracking-[0.25em]">
                        Season {season} Scorecard
                      </span>
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
                      {metrics.map((m) => (
                        <div
                          key={m.label}
                          className="bg-white p-4 rounded-[1.5rem] shadow-sm border border-slate-100 hover:shadow-md transition-all flex items-center space-x-3.5"
                        >
                          <div
                            className={`bg-${m.color}-50 p-2.5 rounded-xl text-${m.color}-600 hidden sm:block shrink-0`}
                          >
                            <m.icon size={18} strokeWidth={2.5} />
                          </div>
                          <div className="min-w-0">
                            <p className="text-[9px] font-black uppercase text-slate-400 tracking-wider mb-1 leading-none truncate">
                              {m.label}
                            </p>
                            <p
                              className="text-sm md:text-base lg:text-lg font-black italic text-slate-900 leading-snug truncate"
                              title={m.val.toString()}
                            >
                              {m.val}
                            </p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </section>
              );
            },
          )}
        </div>
      </div>
    </div>
  );
}
