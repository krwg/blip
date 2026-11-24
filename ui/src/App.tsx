import { useCallback, useEffect, useMemo, useState } from "react";
import { blip, type BlipConfig, type PeerInfo } from "./api/blip";
import { t, type Lang } from "./i18n";

type Nav = "peers" | "chat" | "settings";
type SettingsTab =
  | "profile"
  | "privacy"
  | "appearance"
  | "network"
  | "sound"
  | "about";

type ChatMsg = {
  id: string;
  from: number;
  to: number;
  text: string;
  ts: number;
  me: boolean;
};

const CHAT_KEY = "blip_chat_v1";

function loadChat(): ChatMsg[] {
  try {
    const raw = localStorage.getItem(CHAT_KEY);
    return raw ? (JSON.parse(raw) as ChatMsg[]) : [];
  } catch {
    return [];
  }
}

function saveChat(msgs: ChatMsg[]) {
  localStorage.setItem(CHAT_KEY, JSON.stringify(msgs.slice(-2000)));
}

export default function App() {
  const [nav, setNav] = useState<Nav>("peers");
  const [settingsTab, setSettingsTab] = useState<SettingsTab>("profile");
  const [config, setConfig] = useState<BlipConfig | null>(null);
  const [peers, setPeers] = useState<PeerInfo[]>([]);
  const [activePeer, setActivePeer] = useState<number | null>(null);
  const [draft, setDraft] = useState("");
  const [msgs, setMsgs] = useState<ChatMsg[]>(() => loadChat());
  const [meta, setMeta] = useState<{ version: string; codename: string } | null>(
    null,
  );
  const [diag, setDiag] = useState<Record<string, unknown> | null>(null);
  const [netStatus, setNetStatus] = useState<string>("");

  const lang: Lang = config?.language === "ru" ? "ru" : "en";

  useEffect(() => {
    void (async () => {
      const [cfg, peerList, appMeta] = await Promise.all([
        blip.getConfig(),
        blip.getPeers(),
        blip.getAppMetadata(),
      ]);
      setConfig(cfg);
      setPeers(peerList);
      setMeta({ version: appMeta.version, codename: appMeta.codename });
      document.documentElement.dataset.theme = cfg.theme;
    })();
  }, []);

  useEffect(() => {
    let unPeers: (() => void) | undefined;
    let unTcp: (() => void) | undefined;
    void (async () => {
      unPeers = await blip.onPeersUpdated(setPeers);
      unTcp = await blip.onTcpMessage((msg) => {
        const type = String(msg.type ?? "");
        if (type === "message") {
          const from = Number(msg.from);
          const text = String(msg.text ?? msg.body ?? "");
          const id = String(msg.id ?? `${Date.now()}`);
          setMsgs((prev) => {
            const next = [
              ...prev,
              {
                id,
                from,
                to: Number(msg.to ?? config?.blipId ?? 0),
                text,
                ts: Date.now(),
                me: false,
              },
            ];
            saveChat(next);
            return next;
          });
          if (nav !== "chat") setNav("chat");
          setActivePeer((cur) => cur ?? from);
        }
        if (type === "ping") {
          const from = Number(msg.from);
          void blip.sendTcpMessage({
            type: "pong",
            to: from,
            id: msg.id,
          });
        }
      });
    })();
    return () => {
      unPeers?.();
      unTcp?.();
    };
  }, [config?.blipId, nav]);

  const peerMap = useMemo(() => {
    const m = new Map<number, PeerInfo>();
    peers.forEach((p) => m.set(p.blipId, p));
    return m;
  }, [peers]);

  const thread = useMemo(() => {
    if (activePeer == null || !config) return [];
    return msgs.filter(
      (m) =>
        (m.from === activePeer && m.to === config.blipId) ||
        (m.me && m.to === activePeer) ||
        (m.from === config.blipId && m.to === activePeer),
    );
  }, [msgs, activePeer, config]);

  const saveCfg = useCallback(async (next: BlipConfig) => {
    const saved = await blip.saveConfig(next);
    setConfig(saved);
    document.documentElement.dataset.theme = saved.theme;
  }, []);

  const send = async () => {
    if (!config || activePeer == null || !draft.trim()) return;
    const id = await blip.newId();
    const text = draft.trim();
    await blip.sendTcpMessage({
      type: "message",
      to: activePeer,
      id,
      text,
    });
    const row: ChatMsg = {
      id,
      from: config.blipId,
      to: activePeer,
      text,
      ts: Date.now(),
      me: true,
    };
    setMsgs((prev) => {
      const next = [...prev, row];
      saveChat(next);
      return next;
    });
    setDraft("");
  };

  const openCall = async () => {
    if (activePeer == null) return;
    const { WebviewWindow } = await import("@tauri-apps/api/webviewWindow");
    const label = `call-${activePeer}`;
    const existing = await WebviewWindow.getByLabel(label);
    if (existing) {
      await existing.setFocus();
      return;
    }
    new WebviewWindow(label, {
      url: `call.html?peer=${activePeer}`,
      title: `BLIP Call #${activePeer}`,
      width: 960,
      height: 640,
      decorations: false,
    });
  };

  if (!config) {
    return <div className="app muted" style={{ padding: 24 }}>Loading BLIP…</div>;
  }

  return (
    <div className="app">
      <div
        className="titlebar"
        onMouseDown={() => {
          void blip.startDrag();
        }}
      >
        <div className="brand">
          BLIP · {meta?.codename ?? "Rust"} {meta?.version ?? "3.0.0"}
        </div>
        <div className="win-btns">
          <button type="button" onClick={() => void blip.windowMinimize()}>
            —
          </button>
          <button type="button" onClick={() => void blip.windowMaximize()}>
            □
          </button>
          <button type="button" onClick={() => void blip.windowClose()}>
            ×
          </button>
        </div>
      </div>

      <div className="shell">
        <nav className="nav">
          {(["peers", "chat", "settings"] as Nav[]).map((id) => (
            <button
              key={id}
              type="button"
              className={nav === id ? "active" : ""}
              onClick={() => setNav(id)}
            >
              {t(lang, id)}
            </button>
          ))}
        </nav>

        <main className="main">
          {nav === "peers" && (
            <div className="list" style={{ gridColumn: "1 / -1" }}>
              <h2 style={{ marginTop: 0 }}>{t(lang, "peers")}</h2>
              {peers.length === 0 && <p className="muted">{t(lang, "noPeers")}</p>}
              {peers.map((p) => (
                <button
                  key={p.blipId}
                  type="button"
                  className={`peer ${activePeer === p.blipId ? "active" : ""}`}
                  onClick={() => {
                    setActivePeer(p.blipId);
                    setNav("chat");
                  }}
                >
                  <div className="id">#{p.blipId}</div>
                  <div>{p.displayName}</div>
                  <div className="meta">
                    {p.presence}
                    {p.customStatus ? ` · ${p.customStatus}` : ""} ·{" "}
                    {p.ips[0] ?? "?"}
                  </div>
                </button>
              ))}
            </div>
          )}

          {nav === "chat" && (
            <div className="panel">
              <div className="list">
                {peers.map((p) => (
                  <button
                    key={p.blipId}
                    type="button"
                    className={`peer ${activePeer === p.blipId ? "active" : ""}`}
                    onClick={() => setActivePeer(p.blipId)}
                  >
                    <div className="id">#{p.blipId}</div>
                    <div>{p.displayName}</div>
                  </button>
                ))}
              </div>
              <div className="chat-wrap">
                {activePeer == null ? (
                  <p className="muted" style={{ padding: 16 }}>
                    {t(lang, "emptyChat")}
                  </p>
                ) : (
                  <>
                    <div style={{ padding: "12px 16px", borderBottom: "1px solid var(--line)" }}>
                      <strong>
                        #{activePeer} {peerMap.get(activePeer)?.displayName}
                      </strong>
                      <div className="actions">
                        <button
                          type="button"
                          onClick={() => {
                            void (async () => {
                              try {
                                const r = await blip.dialPeer(activePeer);
                                setNetStatus(
                                  `dial #${r.blipId} ok · ${r.readyMs}ms · session=${r.hasSession}`,
                                );
                              } catch (e) {
                                setNetStatus(`dial failed: ${String(e)}`);
                              }
                            })();
                          }}
                        >
                          {t(lang, "dial")}
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            void (async () => {
                              try {
                                const r = await blip.pingPeer(activePeer);
                                setNetStatus(
                                  `ping #${r.blipId} ok · ${r.dialMs}ms · id=${r.id.slice(0, 8)}`,
                                );
                              } catch (e) {
                                setNetStatus(`ping failed: ${String(e)}`);
                              }
                            })();
                          }}
                        >
                          {t(lang, "ping")}
                        </button>
                        <button type="button" onClick={() => void openCall()}>
                          {t(lang, "call")}
                        </button>
                      </div>
                      {netStatus && (
                        <div className="muted" style={{ marginTop: 8, fontSize: 12 }}>
                          {netStatus}
                        </div>
                      )}
                    </div>
                    <div className="chat-log">
                      {thread.map((m) => (
                        <div key={m.id} className={`bubble ${m.me ? "me" : ""}`}>
                          {m.text}
                        </div>
                      ))}
                    </div>
                    <div className="composer">
                      <input
                        value={draft}
                        placeholder={t(lang, "placeholder")}
                        onChange={(e) => setDraft(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") void send();
                        }}
                      />
                      <button type="button" onClick={() => void send()}>
                        {t(lang, "send")}
                      </button>
                    </div>
                  </>
                )}
              </div>
            </div>
          )}

          {nav === "settings" && (
            <div className="settings" style={{ gridColumn: "1 / -1" }}>
              <div className="tabs">
                {(
                  [
                    "profile",
                    "privacy",
                    "appearance",
                    "network",
                    "sound",
                    "about",
                  ] as SettingsTab[]
                ).map((tab) => (
                  <button
                    key={tab}
                    type="button"
                    className={settingsTab === tab ? "active" : ""}
                    onClick={() => setSettingsTab(tab)}
                  >
                    {t(lang, tab)}
                  </button>
                ))}
              </div>

              {settingsTab === "profile" && (
                <>
                  <div className="field">
                    <label>{t(lang, "displayName")}</label>
                    <input
                      value={config.displayName}
                      onChange={(e) =>
                        setConfig({ ...config, displayName: e.target.value })
                      }
                    />
                  </div>
                  <div className="field">
                    <label>{t(lang, "blipId")}</label>
                    <input
                      type="number"
                      min={1}
                      max={64}
                      value={config.blipId}
                      onChange={(e) =>
                        setConfig({
                          ...config,
                          blipId: Number(e.target.value) || 1,
                        })
                      }
                    />
                    <button
                      type="button"
                      style={{ marginTop: 8 }}
                      onClick={() => {
                        void (async () => {
                          const r = await blip.checkIdConflict(config.blipId);
                          setNetStatus(
                            r.conflict
                              ? `ID #${r.blipId} conflict (${r.reason})${
                                  r.displayName ? ` · ${r.displayName}` : ""
                                }`
                              : `ID #${r.blipId} free (${r.reason})`,
                          );
                        })();
                      }}
                    >
                      Check ID conflict
                    </button>
                    {netStatus && (
                      <div className="muted" style={{ fontSize: 12 }}>
                        {netStatus}
                      </div>
                    )}
                  </div>
                  <div className="field">
                    <label>{t(lang, "language")}</label>
                    <select
                      value={config.language}
                      onChange={(e) =>
                        setConfig({ ...config, language: e.target.value })
                      }
                    >
                      <option value="en">English</option>
                      <option value="ru">Русский</option>
                    </select>
                  </div>
                  <button type="button" onClick={() => void saveCfg(config)}>
                    {t(lang, "save")}
                  </button>
                </>
              )}

              {settingsTab === "privacy" && (
                <p className="muted">
                  Blocked: [{config.blockedPeerIds.join(", ")}] · Trusted: [
                  {config.trustedPeerIds.join(", ")}]
                </p>
              )}

              {settingsTab === "appearance" && (
                <>
                  <div className="field">
                    <label>{t(lang, "theme")}</label>
                    <select
                      value={config.theme}
                      onChange={(e) =>
                        setConfig({ ...config, theme: e.target.value })
                      }
                    >
                      <option value="dark">{t(lang, "dark")}</option>
                      <option value="light">{t(lang, "light")}</option>
                    </select>
                  </div>
                  <div className="field">
                    <label>Animated BG (free)</label>
                    <select
                      value={config.animatedBgId}
                      onChange={(e) =>
                        setConfig({ ...config, animatedBgId: e.target.value })
                      }
                    >
                      {["none", "ember", "rift"].map((id) => (
                        <option key={id} value={id}>
                          {id}
                        </option>
                      ))}
                    </select>
                  </div>
                  <button type="button" onClick={() => void saveCfg(config)}>
                    {t(lang, "save")}
                  </button>
                </>
              )}

              {settingsTab === "network" && (
                <>
                  <button
                    type="button"
                    onClick={async () => {
                      setDiag(await blip.getNetworkDiagnostics());
                    }}
                  >
                    Refresh diagnostics
                  </button>
                  <pre className="muted" style={{ marginTop: 12 }}>
                    {JSON.stringify(diag, null, 2)}
                  </pre>
                </>
              )}

              {settingsTab === "sound" && (
                <>
                  <div className="field">
                    <label>FX pack (all free)</label>
                    <select
                      value={config.uiSoundPack}
                      onChange={(e) =>
                        setConfig({ ...config, uiSoundPack: e.target.value })
                      }
                    >
                      {["signal", "pulse", "nest", "wire", "static"].map((id) => (
                        <option key={id} value={id}>
                          {id}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="field">
                    <label>Melody pack (all free)</label>
                    <select
                      value={config.uiMelodyPack}
                      onChange={(e) =>
                        setConfig({ ...config, uiMelodyPack: e.target.value })
                      }
                    >
                      {["mesh", "grid", "nest", "beacon", "chime"].map((id) => (
                        <option key={id} value={id}>
                          {id}
                        </option>
                      ))}
                    </select>
                  </div>
                  <button type="button" onClick={() => void saveCfg(config)}>
                    {t(lang, "save")}
                  </button>
                </>
              )}

              {settingsTab === "about" && (
                <p>
                  BLIP {meta?.version} — {meta?.codename}
                  <br />
                  Tauri 2 · Rust · React
                  <br />
                  No MESH+ subscription · ex-premium packs are free
                </p>
              )}
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
