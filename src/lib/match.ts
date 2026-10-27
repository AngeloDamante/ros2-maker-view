/** Logger name filter: exact name (also matching "ns.name"), `*` as wildcard, empty = all. */
export function loggerMatcher(filter: string | undefined): (name: string) => boolean {
  const f = (filter || "").trim();
  if (!f) return () => true;
  const re = new RegExp(`^(.*\\.)?${f.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*")}$`);
  return (name) => re.test(name);
}
