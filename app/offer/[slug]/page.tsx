"use client";

/**
 * app/offer/[slug]/page.tsx
 *
 * Public offer landing page as specified in Section 14.12, 14.13, and 15.6.
 * Light theme only, system fonts, no personal data collected.
 */

import React, { useEffect, useState, Suspense } from "react";
import { useParams, useSearchParams } from "next/navigation";

interface OfferData {
  filmTitle: string;
  theaterName: string;
  city: string;
  startsAtLocal: string;
  offerText: string | null;
}

function OfferContent() {
  const params = useParams();
  const searchParams = useSearchParams();
  const slug = params?.slug as string;
  const src = searchParams?.get("src") || "direct";

  const [loading, setLoading] = useState(true);
  const [offer, setOffer] = useState<OfferData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [claimed, setClaimed] = useState(false);
  const [claiming, setClaiming] = useState(false);

  useEffect(() => {
    if (!slug) return;

    fetch(`/api/offer/${encodeURIComponent(slug)}`)
      .then(async (res) => {
        if (!res.ok) {
          throw new Error("OFFER_NOT_FOUND");
        }
        return res.json();
      })
      .then((data) => {
        setOffer(data);
        setLoading(false);
      })
      .catch(() => {
        setError("Offer not found or no longer active.");
        setLoading(false);
      });
  }, [slug]);

  const handleClaim = async () => {
    if (claiming || claimed) return;
    setClaiming(true);

    try {
      const sanitizedSrc = src.replace(/[^a-z0-9_-]/gi, "").slice(0, 24) || "direct";
      const res = await fetch(`/api/offer/${encodeURIComponent(slug)}/claim`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ src: sanitizedSrc }),
      });

      if (res.ok) {
        setClaimed(true);
      } else {
        alert("Something went wrong. Please try again.");
      }
    } catch {
      alert("Something went wrong. Please try again.");
    } finally {
      setClaiming(false);
    }
  };

  return (
    <main className="min-h-screen bg-stone-50 text-stone-900 py-12 px-4 flex flex-col justify-center items-center">
      <div className="w-full max-w-lg bg-white border border-stone-200 rounded-2xl shadow-sm p-8 text-center space-y-6">
        {loading && (
          <div className="py-12 text-stone-500" role="status">
            <span>Loading offer details...</span>
          </div>
        )}

        {error && (
          <div className="py-12 text-red-600 font-medium">
            <p>{error}</p>
          </div>
        )}

        {!loading && !error && offer && (
          <>
            <div className="space-y-2">
              <span className="inline-block px-3 py-1 bg-amber-50 text-amber-800 border border-amber-200 text-xs font-semibold rounded-full uppercase tracking-wider">
                Special Cinema Invitation
              </span>
              <h1 className="text-3xl font-extrabold tracking-tight text-stone-900">
                {offer.filmTitle}
              </h1>
              <p className="text-stone-600 font-medium">
                {offer.theaterName} &bull; {offer.city}
              </p>
              <p className="text-sm text-stone-500">{offer.startsAtLocal}</p>
            </div>

            {offer.offerText && (
              <div className="p-4 bg-stone-100 rounded-xl border border-stone-200 text-stone-800 font-medium text-lg">
                &ldquo;{offer.offerText}&rdquo;
              </div>
            )}

            <div className="pt-2">
              {claimed ? (
                <div className="p-4 bg-emerald-50 text-emerald-800 border border-emerald-200 rounded-xl font-semibold">
                  Thanks! Your interest has been noted.
                </div>
              ) : (
                <button
                  type="button"
                  onClick={handleClaim}
                  disabled={claiming}
                  className="w-full py-4 px-6 bg-stone-900 hover:bg-stone-800 text-white font-bold rounded-xl shadow-sm transition-colors text-lg disabled:opacity-60"
                >
                  {claiming ? "Saving..." : "I'm interested"}
                </button>
              )}
            </div>

            <p className="text-xs text-stone-400">
              Demo only: no booking is made and no personal data is collected.
            </p>
          </>
        )}
      </div>
    </main>
  );
}

export default function OfferPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-stone-50 flex items-center justify-center text-stone-500">
          Loading offer details...
        </div>
      }
    >
      <OfferContent />
    </Suspense>
  );
}
