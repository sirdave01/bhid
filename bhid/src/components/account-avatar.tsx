
"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";

type AccountAvatarProps = {
  avatarUrl: string | null;
  displayName: string;
  size?: number;
};

export default function AccountAvatar({
  avatarUrl,
  displayName,
  size = 112,
}: AccountAvatarProps) {

    const [isOpen, setIsOpen] = useState(false);
    const [failedUrl, setFailedUrl] = useState<string | null>(null);
    const closeButtonRef = useRef<HTMLButtonElement>(null);
    const triggerRef = useRef<HTMLButtonElement>(null);

    const hasImage = Boolean(avatarUrl && failedUrl !== avatarUrl);
    const initial = displayName.trim().charAt(0).toUpperCase() || "U";

  
    useEffect(() => {
    
        if (!isOpen) return;

        const previousOverflow = document.body.style.overflow;

        // Capture the button reference before cleanup.
        const triggerButton = triggerRef.current;

        document.body.style.overflow = "hidden";

        closeButtonRef.current?.focus();

        function handleKeyDown(event: KeyboardEvent) {
            if (event.key === "Escape") {
            setIsOpen(false);
            }
        }

        window.addEventListener("keydown", handleKeyDown);

        return () => {
            document.body.style.overflow = previousOverflow;

            window.removeEventListener("keydown", handleKeyDown);

            // Restore focus to the original avatar button.
            triggerButton?.focus();
        };
    }, [isOpen]);


    return (
        <>
        <button
            ref={triggerRef}
            type="button"
            disabled={!hasImage}
            aria-label="View profile picture"
            onClick={() => setIsOpen(true)}
            className="relative flex shrink-0 items-center justify-center overflow-hidden rounded-full border-2 border-indigo-500 bg-zinc-800 text-white transition hover:border-indigo-300 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-indigo-400 disabled:cursor-default"
            style={{ width: size, height: size }}
        >
            {hasImage ? (
            <Image
                key={avatarUrl}
                src={avatarUrl!}
                alt={`${displayName}'s profile picture`}
                fill
                sizes={`${size}px`}
                unoptimized
                className="object-cover"
                onError={() => setFailedUrl(avatarUrl)}
            />
            ) : (
            <span className="text-3xl font-bold">{initial}</span>
            )}
        </button>

      {isOpen && hasImage && avatarUrl && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 p-4"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) {
              setIsOpen(false);
            }
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Profile picture preview"
            className="flex max-h-full w-full max-w-3xl flex-col items-center gap-4"
          >
            <button
              ref={closeButtonRef}
              type="button"
              onClick={() => setIsOpen(false)}
              className="self-end rounded-lg bg-zinc-800 px-4 py-2 text-white hover:bg-zinc-700 focus-visible:outline-2 focus-visible:outline-indigo-400"
            >
              Close ×
            </button>

            <div className="relative h-[min(70vh,650px)] w-full">
              <Image
                src={avatarUrl}
                alt={`Full-size profile picture of ${displayName}`}
                fill
                sizes="(max-width: 768px) 100vw, 768px"
                unoptimized
                className="object-contain"
                onError={() => {
                  setFailedUrl(avatarUrl);
                  setIsOpen(false);
                }}
              />
            </div>

            <p className="text-center text-sm text-zinc-300">
              {displayName}
            </p>
          </div>
        </div>
      )}
    </>
  );
}
