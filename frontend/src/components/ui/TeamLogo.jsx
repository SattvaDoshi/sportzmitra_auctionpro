import { getImageUrl } from "../../utils/imageUrl";

function getInitials(name = "T") {
  return (
    name
      .split(" ")
      .filter(Boolean)
      .slice(0, 2)
      .map((x) => x[0]?.toUpperCase())
      .join("") || "T"
  );
}

export default function TeamLogo({ team, size = "md", className = "" }) {
  const isLarge = size === "large" || size === "lg";
  const sizeClass = className ? "" : (isLarge ? "h-16 w-16 text-xl sm:h-20 sm:w-20 sm:text-2xl" : "h-11 w-11 text-sm");
  const logoUrl = getImageUrl(team?.logo_url || team?.team_logo_url);

  if (logoUrl) {
    return (
      <img
        src={logoUrl}
        alt={team?.team_name || "Team"}
        className={`${className || sizeClass} rounded-2xl border border-slate-200 bg-white object-contain p-1.5 shadow-xs`}
      />
    );
  }

  return (
    <div
      className={`${className || sizeClass} flex items-center justify-center rounded-2xl bg-gradient-to-br from-lime-500 to-pink-500 font-extrabold text-white shadow-xs ring-1 ring-slate-200`}
    >
      {getInitials(team?.team_name)}
    </div>
  );
} 