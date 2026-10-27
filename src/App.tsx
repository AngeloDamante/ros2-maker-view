import { useEffect, useState } from "react";
import { api, type ServerInfo } from "./api.ts";
import { Home } from "./components/Home.tsx";
import { ViewScreen } from "./components/ViewScreen.tsx";
import { embeddedView } from "./lib/exportHtml.ts";
import type { ViewDoc } from "./types.ts";

function useHash(): string {
  const [hash, setHash] = useState(location.hash);
  useEffect(() => {
    const on = () => setHash(location.hash);
    window.addEventListener("hashchange", on);
    return () => window.removeEventListener("hashchange", on);
  }, []);
  return hash;
}

const embedded = embeddedView();

export function App() {
  const hash = useHash();
  const [info, setInfo] = useState<ServerInfo | null>(null);
  useEffect(() => {
    if (!embedded) api.info().then(setInfo, () => setInfo(null));
  }, []);

  if (embedded) {
    const page = /^#\/v\/[^/]+\/([^/?]+)/.exec(location.hash)?.[1];
    return <ViewScreen id={embedded.id} standalone readonly initialDoc={embedded.view as ViewDoc} initialPage={page && decodeURIComponent(page)} />;
  }
  const m = /^#\/v\/([^/?]+)(?:\/([^/?]+))?/.exec(hash);
  if (m) {
    const id = decodeURIComponent(m[1]!);
    return <ViewScreen key={id} id={id} standalone={false} readonly={!!info?.readonly} initialPage={m[2] && decodeURIComponent(m[2])} />;
  }
  return <Home info={info} />;
}
