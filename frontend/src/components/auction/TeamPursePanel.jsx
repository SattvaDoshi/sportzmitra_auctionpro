import { useMemo } from "react";
import { WalletCards } from "lucide-react";
import TeamLogo from "../ui/TeamLogo";

export default function TeamPursePanel({ teams = [] }) {
  return (
    <div className="h-full rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="mb-5 flex items-center gap-3 border-b border-slate-100 pb-4">
        <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[#8DC63F]/15 text-[#5c8a22]">
          <WalletCards size={22} />
        </div>
        <div>
          <h2 className="text-base font-black italic uppercase tracking-wider text-slate-900">
            Team Dugout
          </h2>
          <p className="text-xs font-bold text-slate-400">Remaining purse balance</p>
        </div>
      </div>

      <div className="space-y-3">
        {teams.length > 0 ? (
          teams.map((team) => (
            <TeamPurseCard key={team.id} team={team} />
          ))
        ) : (
          <p className="rounded-2xl border border-dashed border-slate-200 p-6 text-center text-xs font-bold uppercase tracking-wider text-slate-400">
            No teams added yet
          </p>
        )}
      </div>
    </div>
  );
}

function TeamPurseCard({ team }) {
  const { total, remaining, percentage } = useMemo(() => {
    const totalPurse = Number(team.total_purse || 0);
    const remainingPurse = Number(team.remaining_purse || 0);
    const pct = totalPurse
      ? Math.min(Math.max((remainingPurse / totalPurse) * 100, 0), 100)
      : 0;

    return {
      total: totalPurse,
      remaining: remainingPurse,
      percentage: pct,
    };
  }, [team.total_purse, team.remaining_purse]);

  return (
    <div className="rounded-2xl border border-slate-100 bg-slate-50/80 p-3.5 transition hover:border-slate-200 hover:bg-slate-50">
      <div className="flex items-center gap-3">
        <TeamLogo team={team} />
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-black italic uppercase text-slate-900">
            {team.team_name}
          </div>
          <div className="text-xs font-bold text-slate-400">
            {team.owner_name || "Owner -"}
          </div>
        </div>
        <div className="text-right">
          <div className="text-base font-black text-slate-900">
            {remaining.toLocaleString("en-IN")}
          </div>
          <div className="text-[10px] font-black uppercase tracking-widest text-[#EC008C]">
            Available
          </div>
        </div>
      </div>
      <div className="mt-3 h-2.5 overflow-hidden rounded-full bg-slate-200">
        <div
          className="h-full rounded-full bg-gradient-to-r from-[#EC008C] to-[#8DC63F] transition-all duration-300"
          style={{ width: `${percentage}%` }}
        />
      </div>
    </div>
  );
}