"use client";

import { useEffect, useRef, useState } from "react";
import { Camera } from "lucide-react";
import { Button } from "@/components/ui/Button";

interface CameraCaptureProps {
  onCapture: (file: File) => void;
}

/** Live in-browser camera capture via getUserMedia — not a bare
 * `<input type="file" capture>`, which only opens a real camera on mobile;
 * on desktop browsers it silently falls back to a plain file picker, which
 * reads as "the camera isn't opening" since nothing camera-like appears. A
 * file-picker fallback is still offered underneath for browsers without
 * camera access or students who'd rather upload an existing photo. */
export function CameraCapture({ onCapture }: CameraCaptureProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [active, setActive] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    return () => {
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  async function openCamera() {
    setError(null);
    try {
      // A soft preference, not a hard constraint — a hard { facingMode:
      // "environment" } fails outright on laptops with only a front camera.
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: "environment" } },
      });
      streamRef.current = stream;
      setActive(true);
      requestAnimationFrame(() => {
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.play().catch(() => {});
        }
      });
    } catch {
      setError("Could not access your camera. Check your browser's camera permission, or choose a file instead.");
    }
  }

  function closeCamera() {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setActive(false);
  }

  function capturePhoto() {
    const video = videoRef.current;
    if (!video || !video.videoWidth) return;
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(video, 0, 0);
    canvas.toBlob(
      (blob) => {
        if (blob) onCapture(new File([blob], "id-photo.jpg", { type: "image/jpeg" }));
        closeCamera();
      },
      "image/jpeg",
      0.92
    );
  }

  function handleFileChosen() {
    const file = fileInputRef.current?.files?.[0];
    if (file) onCapture(file);
  }

  if (active) {
    return (
      <div className="flex flex-col items-center gap-3">
        {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
        <video ref={videoRef} autoPlay playsInline muted className="max-h-64 w-full rounded-lg bg-black" />
        <div className="flex gap-2">
          <Button type="button" size="sm" onClick={capturePhoto}>
            <Camera className="h-4 w-4" strokeWidth={2} />
            Capture photo
          </Button>
          <Button type="button" variant="secondary" size="sm" onClick={closeCamera}>
            Cancel
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center gap-2 py-2">
      <Button type="button" variant="secondary" size="sm" onClick={openCamera}>
        <Camera className="h-4 w-4" strokeWidth={2} />
        Open camera
      </Button>
      {error && <p className="max-w-xs text-center text-xs text-red-600">{error}</p>}
      <label className="cursor-pointer text-xs font-medium text-sky-600 underline">
        or choose a photo file instead
        <input
          ref={fileInputRef}
          type="file"
          accept="image/jpeg,image/png"
          onChange={handleFileChosen}
          className="hidden"
        />
      </label>
    </div>
  );
}
