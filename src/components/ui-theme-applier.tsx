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

    void (async () => {
      const [{ data: globalSetting }, { data: authData }] = await Promise.all([
        supabase
          .from("system_settings")
          .select("value")
          .eq("key", UI_THEME_KEY)
          .maybeSingle(),
        supabase.auth.getUser(),
      ]);

      const companyTheme = parseUiTheme(globalSetting?.value);
      const authUid = authData.user?.id;
      if (!authUid) {
        if (active) applyUiTheme(companyTheme);
        return;
      }

      const { data: employee } = await supabase
        .from("employees")
        .select("id")
        .eq("auth_uid", authUid)
        .maybeSingle();

      if (!employee?.id) {
        if (active) applyUiTheme(companyTheme);
        return;
      }

      const { data: personalSetting } = await supabase
        .from("employee_ui_themes")
        .select("theme, is_enabled")
        .eq("employee_id", employee.id)
        .maybeSingle();

      const selectedTheme = personalSetting?.is_enabled
        ? parseUiTheme(personalSetting.theme)
        : companyTheme;
      if (active) applyUiTheme(selectedTheme);
    })();

    return () => {
      active = false;
      applyUiTheme(DEFAULT_UI_THEME);
    };
  }, [supabase]);

  return null;
}
