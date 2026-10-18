/**
 * Utility for flexible player search and ranking.
 * Supports:
 *  - Serial / Lot numbers: "3", "001"
 *  - Formatted combined search: "3 - ", "3 - DJ", "001 - Virat", "3-DJ"
 *  - Name, mobile, role, category, area, team
 *  - Punctuation tolerance (hyphens, spaces)
 */

export function matchesPlayerSearch(player, query) {
  if (!query) return true;
  const q = String(query).trim().toLowerCase();
  if (!q) return true;

  const serial = String(player?.serial_number || "").trim().toLowerCase();
  const id = String(player?.id || "").trim().toLowerCase();
  const name = String(player?.player_name || player?.name || "").trim().toLowerCase();
  const mobile = String(player?.mobile || player?.player_mobile || "").trim().toLowerCase();
  const role = String(player?.player_role || "").trim().toLowerCase();
  const category = String(player?.category || "").trim().toLowerCase();
  const area = String(player?.area || "").trim().toLowerCase();
  const team = String(player?.sold_team_name || player?.team_name || "").trim().toLowerCase();

  const combinedSerial = serial ? `${serial} - ${name}` : "";
  const combinedSerialNoSpace = serial ? `${serial}-${name}` : "";
  const combinedId = id ? `${id} - ${name}` : "";

  // Case 1: Query contains a hyphen, e.g. "3 - ", "3-", "3 - dj", "001 - virat"
  if (/[-–—]/.test(q)) {
    const parts = q.split(/[-–—]/);
    const prefix = parts[0].trim();
    const suffix = parts.slice(1).join(" ").trim();

    // Check if prefix matches serial or id or name prefix
    const prefixMatches =
      !prefix ||
      serial === prefix ||
      serial.startsWith(prefix) ||
      id === prefix ||
      name.startsWith(prefix);

    if (prefixMatches) {
      if (!suffix) {
        return true;
      }
      const playerText = `${name} ${role} ${category} ${area} ${team} ${mobile}`;
      const suffixTokens = suffix.split(/\s+/).filter(Boolean);
      return suffixTokens.every((tok) => playerText.includes(tok));
    }
    return false;
  }

  // Case 2: General haystack search
  const haystack = [
    combinedSerial,
    combinedSerialNoSpace,
    combinedId,
    serial,
    id,
    name,
    mobile,
    role,
    category,
    area,
    team,
  ]
    .filter(Boolean)
    .join(" ");

  if (haystack.includes(q)) return true;

  // Case 3: Token matching for multi-word queries (e.g. "dj gomzi", "batsman a")
  const tokens = q.split(/\s+/).filter(Boolean);
  if (tokens.length > 1 && tokens.every((tok) => haystack.includes(tok))) {
    return true;
  }

  return false;
}

export function sortPlayersBySearch(players, query) {
  if (!query) return players;
  const q = String(query).trim().toLowerCase();
  if (!q) return players;

  const parts = q.split(/[-–—]/);
  const prefix = parts[0].trim();
  const numMatch = prefix.match(/^(\d+)/);
  const searchNum = numMatch ? numMatch[1] : null;

  return [...players].sort((a, b) => {
    const aSerial = String(a.serial_number || "").trim().toLowerCase();
    const bSerial = String(b.serial_number || "").trim().toLowerCase();
    const aId = String(a.id || "").trim().toLowerCase();
    const bId = String(b.id || "").trim().toLowerCase();
    const aName = String(a.player_name || a.name || "").trim().toLowerCase();
    const bName = String(b.player_name || b.name || "").trim().toLowerCase();

    if (searchNum) {
      const aExactSerial = aSerial === searchNum || aSerial === prefix;
      const bExactSerial = bSerial === searchNum || bSerial === prefix;
      if (aExactSerial && !bExactSerial) return -1;
      if (bExactSerial && !aExactSerial) return 1;

      const aExactId = aId === searchNum;
      const bExactId = bId === searchNum;
      if (aExactId && !bExactId) return -1;
      if (bExactId && !aExactId) return 1;

      const aStartsSerial = aSerial.startsWith(searchNum);
      const bStartsSerial = bSerial.startsWith(searchNum);
      if (aStartsSerial && !bStartsSerial) return -1;
      if (bStartsSerial && !aStartsSerial) return 1;
    }

    const aStartsName = aName.startsWith(q);
    const bStartsName = bName.startsWith(q);
    if (aStartsName && !bStartsName) return -1;
    if (bStartsName && !aStartsName) return 1;

    const aNum = parseInt(aSerial, 10);
    const bNum = parseInt(bSerial, 10);
    if (!isNaN(aNum) && !isNaN(bNum)) {
      return aNum - bNum;
    }

    return 0;
  });
}
