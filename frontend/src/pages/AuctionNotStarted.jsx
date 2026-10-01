import { ArrowLeft, CalendarClock, MapPin } from "lucide-react";
import { useEffect, useState } from "react";
import { Link, Navigate, useLocation, useParams } from "react-router-dom";
import api from "../api/api";

function getAuctionDate(item) {
  const raw = item?.auction_date || item?.start_date || item?.scheduled_date || item?.event_date;
  const d = raw ? new Date(raw) : null;
  return d && !Number.isNaN(d.getTime()) ? d : null;
}

function getSlug(item) {
  return String(item.public_slug || item.auction_code || item.id);
}

function getTimeLeft(date) {
  const diff = Math.max(0, date.getTime() - Date.now());
  return {
    days: Math.floor(diff / 86400000),
    hours: Math.floor((diff / 3600000) % 24),
    minutes: Math.floor((diff / 60000) % 60),
    seconds: Math.floor((diff / 1000) % 60),
    done: diff === 0,
  };
}

function TimeBox({ value, label }) {
  return (
    <div className="flex w-16 flex-col items-center rounded-xl bg-slate-50 py-2.5 ring-1 ring-slate-100 sm:w-20">
      <span className="font-mono text-2xl font-black tabular-nums text-slate-900 sm:text-3xl">
        {String(value).padStart(2, "0")}
      </span>
      <span className="text-[10px] font-semibold text-slate-400">{label}</span>
    </div>
  );
}

export default function AuctionNotStarted() {
  const { slug } = useParams();
  const location = useLocation();
  const [auction, setAuction] = useState(location.state?.auction || null);
  const [loading, setLoading] = useState(!location.state?.auction);
  const [now, setNow] = useState(Date.now());

  // Fallback for page refresh / direct link: find the auction in the public list
  useEffect(() => {
    if (auction) return;
    (async () => {
      try {
        const res = await api.get("/public/auctions");
        setAuction((res.data || []).find((a) => getSlug(a) === slug) || null);
      } catch (err) {
        console.error("Failed to load auction:", err);
      } finally {
        setLoading(false);
      }
    })();
  }, [auction, slug]);

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  // If the auction has gone live in the meantime, send the visitor to the live dashboard
  if (auction && ["LIVE", "PAUSED"].includes(auction.status)) {
    return <Navigate to={`/live/${getSlug(auction)}/dashboard`} replace />;
  }

  const date = getAuctionDate(auction);
  const left = date ? getTimeLeft(date) : null;

  return (
    <div className="relative min-h-screen w-full bg-slate-100 font-sans text-slate-800 antialiased">
      <div
        className="fixed inset-0 z-0 bg-cover bg-center bg-no-repeat opacity-90"
        style={{ backgroundImage: "url('/Login-bg.png')" }}
      />

      <div className="relative z-10 flex min-h-screen flex-col px-4 py-3 sm:px-8 lg:px-16">
        <header className="flex items-center justify-between py-3">
          <span className="text-xl font-black tracking-tight text-[#222] sm:text-2xl">
            Sportz<span className="text-[#8DC63F]">Mitra</span>
          </span>
          <Link
            to="/"
            className="inline-flex h-9 items-center gap-1.5 rounded-xl bg-white/80 px-3 text-xs font-bold text-slate-700 shadow-sm backdrop-blur transition hover:bg-white"
          >
            <ArrowLeft size={14} /> Back
          </Link>
        </header>

        <main className="flex flex-1 items-center justify-center py-6">
          <div className="w-full max-w-xl rounded-3xl bg-white/90 p-7 text-center shadow-xl backdrop-blur-lg sm:p-10">
            {loading ? (
              <p className="py-10 text-sm text-slate-500">Loading auction...</p>
            ) : !auction ? (
              <div className="py-6">
                <h1 className="text-xl font-black text-slate-900">Auction not found</h1>
                <p className="mt-2 text-sm text-slate-500">
                  This link may be outdated. Go back and pick an auction from the list.
                </p>
              </div>
            ) : (
              <>
                <div className="mx-auto h-20 w-24 overflow-hidden rounded-2xl bg-slate-100 ring-1 ring-slate-100">
                  <img
                    src={auction.auction_logo_url || "https://placehold.co/160x128?text=No+Logo"}
                    alt={auction.auction_name}
                    className="h-full w-full object-cover"
                  />
                </div>

                <h1 className="mt-5 text-2xl font-black leading-tight text-slate-900 sm:text-3xl">
                  {auction.auction_name}
                </h1>
                <p className="mt-1 text-xs text-slate-400">{auction.organization_name || "Unknown organizer"}</p>

                <div className="mt-6 rounded-2xl bg-pink-50 px-4 py-4">
                  <h2 className="text-lg font-extrabold text-[#EC008C]">This auction hasn't started yet</h2>
                  <p className="mt-1 text-sm text-slate-600">
                    The live dashboard opens as soon as the auctioneer starts the event.
                    Check back at the scheduled time.
                  </p>
                </div>

                {left && !left.done && (
                  <div className="mt-6 flex justify-center gap-2 sm:gap-3">
                    <TimeBox value={left.days} label="Days" />
                    <TimeBox value={left.hours} label="Hours" />
                    <TimeBox value={left.minutes} label="Minutes" />
                    <TimeBox value={left.seconds} label="Seconds" />
                  </div>
                )}
                {/* {left?.done && (
                //   <p className="mt-6 text-sm font-semibold text-slate-600">
                //     The scheduled time has arrived. Waiting for the auctioneer to begin.
                //   </p>
                )} */}

                <div className="mt-6 flex flex-col items-center justify-center gap-2 text-xs font-semibold text-slate-600 sm:flex-row sm:gap-5">
                  {date && (
                    <span className="inline-flex items-center gap-1.5">
                      <CalendarClock size={14} className="text-[#EC008C]" />
                      {date.toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })}
                    </span>
                  )}
                  <span className="inline-flex items-center gap-1.5">
                    <MapPin size={14} className="text-[#EC008C]" />
                    {auction.venue || "Venue to be announced"}
                  </span>
                </div>

                <Link
                  to="/"
                  className="mt-8 inline-flex h-11 w-full items-center justify-center rounded-xl bg-[#EC008C] text-sm font-bold text-white shadow-md transition hover:bg-[#d4007d] sm:w-auto sm:px-8"
                >
                  Back to home
                </Link>
              </>
            )}
          </div>
        </main>
      </div>
    </div>
  );
}