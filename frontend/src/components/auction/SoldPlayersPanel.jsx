import { useMemo } from "react";
import { Trophy } from "lucide-react";

export default function SoldPlayersPanel({ soldPlayers = [] }) {
  const topSoldPlayers = useMemo(
    () => soldPlayers.slice(0, 10),
    [soldPlayers]
  );

  return (
    <div className="h-full rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="mb-5 flex items-center gap-3 border-b border-slate-100 pb-4">
        <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[#EC008C]/15 text-[#EC008C]">
          <Trophy size={22} />
        </div>
        <div>
          <h2 className="text-base font-black italic uppercase tracking-wider text-slate-900">
            Scoreboard
          </h2>
          <p className="text-xs font-bold text-slate-400">Recently sold players</p>
        </div>
      </div>

      <div className="space-y-3">
        {topSoldPlayers.length > 0 ? (
          topSoldPlayers.map((player) => (
            <div
              key={player.id}
              className="rounded-2xl border border-slate-100 bg-slate-50/80 p-3.5 transition hover:border-slate-200 hover:bg-slate-50"
            >
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="truncate text-sm font-black italic uppercase text-slate-900">
                    {player.player_name}
                  </div>
                  <div className="text-xs font-bold text-slate-400">
                    {player.sold_team_name || "Unassigned"}
                  </div>
                </div>
                <div className="flex shrink-0 items-center rounded-xl bg-[#8DC63F]/15 px-3 py-1.5 text-xs font-black text-[#4b7318]">
                  {Number(player.sold_price || 0).toLocaleString("en-IN")}
                </div>
              </div>
            </div>
          ))
        ) : (
          <p className="rounded-2xl border border-dashed border-slate-200 p-6 text-center text-xs font-bold uppercase tracking-wider text-slate-400">
            No players sold yet
          </p>
        )}
      </div>
    </div>
  );
}