"use client";

import { useEffect, useMemo } from "react";

import { createClient } from "@/lib/supabase/client";
import {
  applyUiTheme,
  DEFAULT_UI_THEME,
  parseUiTheme,
  UI_THEME_KEY,
} from "@/lib/ui-theme";

export function UiThemeApplier() {
  const supabase = useMemo(() => createClient(), []);

  useEffect(() => {
    let active = true;

    void supabase
      .from("system_settings")
      .select("value")
      .eq("key", UI_THEME_KEY)
      .maybeSingle()
      .then(({ data }) => {
        if (active) applyUiTheme(parseUiTheme(data?.value));
      });

    return () => {
      active = false;
      applyUiTheme(DEFAULT_UI_THEME);
    };
  }, [supabase]);

  return null;
}
