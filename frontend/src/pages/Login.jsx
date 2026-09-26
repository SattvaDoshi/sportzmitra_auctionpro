import { Lock, Menu, ArrowRight, Clock } from "lucide-react";
import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import api from "../api/api";



function AuctionCard({ item, onClick }) {
  const imageSrc = item.auction_logo_url || "https://placehold.co/160x128?text=No+Logo";
  return (
    <div
      onClick={onClick}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") onClick?.();
      }}
      className="flex w-64 shrink-0 cursor-pointer flex-col gap-3 rounded-2xl bg-white p-3.5 shadow-sm ring-1 ring-slate-100 transition hover:shadow-md hover:ring-[#EC008C]/30 sm:w-auto sm:shrink sm:flex-row sm:items-center sm:justify-between sm:gap-4"
    >
      <div className="flex items-center gap-3">
        <div className="h-14 w-16 shrink-0 overflow-hidden rounded-xl bg-slate-100">
          <img
            src={imageSrc}
            alt={item.auction_name}
            className="h-full w-full object-cover"
          />
        </div>
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h3 className="truncate text-[13px] font-bold text-slate-900">
              {item.auction_name}
            </h3>
          </div>
          <p className="mt-0.5 truncate text-[11px] text-slate-400">
            {item.venue || "TBD"} • {item.organization_name || "Unknown"}
          </p>
        
        </div>
      </div>
    </div>
  );
}

export default function Login() {
  const navigate = useNavigate();
  const [mobile, setMobile] = useState("");
  const [otp, setOtp] = useState("");
  const [otpSent, setOtpSent] = useState(false);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [tab, setTab] = useState("MOBILE"); // MOBILE or ADMIN
  const [rememberMe, setRememberMe] = useState(false);
  const [auctionTab, setAuctionTab] = useState("ONGOING"); // ONGOING or UPCOMING
  const [auctions, setAuctions] = useState([]);
  const [loadingAuctions, setLoadingAuctions] = useState(true);

  useEffect(() => {
    const fetchAuctions = async () => {
      try {
        setLoadingAuctions(true);
        const res = await api.get("/public/auctions");
        setAuctions(res.data || []);
      } catch (err) {
        console.error("Failed to fetch auctions:", err);
      } finally {
        setLoadingAuctions(false);
      }
    };
    fetchAuctions();
  }, []);

  const ongoingAuctions = auctions.filter(a => ['LIVE', 'PAUSED'].includes(a.status));
  const upcomingAuctions = auctions.filter(a => !['LIVE', 'PAUSED', 'COMPLETED'].includes(a.status));

  const activeAuctions =
    auctionTab === "ONGOING" ? ongoingAuctions : upcomingAuctions;

  // Ongoing -> open PublicLiveView for that specific auction
  // Upcoming -> open the AuctionList page
  function handleAuctionCardClick(item) {
    if (auctionTab === "ONGOING") {
      navigate(`/live/${item.id}`);
    } else {
      navigate("/auctions");
    }
  }

  function handleViewAll() {
    navigate("/auctions");
  }

  async function sendOtp() {
    try {
      setLoading(true);
      setError("");
      setMessage("");
      const cleanMobile = mobile.trim();
      if (!cleanMobile) return setError("Please enter a valid mobile number");
      const res = await api.post("/auth/send-otp", { mobile: cleanMobile });
      setMobile(cleanMobile);
      setOtpSent(true);
      if (rememberMe) localStorage.setItem("rememberedMobile", cleanMobile);
      setMessage(
        res.data?.devOtp
          ? `OTP sent. Dev Code: ${res.data.devOtp}`
          : "OTP sent successfully."
      );
    } catch (err) {
      setError(err.response?.data?.message || "Failed to send OTP");
    } finally {
      setLoading(false);
    }
  }

  async function verifyOtp() {
    try {
      setLoading(true);
      setError("");
      setMessage("");
      const cleanMobile = mobile.trim();
      const cleanOtp = otp.trim();
      if (!cleanMobile) return setError("Please enter mobile number");
      if (!cleanOtp) return setError("Please enter the received OTP");
      const res = await api.post("/auth/verify-otp", {
        mobile: cleanMobile,
        otp: cleanOtp,
      });
      localStorage.setItem("token", res.data.token);
      localStorage.setItem("user", JSON.stringify(res.data.user));
      if (res.data.user.role === "SUPER_ADMIN") navigate("/super-admin");
      else navigate("/select-organization");
    } catch (err) {
      setError(err.response?.data?.message || "Login verification failed");
    } finally {
      setLoading(false);
    }
  }

  function submit(e) {
    e.preventDefault();
    verifyOtp();
  }

  return (
    <div className="relative min-h-screen w-full bg-slate-100 font-sans text-slate-800 antialiased">
      <style>{`
        .no-scrollbar::-webkit-scrollbar { display: none; }
        .no-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }
      `}</style>

      {/* Background Image Container */}
      <div
        className="fixed inset-0 z-0 bg-cover bg-center bg-no-repeat opacity-90"
        style={{ backgroundImage: "url('/Login-bg.png')" }}
      />

      {/* Container Wrap */}
      <div className="relative z-10 flex min-h-screen flex-col px-4 py-3 sm:px-8 lg:px-16">
        {/* ===================== NAVBAR ===================== */}
        <header className="flex items-center justify-between py-3">
          <div className="flex items-center gap-2">
            <span className="text-xl font-black tracking-tight text-[#222] sm:text-2xl">
              Sportz<span className="text-[#8DC63F]">Mitra</span>
            </span>
            <span className="hidden text-xs text-slate-400 sm:inline-block">
              Bid. Back. Belong.
            </span>
          </div>

          {/* <nav className="hidden items-center gap-8 text-xs font-semibold text-slate-600 md:flex">
            <a href="#auctions" className="hover:text-black">Auctions</a>
            <a href="#how" className="hover:text-black">How It Works</a>
            <a href="#about" className="hover:text-black">About</a>
            <a href="#contact" className="hover:text-black">Contact</a>
          </nav> */}

          <button className="text-slate-700 md:hidden" aria-label="Toggle Menu">
            <Menu size={22} />
          </button>
        </header>

        {/* ===================== MAIN CONTENT ===================== */}
        <main className="flex flex-1 flex-col justify-center gap-6 lg:flex-row lg:items-center lg:gap-12">
          {/* LEFT PANEL - Live Auctions Showcase */}
          <div className="flex-1 lg:max-w-xl">
            <span className="text-[11px] font-extrabold uppercase tracking-widest text-[#EC008C]">
              Live Auctions
            </span>
            <h1 className="mt-1 text-2xl font-extrabold leading-tight text-slate-900 sm:text-4xl lg:text-5xl">
              Exclusive Sports Memorabilia.{" "}
              <span className="block text-slate-900">
                Real Players. Real Moments.
              </span>
            </h1>
            <p className="mt-2 text-xs text-slate-500 sm:text-sm">
              Bid on authentic collectibles, experiences and more.
            </p>

            {/* Auction Tabs & View All */}
            <div className="mt-4 flex items-center justify-between border-b border-slate-200/70 pb-1.5 sm:mt-6">
              <div className="flex gap-5 text-xs font-bold">
                <button
                  type="button"
                  onClick={() => setAuctionTab("ONGOING")}
                  className={`pb-2 transition-colors ${
                    auctionTab === "ONGOING"
                      ? "border-b-2 border-[#EC008C] text-[#EC008C]"
                      : "text-slate-400 hover:text-slate-600"
                  }`}
                >
                  Ongoing Auctions
                </button>
                <button
                  type="button"
                  onClick={() => setAuctionTab("UPCOMING")}
                  className={`pb-2 transition-colors ${
                    auctionTab === "UPCOMING"
                      ? "border-b-2 border-[#EC008C] text-[#EC008C]"
                      : "text-slate-400 hover:text-slate-600"
                  }`}
                >
                  Upcoming Auctions
                </button>
              </div>
              {/* <button
                type="button"
                onClick={handleViewAll}
                className="flex items-center gap-1 text-xs font-bold text-slate-700 hover:underline"
              >
                View All <ArrowRight size={13} />
              </button> */}
            </div>

            {/* Auction Cards - horizontal slider on mobile, list on larger screens */}
            <div className="no-scrollbar mt-3 flex gap-3 overflow-x-auto pb-1 sm:mt-4 sm:flex-col sm:gap-3 sm:overflow-visible">
              {loadingAuctions ? (
                <div className="text-sm text-slate-500">Loading auctions...</div>
              ) : activeAuctions.length > 0 ? (
                activeAuctions.map((item) => (
                  <AuctionCard
                    key={item.id}
                    item={item}
                    onClick={() => handleAuctionCardClick(item)}
                  />
                ))
              ) : (
                <div className="text-sm text-slate-500">No {auctionTab.toLowerCase()} auctions found.</div>
              )}
            </div>
          </div>

          {/* RIGHT PANEL - Authentication Form */}
      <div className="flex w-full justify-center lg:w-[48%] lg:justify-end">
  <div className="w-full max-w-xl rounded-3xl bg-white/90 p-7 shadow-xl backdrop-blur-lg sm:p-9 lg:p-10">
              <div className="mb-5">
                <span className="text-xs text-slate-400">Welcome to</span>
                <h2 className="text-2xl font-black text-slate-900">
                  Sportz<span className="text-[#8DC63F]">Mitra</span>
                </h2>
                <p className="mt-1 text-xs text-slate-400">
                  Log in to continue and start bidding.
                </p>
              </div>

              {/* Login Method Tabs */}
              <div className="mb-5 flex border-b border-slate-200 text-xs font-bold">
                <button
                  type="button"
                  onClick={() => setTab("MOBILE")}
                  className={`flex-1 pb-2 transition-colors ${
                    tab === "MOBILE"
                      ? "border-b-2 border-[#EC008C] text-[#EC008C]"
                      : "text-slate-400 hover:text-slate-600"
                  }`}
                >
                  Auction Login
                </button>
                <button
                  type="button"
                  onClick={() => setTab("ADMIN")}
                  className={`flex-1 pb-2 transition-colors ${
                    tab === "ADMIN"
                      ? "border-b-2 border-[#EC008C] text-[#EC008C]"
                      : "text-slate-400 hover:text-slate-600"
                  }`}
                >
                  Super Admin Login
                </button>
              </div>

              <form onSubmit={submit} className="space-y-3.5">
                {/* Mobile Input */}
                <div className="flex items-center rounded-xl border border-slate-200 bg-slate-50/50 px-3 py-2.5 focus-within:border-[#EC008C] focus-within:bg-white">
                  <span className="border-r border-slate-200 pr-2 text-xs font-bold text-slate-500">
                    🇮🇳 +91
                  </span>
                  <input
                    type="tel"
                    value={mobile}
                    onChange={(e) => setMobile(e.target.value)}
                    disabled={loading || otpSent}
                    placeholder="Enter mobile number"
                    className="w-full bg-transparent px-3 text-xs font-semibold text-slate-800 placeholder-slate-400 outline-none disabled:opacity-60"
                  />
                </div>

                {/* OTP Input with inline Send OTP button */}
                <div className="flex items-center rounded-xl border border-slate-200 bg-slate-50/50 px-3 py-2.5 focus-within:border-[#EC008C] focus-within:bg-white">
                  <Lock size={16} className="mr-2 text-slate-400" />
                  <input
                    type="text"
                    value={otp}
                    onChange={(e) => setOtp(e.target.value)}
                    disabled={loading}
                    placeholder="Enter OTP"
                    className="w-full bg-transparent text-xs font-semibold text-slate-800 placeholder-slate-400 outline-none disabled:opacity-60"
                  />
                  <button
                    type="button"
                    onClick={sendOtp}
                    disabled={loading}
                    className="whitespace-nowrap text-xs font-bold text-[#EC008C] hover:underline disabled:opacity-50"
                  >
                    {otpSent ? "Resend OTP" : "Send OTP"}
                  </button>
                </div>

                {/* Remember Me */}
                <label className="flex items-center gap-2 text-xs text-slate-500">
                  <input
                    type="checkbox"
                    checked={rememberMe}
                    onChange={(e) => setRememberMe(e.target.checked)}
                    className="h-3.5 w-3.5 rounded border-slate-300 text-[#EC008C] focus:ring-[#EC008C]"
                  />
                  Remember me
                </label>

                {/* Status Messages */}
                {message && (
                  <div className="rounded-lg bg-green-50 p-2.5 text-center text-xs font-medium text-green-700">
                    {message}
                  </div>
                )}
                {error && (
                  <div className="rounded-lg bg-red-50 p-2.5 text-center text-xs font-medium text-red-600">
                    {error}
                  </div>
                )}

                {/* Main Action Button */}
                <button
                  type="submit"
                  disabled={loading}
                  className="w-full rounded-xl bg-[#EC008C] py-3 text-xs font-bold text-white shadow-md transition hover:bg-[#d4007d] active:scale-[0.99] disabled:opacity-50"
                >
                  {loading ? "Processing..." : "Login"}
                </button>

                {/* Separator */}
                <div className="relative my-3 text-center">
                  <div className="absolute inset-0 flex items-center">
                    <div className="w-full border-t border-slate-200" />
                  </div>
                  <span className="relative bg-white px-2 text-[10px] uppercase text-slate-400">
                    OR
                  </span>
                </div>

                {/* Google Sign In */}
                <button
                  type="button"
                  disabled
                  className="flex w-full cursor-not-allowed items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white py-2.5 text-xs font-semibold text-slate-600 shadow-sm"
                >
                  <svg width="14" height="14" viewBox="0 0 48 48">
                    <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3c-1.6 4.6-6 8-11.3 8-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34.6 6 29.6 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.2-.1-2.3-.4-3.5z" />
                    <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.6 15.8 18.9 13 24 13c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34.6 6 29.6 4 24 4c-7.4 0-13.8 4-17.2 10z" />
                    <path fill="#4CAF50" d="M24 44c5.5 0 10.5-1.9 14.3-5.2l-6.6-5.4C29.7 35.1 27 36 24 36c-5.3 0-9.7-3.4-11.3-8.1l-6.6 5.1C9.9 39.9 16.4 44 24 44z" />
                    <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.3-2.2 4.2-4.1 5.6l6.6 5.4C41.6 36.5 44 30.8 44 24c0-1.2-.1-2.3-.4-3.5z" />
                  </svg>
                  Continue with Google
                </button>
              </form>

              <p className="mt-5 text-center text-[10px] text-slate-400">
                By logging in, you agree to our{" "}
                <a href="#terms" className="underline hover:text-slate-600">
                  Terms of Service
                </a>{" "}
                and{" "}
                <a href="#privacy" className="underline hover:text-slate-600">
                  Privacy Policy
                </a>
                .
              </p>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}