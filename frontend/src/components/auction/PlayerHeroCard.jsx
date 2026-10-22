import { Flame, Shield, Star } from "lucide-react";
import PlayerAvatar from "../ui/PlayerAvatar";
import StatusBadge from "../ui/StatusBadge";

export default function PlayerHeroCard({ liveState, auctionType }) {
  const playerName = liveState?.player_name || "Auction Not Started";
  const formattedRole = (liveState?.player_role || "Waiting").replaceAll("_", " ");
  const basePrice = Number(liveState?.base_price || 0).toLocaleString("en-IN");
  const currentBid = Number(liveState?.current_bid || 0).toLocaleString("en-IN");

  return (
    <div className="relative overflow-hidden rounded-3xl border border-slate-200 bg-white p-6 shadow-sm md:p-8">
      {/* Decorative Brand Gradient Accent Line */}
      <div className="absolute top-0 inset-x-0 h-1.5 bg-gradient-to-r from-[#EC008C] via-[#8DC63F] to-[#EC008C]" />

      <div className="relative z-10 flex flex-col items-center gap-6 text-center">
        {/* Live Banner Tag */}
        <div className="inline-flex items-center gap-2 rounded-full border border-[#EC008C]/30 bg-[#EC008C]/10 px-4 py-1.5 text-xs font-black uppercase tracking-[0.2em] text-[#EC008C]">
          <Flame size={15} /> On the block
        </div>

        {/* Player Avatar */}
        <div className="relative">
          <PlayerAvatar
            name={playerName}
            photoUrl={liveState?.photo_url}
            size="lg"
          />
        </div>

        {/* Player Header Info */}
        <div className="w-full">
          <h1 className="text-3xl font-black italic uppercase tracking-wide text-slate-900 sm:text-5xl lg:text-6xl">
            {playerName}
          </h1>

          <div className="mt-4 flex flex-wrap justify-center gap-2 sm:gap-3">
            <span className="rounded-full border border-slate-200 bg-slate-50 px-4 py-1.5 text-xs font-black uppercase tracking-wider text-slate-700">
              {formattedRole}
            </span>
            <span className="rounded-full border border-[#8DC63F]/40 bg-[#8DC63F]/10 px-4 py-1.5 text-xs font-black uppercase tracking-wider text-[#4b7318]">
              Category: {liveState?.category || "-"}
            </span>
            <span className="rounded-full border border-slate-200 bg-slate-50 px-4 py-1.5 text-xs font-black uppercase tracking-wider text-slate-700">
              Base {basePrice} {auctionType}
            </span>
          </div>
        </div>

        {/* Live Bidding Statistics */}
        <div className="grid w-full grid-cols-1 gap-4 sm:grid-cols-3">
          {/* Leading Team */}
          <div className="flex flex-col justify-center rounded-2xl border border-slate-100 bg-slate-50/80 p-4">
            <div className="flex items-center justify-center gap-2 text-slate-400">
              <Shield size={16} />
              <span className="text-[10px] font-black uppercase tracking-widest">
                Leading Team
              </span>
            </div>
            <div className="mt-2 truncate text-xl font-black italic uppercase text-slate-900 sm:text-2xl">
              {liveState?.highest_team_name || "No Bid Yet"}
            </div>
          </div>

          {/* Current Bid Highlight */}
          <div className="flex flex-col justify-center rounded-2xl border border-[#8DC63F]/40 bg-gradient-to-b from-[#8DC63F]/10 to-transparent p-4 shadow-xs">
            <div className="flex items-center justify-center gap-2 text-[#4b7318]">
              <Star size={16} />
              <span className="text-[10px] font-black uppercase tracking-widest">
                Current Bid
              </span>
            </div>
            <div className="mt-1 text-3xl font-black text-slate-900 sm:text-4xl lg:text-5xl">
              {currentBid}
            </div>
          </div>

          {/* Status Badge Block */}
          <div className="flex flex-col justify-center items-center rounded-2xl border border-slate-100 bg-slate-50/80 p-4">
            <div className="text-[10px] font-black uppercase tracking-widest text-slate-400">
              Auction Status
            </div>
            <div className="mt-3">
              <StatusBadge status={liveState?.state} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}