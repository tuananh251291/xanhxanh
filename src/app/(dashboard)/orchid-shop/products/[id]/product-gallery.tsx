"use client";

import { useState } from "react";
import { Flower2 } from "lucide-react";
import { cn } from "@/lib/utils";

export default function ProductGallery({ images, name }: { images: string[]; name: string }) {
  const [active, setActive] = useState(0);
  if (images.length === 0) {
    return (
      <div className="aspect-square rounded-xl bg-primary-light flex items-center justify-center">
        <Flower2 className="w-16 h-16 text-primary-strong/50" />
      </div>
    );
  }
  return (
    <div className="space-y-2">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={images[active]} alt={name} className="w-full aspect-square object-cover rounded-xl border border-divider" />
      {images.length > 1 && (
        <div className="flex gap-2 overflow-x-auto">
          {images.map((src, i) => (
            <button key={src} type="button" onClick={() => setActive(i)} className={cn("shrink-0 rounded-lg border-2", i === active ? "border-primary" : "border-transparent")}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={src} alt="" className="w-16 h-16 object-cover rounded-md" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
