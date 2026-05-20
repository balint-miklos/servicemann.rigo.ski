import { useMemo, useState, useEffect } from "react";
import { Activity, Clock, Tag, CalendarDays, TrendingUp } from "lucide-react";
import * as d3 from "d3";

// --- DATA SOURCE ---
import rawData from "./data/data.json";

// --- TYPES ---
interface Session {
  id: string;
  date: string;
  durationMinutes: number;
  description: string;
  tags: string[];
}

interface ClockifyData {
  lastUpdated: string;
  availableTags: string[];
  sessions: Session[];
}

const typedData = rawData as ClockifyData;

// --- UTILS ---
const getSkiSeason = (dateString: string) => {
  const d = new Date(dateString);
  const year = d.getUTCFullYear();
  const month = d.getUTCMonth();
  if (month >= 7) {
    return `${year.toString().slice(-2)}/${(year + 1).toString().slice(-2)}`;
  } else {
    return `${(year - 1).toString().slice(-2)}/${year.toString().slice(-2)}`;
  }
};

const formatDate = (date: Date) => date.toISOString().split("T")[0];

const getWeekRangeLabel = (monday: Date) => {
  const sunday = d3.utcDay.offset(monday, 6);
  const monFormat = d3.utcFormat("%b %d");
  if (monday.getUTCMonth() === sunday.getUTCMonth()) {
    return `${monFormat(monday)}–${d3.utcFormat("%d")(sunday)}`;
  } else {
    return `${monFormat(monday)}–${monFormat(sunday)}`;
  }
};

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

  const dates = useMemo(
    () => sessions.map((s) => new Date(s.date)),
    [sessions],
  );
  const extent = useMemo(() => d3.extent(dates) as [Date, Date], [dates]);

  const startDate = useMemo(
    () => d3.utcMonth.floor(extent[0] || new Date()),
    [extent],
  );
  const endDate = useMemo(
    () => d3.utcMonth.ceil(extent[1] || new Date()),
    [extent],
  );
  const gridStart = useMemo(() => d3.utcMonday.floor(startDate), [startDate]);
  const allDays = useMemo(
    () => d3.utcDays(startDate, endDate),
    [startDate, endDate],
  );

  const maxMins = useMemo(() => {
    return d3.max(Array.from(dailyData.values()), (d) => d.mins) || 1;
  }, [dailyData]);

  const colorScale = useMemo(() => {
    return d3
      .scaleSequential()
      .domain([0, maxMins])
      .interpolator(d3.interpolateBlues);
  }, [maxMins]);

  // Define mondays in the main component scope for access in all rendering paths
  const mondays = useMemo(() => {
    return d3.utcMondays(gridStart, endDate);
  }, [gridStart, endDate]);

  const cellSize = isMobile ? 36 : 24;
  const cellPadding = 6;
  const totalCellSize = cellSize + cellPadding;

  const handleMouseEnter = (
    e: React.MouseEvent<SVGRectElement>,
    dateStr: string,
    data: any,
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

  const handleCellClick = (e: React.MouseEvent, dateStr: string, data: any) => {
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

  // Filter out any trailing weeks that occur completely after the very last service week
  const prunedMondays = useMemo(() => {
    const lastSessionMonday = extent[1]
      ? d3.utcMonday.floor(extent[1])
      : new Date();
    const activeEndDate = d3.utcDay.offset(lastSessionMonday, 7);
    return d3.utcMondays(gridStart, activeEndDate).reverse();
  }, [gridStart, extent]);

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
            const weeklyHours = (weeklyMins / 60).toFixed(1);

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
                  <span className="text-[10px] text-slate-300 font-bold leading-tight uppercase tabular-nums">
                    {getWeekRangeLabel(monday)}
                  </span>
                  {weeklyMins > 0 && (
                    <div className="flex items-center gap-1.5 mt-1 w-full">
                      <span className="text-[9px] text-slate-500 font-black tracking-tight shrink-0 whitespace-nowrap leading-none">
                        {weeklyHours}h
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
                      const isInSeason = day >= extent[0] && day <= extent[1];
                      return (
                        <div
                          key={day.toString()}
                          onClick={(e) =>
                            handleCellClick(e, formatDate(day), data)
                          }
                          className={`rounded-lg transition-all duration-300 border ${
                            data
                              ? "cursor-pointer active:scale-95 border-transparent shadow-xs"
                              : "pointer-events-none border-slate-200/40"
                          }`}
                          style={{
                            width: cellSize,
                            height: cellSize,
                            backgroundColor: data
                              ? colorScale(data.mins)
                              : "#ffffff",
                            opacity: isInSeason ? 1 : 0.08,
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
                  {activeTooltip.isWeeklyVol
                    ? `${(activeTooltip.mins / 60).toFixed(1)}h total`
                    : `${activeTooltip.mins}m total`}
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
                          ? `${item.durationMinutes}m (${d3.utcFormat("%a")(new Date(item.date))})`
                          : `${item.durationMinutes} mins`}
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
  const svgHeight = 7 * totalCellSize + margin.top + margin.bottom + 45;

  const monthLabels = d3.utcMonths(startDate, endDate).map((month) => {
    const weekIdx = d3.utcMonday.count(gridStart, month);
    return {
      label: d3.utcFormat("%B")(month),
      x: weekIdx * totalCellSize,
    };
  });

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
                ? 7 * totalCellSize + 15 + cellSize / 1.4
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
            const isInSeason = day >= extent[0] && day <= extent[1];

            return (
              <rect
                key={day.toString()}
                x={weekIdx * totalCellSize}
                y={dayIdx * totalCellSize}
                width={cellSize}
                height={cellSize}
                rx={7}
                fill={data ? colorScale(data.mins) : "#ffffff"}
                onMouseEnter={(e) => handleMouseEnter(e, formatDate(day), data)}
                onMouseLeave={handleMouseLeave}
                className="transition-all duration-300 hover:stroke-blue-400 hover:stroke-[3px] cursor-help"
                stroke={data ? "none" : "#e2e8f0"}
                strokeWidth={data ? 0 : 1}
                opacity={isInSeason ? 1 : 0.15}
              />
            );
          })}

          {mondays.map((monday) => {
            const mKey = formatDate(monday);
            const weeklyMins = weeklyMinsMap.get(mKey) || 0;
            const weekIdx = d3.utcMonday.count(gridStart, monday);

            const xPos = weekIdx * totalCellSize;
            const trackY = 7 * totalCellSize + 15;
            const trackHeight = 18;
            const barHeight =
              maxWeeklyMins > 0
                ? (weeklyMins / maxWeeklyMins) * trackHeight
                : 0;
            const barY = trackY + trackHeight - barHeight;

            return (
              <g key={monday.toString()} className="cursor-help">
                <rect
                  x={xPos}
                  y={trackY}
                  width={cellSize}
                  height={trackHeight}
                  rx={4}
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
                    rx={4}
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
              {activeTooltip.isWeeklyVol
                ? `${(activeTooltip.mins / 60).toFixed(1)}h total`
                : `${activeTooltip.mins}m total`}
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
                        ? `${item.durationMinutes}m (${d3.utcFormat("%a")(new Date(item.date))})`
                        : `${item.durationMinutes} mins`}
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
      const totalSessions = data.sessions.length;
      const totalHours = (data.totalMins / 60).toFixed(1);
      const avgMinutes = totalSessions
        ? Math.round(data.totalMins / totalSessions)
        : 0;

      let longestServiceStr = "-";
      if (totalSessions > 0) {
        const longest = data.sessions.reduce(
          (max, curr) =>
            curr.durationMinutes > max.durationMinutes ? curr : max,
          data.sessions[0],
        );
        const longestDate = d3.utcFormat("%b %d")(new Date(longest.date));
        longestServiceStr = `${longest.durationMinutes}m (${longestDate})`;
      }

      let peakMonthStr = "-";
      if (totalSessions > 0) {
        const monthGroups = d3.groups(data.sessions, (s) =>
          d3.utcFormat("%B")(new Date(s.date)),
        );
        monthGroups.sort((a, b) => b[1].length - a[1].length);
        const peakMonthName = monthGroups[0][0];
        const peakMonthCount = monthGroups[0][1].length;
        peakMonthStr = `${peakMonthName} (${peakMonthCount} sess.)`;
      }

      let sessionsPerWeekStr = "-";
      if (totalSessions > 0) {
        const dates = data.sessions.map((s) => new Date(s.date));
        const extent = d3.extent(dates) as [Date, Date];
        const start = d3.utcMonth.floor(extent[0] || new Date());
        const end = d3.utcMonth.ceil(extent[1] || new Date());
        const gridStart = d3.utcMonday.floor(start);
        const weeksCount = d3.utcMondays(gridStart, end).length || 1;
        sessionsPerWeekStr = `${(totalSessions / weeksCount).toFixed(2)} / wk`;
      }

      return {
        season,
        sessions: data.sessions,
        metrics: [
          {
            label: "Total Sessions",
            val: totalSessions,
            icon: Activity,
            color: "blue",
          },
          {
            label: "Workshop Time",
            val: `${totalHours}h`,
            icon: Clock,
            color: "emerald",
          },
          {
            label: "Avg Session",
            val: `${avgMinutes}m`,
            icon: TrendingUp,
            color: "indigo",
          },
          {
            label: "Longest Service",
            val: longestServiceStr,
            icon: CalendarDays,
            color: "amber",
          },
          { label: "Peak Month", val: peakMonthStr, icon: Tag, color: "sky" },
          {
            label: "Sessions / Week",
            val: sessionsPerWeekStr,
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
        <div className="space-y-10 md:space-y-16">
          {seasonsData.map(({ season, sessions, metrics }) => (
            <section key={season} className="space-y-6 md:space-y-8">
              {/* Season Section Title (Desktop-only to keep mobile completely stream-focused) */}
              <div className="hidden md:flex items-center justify-between border-b border-slate-100 pb-3">
                <h2 className="text-3xl font-black tracking-tight uppercase italic text-slate-900">
                  Season {season}
                </h2>
                <span className="bg-slate-100 text-slate-500 text-xs font-bold px-3 py-1 rounded-full uppercase tracking-widest">
                  {sessions.length} sessions
                </span>
              </div>

              {/* Visual Heatmap Grid */}
              <div className="py-2">
                <Heatmap sessions={sessions} isMobile={isMobile} />
              </div>

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
          ))}
        </div>
      </div>
    </div>
  );
}
