import { useEffect, useState } from "react";

import { fetchProviders } from "@/providers/api-auth";
import { IS_API_AUTH } from "@/providers/constants";

/**
 * Whether the Google button should be usable.
 *
 * In demo mode it always is (the flow is local). In API mode the server is the
 * one that knows if `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET` are set, so the
 * button is disabled up front instead of failing after a redirect.
 */
export const useGoogleAvailability = () => {
  const [googleEnabled, setGoogleEnabled] = useState(true);
  const [checking, setChecking] = useState(IS_API_AUTH);

  useEffect(() => {
    if (!IS_API_AUTH) return;

    let active = true;
    fetchProviders().then((providers) => {
      if (!active) return;
      setGoogleEnabled(providers.google.enabled);
      setChecking(false);
    });

    return () => {
      active = false;
    };
  }, []);

  return { googleEnabled, checking };
};
