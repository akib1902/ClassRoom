"use client";

import { useEffect, useRef } from "react";
import { useNavigate } from "react-router";
import { toast } from "sonner";

import { IS_API_AUTH } from "@/providers/constants";

/**
 * Reports the outcome of the Google round-trip.
 *
 * The API redirects back with `?auth=success|error` plus an opaque `reason`
 * code. Nothing sensitive travels in the URL, so this only has to translate the
 * marker into a toast and strip it from the address bar (otherwise a refresh or
 * a shared link would replay a stale message).
 */

const REASON_MESSAGES: Record<string, string> = {
  google_unconfigured:
    "Google sign-in is not configured on the server yet. Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET.",
  google_denied: "Google sign-in was cancelled.",
  oauth_state: "That sign-in attempt expired. Please start again.",
  google_exchange_failed: "Google rejected the sign-in attempt. Please try again.",
  google_id_token: "Google's response could not be verified. Please try again.",
  not_allowed: "That Google account is not allowed to sign in here.",
  server_error: "Something went wrong during sign-in. Please try again.",
  signin_failed: "Sign-in did not complete. Please try again.",
};

export const AuthUrlMarker = () => {
  const navigate = useNavigate();
  const handled = useRef(false);

  useEffect(() => {
    if (!IS_API_AUTH || handled.current) return;

    const params = new URLSearchParams(window.location.search);
    const auth = params.get("auth");
    if (!auth) return;

    handled.current = true;

    const reason = params.get("reason");
    const via = params.get("via");

    for (const key of ["auth", "via", "reason"]) params.delete(key);
    const query = params.toString();

    navigate(`${window.location.pathname}${query ? `?${query}` : ""}`, {
      replace: true,
    });

    if (auth === "success") {
      toast.success(via === "google" ? "Signed in with Google" : "Signed in");
      return;
    }

    toast.error("Sign-in failed", {
      description:
        REASON_MESSAGES[reason ?? ""] ?? "Please try again in a moment.",
    });
  }, [navigate]);

  return null;
};

AuthUrlMarker.displayName = "AuthUrlMarker";
