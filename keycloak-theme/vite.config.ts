import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { keycloakify } from "keycloakify/vite-plugin";
import path from "node:path";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    keycloakify({
      accountThemeImplementation: "none",
      themeName: "bezoom",
      keycloakVersionTargets: {
        "22-to-25": false,
        "all-other-versions": "bezoom-keycloak-theme.jar"
      },
      environmentVariables: [
        {
          name: "SHADCN_THEME_LOGO_WHITE_URL",
          default: "%BASE_URL%/logo-color-bg.svg"
        },
        {
          name: "SHADCN_THEME_LOGO_DARK_URL",
          default: "%BASE_URL%/logo-color-bg.svg"
        },
        { name: "SHADCN_THEME_LAYOUT", default: "two-column" },
        { name: "SHADCN_THEME_SIDE_IMAGE_URL", default: "" },
        { name: "SHADCN_THEME_PRESET", default: "violet" },
        { name: "SHADCN_THEME_BASE", default: "neutral" },
        { name: "SHADCN_THEME_RADIUS", default: "large" },
        { name: "SHADCN_THEME_FONT", default: "geist" },
        { name: "SHADCN_THEME_PLACEHOLDER", default: "true" }
      ]
    })
  ],
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "./src")
    }
  }
});
