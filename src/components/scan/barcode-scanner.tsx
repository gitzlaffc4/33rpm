"use client";

import { Camera, CameraOff } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";

type Props = {
  /** Called once per detected code (repeats of the same code are debounced). */
  onDetect: (code: string) => void;
  /** Keep scanning after a hit (crate mode) or stop (single scan). */
  continuous?: boolean;
};

type State = "idle" | "starting" | "scanning" | "error";

/** Short beep + vibration so you can scan without looking at the screen. */
function feedback(ctx: AudioContext | null) {
  try {
    navigator.vibrate?.(60);
  } catch {}
  if (!ctx) return;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.frequency.value = 1320;
  gain.gain.setValueAtTime(0.15, ctx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.09);
  osc.connect(gain).connect(ctx.destination);
  osc.start();
  osc.stop(ctx.currentTime + 0.1);
}

function cameraError(e: unknown): string {
  if (typeof window !== "undefined" && !window.isSecureContext) {
    return "The camera only works over HTTPS (or on localhost). Open 33rpm through your HTTPS address, or type the barcode below.";
  }
  const name = (e as { name?: string })?.name;
  if (name === "NotAllowedError") {
    return "Camera permission was denied. Allow it in your browser settings, or type the barcode below.";
  }
  if (name === "NotFoundError" || name === "OverconstrainedError") {
    return "No camera found. Type the barcode below instead.";
  }
  return "Couldn't start the camera. Type the barcode below instead.";
}

/**
 * Camera barcode scanner (EAN-13/8, UPC-A/E) using @zxing/browser, which works on iOS
 * Safari where BarcodeDetector doesn't. The camera starts only on a tap (permission
 * prompts and audio both need a user gesture).
 */
export function BarcodeScanner({ onDetect, continuous = false }: Props) {
  const video = useRef<HTMLVideoElement>(null);
  const controls = useRef<{ stop: () => void } | null>(null);
  const audio = useRef<AudioContext | null>(null);
  const last = useRef<{ code: string; at: number }>({ code: "", at: 0 });
  const [state, setState] = useState<State>("idle");
  const [error, setError] = useState("");
  const [lastCode, setLastCode] = useState("");

  const stop = useCallback(() => {
    controls.current?.stop();
    controls.current = null;
    setState((s) => (s === "error" ? s : "idle"));
  }, []);

  useEffect(() => stop, [stop]);

  const start = async () => {
    setError("");
    setState("starting");
    try {
      audio.current ??= new AudioContext();
      void audio.current.resume();
    } catch {
      audio.current = null;
    }
    try {
      if (!navigator.mediaDevices?.getUserMedia) {
        throw Object.assign(new Error("no mediaDevices"), { name: "NotSupported" });
      }
      const [{ BrowserMultiFormatReader }, { BarcodeFormat, DecodeHintType }] = await Promise.all([
        import("@zxing/browser"),
        import("@zxing/library"),
      ]);
      const hints = new Map();
      hints.set(DecodeHintType.POSSIBLE_FORMATS, [
        BarcodeFormat.EAN_13,
        BarcodeFormat.EAN_8,
        BarcodeFormat.UPC_A,
        BarcodeFormat.UPC_E,
      ]);
      const reader = new BrowserMultiFormatReader(hints, { delayBetweenScanAttempts: 120 });
      controls.current = await reader.decodeFromConstraints(
        {
          video: {
            facingMode: { ideal: "environment" },
            width: { ideal: 1280 },
            height: { ideal: 720 },
          },
        },
        video.current!,
        (result) => {
          if (!result) return;
          const code = result.getText();
          const now = Date.now();
          // The same box stays in frame for a while: ignore repeats for 2.5 s.
          if (code === last.current.code && now - last.current.at < 2500) return;
          last.current = { code, at: now };
          feedback(audio.current);
          setLastCode(code);
          onDetect(code);
          if (!continuous) stop();
        },
      );
      setState("scanning");
    } catch (e) {
      controls.current?.stop();
      controls.current = null;
      setError(cameraError(e));
      setState("error");
    }
  };

  const active = state === "scanning" || state === "starting";
  return (
    <div className="space-y-3">
      <div className="relative aspect-[4/3] overflow-hidden rounded-xl bg-black ring-1 ring-border md:aspect-video">
        <video
          ref={video}
          className="size-full object-cover"
          muted
          playsInline
          aria-label="Camera preview"
        />
        {active && (
          <div
            aria-hidden
            className="pointer-events-none absolute inset-x-[12%] top-1/2 h-24 -translate-y-1/2 rounded-lg border-2 border-primary/80 shadow-[0_0_0_9999px_rgb(0_0_0/0.35)]"
          >
            <div className="absolute inset-x-2 top-1/2 h-0.5 animate-pulse bg-primary" />
          </div>
        )}
        {!active && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 p-6 text-center">
            <Camera className="size-10 text-white/60" aria-hidden />
            <Button type="button" onClick={start} size="lg">
              Start camera
            </Button>
            <p className="max-w-xs text-xs text-white/60">
              Point it at the barcode on the back. Works best in good light.
            </p>
          </div>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-3">
        {active && (
          <Button type="button" variant="outline" onClick={stop}>
            <CameraOff aria-hidden /> Stop camera
          </Button>
        )}
        <p role="status" aria-live="polite" className="text-sm text-muted-foreground">
          {state === "starting" && "Starting camera…"}
          {state === "scanning" && (lastCode ? `Scanned ${lastCode}` : "Looking for a barcode…")}
        </p>
      </div>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
