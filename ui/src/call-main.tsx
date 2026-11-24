import React, { useEffect, useRef, useState } from "react";
import ReactDOM from "react-dom/client";
import { blip } from "./api/blip";
import "./styles.css";

function CallApp() {
  const params = new URLSearchParams(window.location.search);
  const peer = Number(params.get("peer") || 0);
  const localRef = useRef<HTMLVideoElement>(null);
  const remoteRef = useRef<HTMLVideoElement>(null);
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const [status, setStatus] = useState("idle");
  const [muted, setMuted] = useState(false);

  useEffect(() => {
    let unlisten: (() => void) | undefined;
    void (async () => {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: true,
        video: true,
      });
      if (localRef.current) localRef.current.srcObject = stream;

      const pc = new RTCPeerConnection({ iceServers: [] });
      pcRef.current = pc;
      stream.getTracks().forEach((t) => pc.addTrack(t, stream));
      pc.ontrack = (ev) => {
        if (remoteRef.current) remoteRef.current.srcObject = ev.streams[0];
      };
      pc.onicecandidate = (ev) => {
        if (!ev.candidate || !peer) return;
        void blip.sendTcpMessage({
          type: "call-candidate",
          to: peer,
          candidate: ev.candidate.toJSON(),
        });
      };

      unlisten = await blip.onTcpMessage(async (msg) => {
        const type = String(msg.type ?? "");
        if (Number(msg.from) !== peer) return;
        if (type === "call-offer") {
          await pc.setRemoteDescription(msg.sdp as RTCSessionDescriptionInit);
          const answer = await pc.createAnswer();
          await pc.setLocalDescription(answer);
          await blip.sendTcpMessage({
            type: "call-answer",
            to: peer,
            sdp: answer,
          });
          setStatus("connected");
        }
        if (type === "call-answer") {
          await pc.setRemoteDescription(msg.sdp as RTCSessionDescriptionInit);
          setStatus("connected");
        }
        if (type === "call-candidate" && msg.candidate) {
          await pc.addIceCandidate(msg.candidate as RTCIceCandidateInit);
        }
        if (type === "call-hangup") {
          setStatus("ended");
          pc.close();
        }
      });

      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      await blip.dialPeer(peer);
      await blip.sendTcpMessage({
        type: "call-offer",
        to: peer,
        sdp: offer,
      });
      setStatus("calling");
    })();

    return () => {
      unlisten?.();
      pcRef.current?.close();
    };
  }, [peer]);

  const hangup = async () => {
    await blip.sendTcpMessage({ type: "call-hangup", to: peer });
    pcRef.current?.close();
    setStatus("ended");
    await blip.windowClose();
  };

  const toggleMute = () => {
    const stream = localRef.current?.srcObject as MediaStream | null;
    stream?.getAudioTracks().forEach((t) => {
      t.enabled = muted;
    });
    setMuted(!muted);
  };

  return (
    <div className="app">
      <div
        className="titlebar"
        onMouseDown={() => {
          void blip.startDrag();
        }}
      >
        <div className="brand">
          CALL #{peer} · {status}
        </div>
        <div className="win-btns">
          <button type="button" onClick={() => void blip.windowMinimize()}>
            —
          </button>
          <button type="button" onClick={() => void hangup()}>
            ×
          </button>
        </div>
      </div>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: 8,
          padding: 12,
          minHeight: 0,
        }}
      >
        <video ref={localRef} autoPlay muted playsInline style={{ width: "100%", background: "#000" }} />
        <video ref={remoteRef} autoPlay playsInline style={{ width: "100%", background: "#000" }} />
      </div>
      <div className="actions" style={{ padding: 12 }}>
        <button type="button" onClick={toggleMute}>
          {muted ? "Unmute" : "Mute"}
        </button>
        <button type="button" onClick={() => void hangup()}>
          Hang up
        </button>
        <button
          type="button"
          onClick={async () => {
            try {
              const display = await navigator.mediaDevices.getDisplayMedia({
                video: true,
              });
              const track = display.getVideoTracks()[0];
              const sender = pcRef.current
                ?.getSenders()
                .find((s) => s.track?.kind === "video");
              if (sender && track) await sender.replaceTrack(track);
            } catch {
              /* user cancelled */
            }
          }}
        >
          Screen share
        </button>
      </div>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <CallApp />
  </React.StrictMode>,
);
