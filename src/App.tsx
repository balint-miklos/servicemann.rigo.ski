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

  const cellSize = isMobile ? 36 : 24;
  const cellPadding = 6;
  const totalCellSize = cellSize + cellPadding;

  const getTooltipContent = (day: Date) => {
    const dateStr = formatDate(day);
    const data = dailyData.get(dateStr);
    if (!data) return dateStr;

    const sessionLines = data.items.map((s) => {
      const tags = s.tags.length > 0 ? ` [${s.tags.join(", ")}]` : "";
      const desc = s.description ? `: ${s.description}` : "";
      return `${s.durationMinutes}m${desc}${tags}`;
    });

    return `${dateStr}\nTotal duration: ${data.mins} mins\n\nSessions:\n${sessionLines.join("\n")}`;
  };

  if (isMobile) {
    // Reverse chronological weeks (May down to November)
    const mondays = d3.utcMondays(gridStart, endDate).reverse();

    return (
      <div className="w-full space-y-4">
        <div className="flex justify-between items-center px-2 text-[10px] text-slate-400 uppercase font-black border-b border-slate-100 pb-2 tracking-widest">
          <div className="w-20 text-left">Week Range</div>
          <div className="flex-1 flex justify-between max-w-[280px] mx-auto w-full px-1">
            {["M", "T", "W", "T", "F", "S", "S"].map((d) => (
              <div key={d} style={{ width: cellSize }} className="text-center">
                {d}
              </div>
            ))}
          </div>
        </div>
        <div className="space-y-3">
          {mondays.map((monday) => (
            <div
              key={monday.toString()}
              className="flex items-center justify-between"
            >
              <div className="w-20 text-[10px] text-slate-300 font-bold leading-tight uppercase tabular-nums">
                {getWeekRangeLabel(monday)}
              </div>
              <div className="flex-1 flex justify-between max-w-[280px] mx-auto w-full px-1">
                {d3.utcDays(monday, d3.utcDay.offset(monday, 7)).map((day) => {
                  const data = dailyData.get(formatDate(day));
                  const isInSeason = day >= extent[0] && day <= extent[1];
                  return (
                    <div
                      key={day.toString()}
                      className="rounded-lg transition-all duration-300 shadow-sm cursor-help"
                      style={{
                        width: cellSize,
                        height: cellSize,
                        backgroundColor: data
                          ? colorScale(data.mins)
                          : "#f1f5f9",
                        opacity: isInSeason ? 1 : 0.08,
                      }}
                      title={getTooltipContent(day)}
                    />
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  // Desktop horizontal flow
  const weeksCount = d3.utcMondays(gridStart, endDate).length;
  const margin = { top: 50, right: 30, bottom: 20, left: 70 };
  const svgWidth =
    (weeksCount + 1) * totalCellSize + margin.left + margin.right;
  const svgHeight = 7 * totalCellSize + margin.top + margin.bottom;

  const monthLabels = d3.utcMonths(startDate, endDate).map((month) => {
    const weekIdx = d3.utcMonday.count(gridStart, month);
    return {
      label: d3.utcFormat("%B")(month),
      x: weekIdx * totalCellSize,
    };
  });

  return (
    <div className="w-full overflow-x-auto py-6 scrollbar-hide">
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

          {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d, i) => (
            <text
              key={d}
              x="-15"
              y={i * totalCellSize + cellSize / 1.4}
              textAnchor="end"
              className="fill-slate-400 text-[11px] font-black uppercase tracking-tight"
            >
              {d}
            </text>
          ))}

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
                fill={data ? colorScale(data.mins) : "#f8fafc"}
                className="transition-all duration-300 hover:stroke-blue-400 hover:stroke-[3px] cursor-help"
                stroke="#eef2f6"
                strokeWidth={data ? 0 : 1}
                opacity={isInSeason ? 1 : 0.15}
              >
                <title>{getTooltipContent(day)}</title>
              </rect>
            );
          })}
        </g>
      </svg>
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
      // Calculate Scorecard metrics
      const totalSessions = data.sessions.length;
      const totalHours = (data.totalMins / 60).toFixed(1);
      const avgMinutes = totalSessions
        ? Math.round(data.totalMins / totalSessions)
        : 0;

      // Longest Service + Date
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

      // Peak Month (busiest by sessions count)
      let peakMonthStr = "-";
      if (totalSessions > 0) {
        const monthGroups = d3.groups(data.sessions, (s) =>
          d3.utcFormat("%B")(new Date(s.date)),
        );
        monthGroups.sort((a, b) => b[1].length - a[1].length);
        const peakMonthName = monthGroups[0][0];
        const peakMonthCount = monthGroups[0][1].length;
        peakMonthStr = `${peakMonthName} (${peakMonthCount} sessions)`;
      }

      // Sessions per week velocity
      let sessionsPerWeekStr = "-";
      if (totalSessions > 0) {
        const dates = data.sessions.map((s) => new Date(s.date));
        const extent = d3.extent(dates) as [Date, Date];
        const start = d3.utcMonth.floor(extent[0] || new Date());
        const end = d3.utcMonth.ceil(extent[1] || new Date());
        const gridStart = d3.utcMonday.floor(start);
        const weeksCount = d3.utcMondays(gridStart, end).length || 1;
        sessionsPerWeekStr = `${(totalSessions / weeksCount).toFixed(1)} / wk`;
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
            val: `${avgMinutes} mins`,
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
    <div className="min-h-screen bg-[#fbfcfd] p-4 md:p-12 font-sans text-slate-900">
      <div className="max-w-7xl mx-auto space-y-12">
        {/* Header */}
        <header className="flex flex-col md:flex-row md:items-end justify-between gap-4 border-b border-slate-100 pb-8">
          <div className="space-y-1">
            <h1 className="text-5xl md:text-6xl font-black tracking-tighter text-slate-900 italic uppercase">
              Servicemann
            </h1>
            <p className="text-slate-400 text-xs font-black flex items-center gap-2 uppercase tracking-[0.2em]">
              <span className="w-2 h-2 rounded-full bg-emerald-500 shadow-[0_0_12px_rgba(16,185,129,0.8)]"></span>
              Live Sync •{" "}
              {new Date(typedData.lastUpdated).toLocaleDateString(undefined, {
                month: "long",
                day: "numeric",
                year: "numeric",
              })}
            </p>
          </div>
        </header>

        {/* Live Workshop Activity Feed */}
        <div className="space-y-16">
          {seasonsData.map(({ season, sessions, metrics }) => (
            <section key={season} className="space-y-8">
              {/* Season Section Title */}
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <h2 className="text-3xl font-black tracking-tight uppercase italic text-slate-900">
                  Season {season}
                </h2>
                <span className="bg-slate-100 text-slate-500 text-xs font-bold px-3 py-1 rounded-full uppercase tracking-widest">
                  {sessions.length} sessions
                </span>
              </div>

              {/* Responsive Visual Heatmap Grid */}
              <div className="bg-white rounded-[2.5rem] shadow-sm border border-slate-50 p-6 md:p-10">
                <Heatmap sessions={sessions} isMobile={isMobile} />
              </div>

              {/* Scorecard (Rendered right below each heatmap) */}
              <div className="space-y-4">
                <div className="px-2">
                  <span className="text-[11px] font-black uppercase text-slate-400 tracking-[0.25em]">
                    Season {season} Scorecard
                  </span>
                </div>
                <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
                  {metrics.map((m) => (
                    <div
                      key={m.label}
                      className="bg-white p-6 rounded-[2rem] shadow-sm border border-slate-100 hover:shadow-md transition-all flex items-center space-x-5"
                    >
                      <div
                        className={`bg-${m.color}-50 p-3.5 rounded-xl text-${m.color}-600 hidden sm:block`}
                      >
                        <m.icon size={22} strokeWidth={2.5} />
                      </div>
                      <div>
                        <p className="text-[10px] font-black uppercase text-slate-400 tracking-wider mb-1 leading-none">
                          {m.label}
                        </p>
                        <p className="text-lg md:text-xl font-black italic text-slate-900">
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
