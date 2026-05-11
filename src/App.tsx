import { useMemo, useState, useEffect } from "react";
import {
  Activity,
  Clock,
  Tag,
  CalendarDays,
  ChevronRight,
  ChevronDown,
} from "lucide-react";
import * as d3 from "d3";

// --- DATA SOURCE ---
// This import requires src/data/data.json to exist
import rawData from "./data/data.json";

// --- TYPES ---
interface Session {
  id: string;
  date: string;
  durationMinutes: number;
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

// --- HEATMAP COMPONENT ---
const Heatmap = ({ sessions }: { sessions: Session[] }) => {
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);

  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  const dailyData = useMemo(() => {
    const map = new Map<string, number>();
    sessions.forEach((s) => {
      const day = s.date.split("T")[0];
      map.set(day, (map.get(day) || 0) + s.durationMinutes);
    });
    return map;
  }, [sessions]);

  const dates = sessions.map((s) => new Date(s.date));
  const extent = d3.extent(dates) as [Date, Date];

  const startDate = d3.utcMonth.floor(extent[0] || new Date());
  const endDate = d3.utcMonth.ceil(extent[1] || new Date());

  const gridStart = d3.utcMonday.floor(startDate);
  const allDays = d3.utcDays(startDate, endDate);
  const maxMins = d3.max(Array.from(dailyData.values())) || 1;

  const colorScale = d3
    .scaleSequential()
    .domain([0, maxMins])
    .interpolator(d3.interpolateBlues);

  const cellSize = isMobile ? 36 : 22;
  const cellPadding = isMobile ? 6 : 5;
  const totalCellSize = cellSize + cellPadding;

  if (isMobile) {
    return (
      <div className="w-full space-y-4">
        <div className="flex justify-between items-center px-2 text-[10px] text-slate-400 uppercase font-bold border-b border-slate-100 pb-2">
          <div className="w-12 text-left">Week</div>
          <div className="flex-1 flex justify-between max-w-[290px] mx-auto w-full px-2">
            {["M", "T", "W", "T", "F", "S", "S"].map((d) => (
              <div key={d} style={{ width: cellSize }} className="text-center">
                {d}
              </div>
            ))}
          </div>
        </div>
        <div className="space-y-2">
          {d3.utcMondays(gridStart, endDate).map((monday) => (
            <div
              key={monday.toString()}
              className="flex items-center justify-between"
            >
              <div className="w-12 text-[10px] text-slate-300 tabular-nums leading-tight">
                {d3.utcFormat("%b %d")(monday)}
              </div>
              <div className="flex-1 flex justify-between max-w-[290px] mx-auto w-full px-2">
                {d3.utcDays(monday, d3.utcDay.offset(monday, 7)).map((day) => {
                  const val = dailyData.get(formatDate(day)) || 0;
                  const isInSeason = day >= extent[0] && day <= extent[1];
                  return (
                    <div
                      key={day.toString()}
                      className="rounded-lg transition-all duration-300 shadow-sm"
                      style={{
                        width: cellSize,
                        height: cellSize,
                        backgroundColor: val > 0 ? colorScale(val) : "#f1f5f9",
                        opacity: isInSeason ? 1 : 0.05,
                      }}
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

  const weeksCount = d3.utcMondays(gridStart, endDate).length;
  const margin = { top: 40, right: 30, bottom: 20, left: 60 };
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
    <div className="w-full overflow-x-auto py-4 scrollbar-hide">
      <svg width={svgWidth} height={svgHeight} className="mx-auto block">
        <g transform={`translate(${margin.left}, ${margin.top})`}>
          {monthLabels.map((m, i) => (
            <text
              key={i}
              x={m.x}
              y="-15"
              className="fill-slate-500 text-[12px] font-black uppercase tracking-[0.2em]"
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
              className="fill-slate-400 text-[11px] font-bold"
            >
              {d}
            </text>
          ))}
          {allDays.map((day) => {
            const weekIdx = d3.utcMonday.count(gridStart, day);
            const dayIdx = (day.getUTCDay() + 6) % 7;
            const val = dailyData.get(formatDate(day)) || 0;
            const isInSeason = day >= extent[0] && day <= extent[1];
            return (
              <rect
                key={day.toString()}
                x={weekIdx * totalCellSize}
                y={dayIdx * totalCellSize}
                width={cellSize}
                height={cellSize}
                rx={6}
                fill={val > 0 ? colorScale(val) : "#f8fafc"}
                className="transition-all duration-300 hover:stroke-blue-400 hover:stroke-2 cursor-pointer"
                stroke="#e2e8f0"
                strokeWidth={val > 0 ? 0 : 1}
                opacity={isInSeason ? 1 : 0.15}
              >
                <title>
                  {formatDate(day)}: {val} mins
                </title>
              </rect>
            );
          })}
        </g>
      </svg>
    </div>
  );
};

export default function App() {
  const [expandedSeason, setExpandedSeason] = useState<string | null>(null);

  const { totalSessions, totalHours, seasons } = useMemo(() => {
    let totalMins = 0;
    const seasonMap: Record<
      string,
      { sessions: number; minutes: number; items: Session[] }
    > = {};

    typedData.sessions.forEach((session) => {
      totalMins += session.durationMinutes;
      const season = getSkiSeason(session.date);

      if (!seasonMap[season]) {
        seasonMap[season] = { sessions: 0, minutes: 0, items: [] };
      }
      seasonMap[season].sessions += 1;
      seasonMap[season].minutes += session.durationMinutes;
      seasonMap[season].items.push(session);
    });

    const sortedSeasons = Object.entries(seasonMap).sort((a, b) =>
      b[0].localeCompare(a[0]),
    );

    return {
      totalSessions: typedData.sessions.length,
      totalHours: (totalMins / 60).toFixed(1),
      seasons: sortedSeasons,
    };
  }, []);

  useEffect(() => {
    if (seasons.length > 0 && !expandedSeason) {
      setExpandedSeason(seasons[0][0]);
    }
  }, [seasons]);

  return (
    <div className="min-h-screen bg-[#fbfcfd] p-4 md:p-12 font-sans text-slate-900">
      <div className="max-w-6xl mx-auto space-y-8">
        <header className="flex flex-col md:flex-row md:items-end justify-between gap-4">
          <div className="space-y-1">
            <h1 className="text-4xl md:text-5xl font-black tracking-tight text-slate-900 italic uppercase">
              Servicemann
            </h1>
            <p className="text-slate-400 text-xs font-bold flex items-center gap-2 uppercase tracking-tighter">
              <span className="w-2 h-2 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.6)]"></span>
              Live Synced •{" "}
              {new Date(typedData.lastUpdated).toLocaleDateString()}
            </p>
          </div>
        </header>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {[
            {
              label: "Sessions",
              val: totalSessions,
              icon: Activity,
              color: "blue",
            },
            {
              label: "Service Time",
              val: `${totalHours}h`,
              icon: Clock,
              color: "emerald",
            },
            {
              label: "Categories",
              val: typedData.availableTags.length || "Base",
              icon: Tag,
              color: "indigo",
            },
          ].map((kpi) => (
            <div
              key={kpi.label}
              className="bg-white p-6 rounded-[2rem] shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-slate-50 flex items-center space-x-5"
            >
              <div
                className={`bg-${kpi.color}-50 p-4 rounded-2xl text-${kpi.color}-600`}
              >
                <kpi.icon size={28} strokeWidth={2.5} />
              </div>
              <div>
                <p className="text-[11px] font-black uppercase tracking-widest text-slate-300 leading-none mb-1.5">
                  {kpi.label}
                </p>
                <p className="text-3xl font-black leading-none">{kpi.val}</p>
              </div>
            </div>
          ))}
        </div>

        <div className="space-y-6">
          <div className="flex items-center gap-3 px-2">
            <div className="p-2 bg-slate-900 rounded-lg">
              <CalendarDays className="text-white" size={18} />
            </div>
            <h2 className="text-xl font-black uppercase tracking-tight">
              Activity Log
            </h2>
          </div>

          <div className="grid grid-cols-1 gap-6">
            {seasons.map(([season, stats]) => (
              <div
                key={season}
                className="bg-white rounded-[2.5rem] shadow-[0_20px_50px_rgba(0,0,0,0.03)] border border-slate-50 overflow-hidden"
              >
                <button
                  onClick={() =>
                    setExpandedSeason(expandedSeason === season ? null : season)
                  }
                  className="w-full p-6 md:p-8 flex items-center justify-between hover:bg-slate-50/50 transition-all"
                >
                  <div className="flex items-center gap-6">
                    <div className="w-14 h-14 bg-slate-900 text-white rounded-2xl flex items-center justify-center font-black text-xl shadow-lg shadow-slate-200">
                      {season}
                    </div>
                    <div className="text-left">
                      <h3 className="font-black text-2xl tracking-tight uppercase">
                        Season {season}
                      </h3>
                      <p className="text-sm font-bold text-slate-400">
                        {stats.sessions} workshop sessions
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-8">
                    <div className="hidden md:block text-right">
                      <p className="text-xl font-black italic">
                        {(stats.minutes / 60).toFixed(1)} hrs
                      </p>
                      <p className="text-[10px] font-black uppercase text-slate-300 tracking-tighter">
                        Total Duration
                      </p>
                    </div>
                    <div className="p-2 bg-slate-50 rounded-full">
                      {expandedSeason === season ? (
                        <ChevronDown size={24} />
                      ) : (
                        <ChevronRight size={24} />
                      )}
                    </div>
                  </div>
                </button>

                {expandedSeason === season && (
                  <div className="px-6 md:px-10 pb-10 animate-in fade-in slide-in-from-top-4 duration-500">
                    <div className="pt-8 border-t border-slate-100">
                      <Heatmap sessions={stats.items} />
                    </div>
                    <div className="mt-10 grid grid-cols-2 md:grid-cols-4 gap-3 pt-8 border-t border-slate-100">
                      <div className="col-span-full mb-2">
                        <span className="text-[11px] font-black uppercase text-slate-300 tracking-widest text-center block">
                          Season Insights
                        </span>
                      </div>
                      {[
                        {
                          label: "Avg Session",
                          val: `${Math.round(stats.minutes / stats.sessions)}m`,
                        },
                        {
                          label: "Peak Day",
                          val: `${d3.max(stats.items, (d) => d.durationMinutes)}m`,
                        },
                        {
                          label: "Busy Month",
                          val: d3
                            .groups(stats.items, (d) =>
                              d3.utcFormat("%B")(new Date(d.date)),
                            )
                            .sort((a, b) => b[1].length - a[1].length)[0][0],
                        },
                        {
                          label: "Frequency",
                          val: `${(stats.sessions / 30).toFixed(1)}/mo`,
                        },
                      ].map((stat) => (
                        <div
                          key={stat.label}
                          className="bg-slate-50/50 p-4 rounded-2xl border border-slate-100"
                        >
                          <p className="text-[9px] font-black uppercase text-slate-400 mb-1">
                            {stat.label}
                          </p>
                          <p className="text-base font-black">{stat.val}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
