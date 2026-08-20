/**
 * This file has been claimed for ownership from @oussemasahbeni/keycloakify-login-shadcn version 250004.0.24.
 * To relinquish ownership and restore this file to its original content, run the following command:
 *
 * $ npx keycloakify own --path "login/components/Template/TemplateTopBar.tsx" --revert
 */

import { Button } from "@/components/ui/button";
import { ModeToggle } from "@/login/components/ui/ThemeToggle";
import { redirectUrlOrigin } from "@/login/shared/redirectUrlOrigin";
import { resolveAssetUrl } from "@/login/shared/resolveAssetUrl";
import { ArrowLeft } from "lucide-react";
import { useI18n } from "../../i18n";
import { useKcContext } from "../../KcContext";
import { Languages } from "../ui/Langauges";

export function TemplateTopBar() {
    const { kcContext } = useKcContext();
    const { enabledLanguages } = useI18n();
    const homeUrl = kcContext.client?.baseUrl ?? redirectUrlOrigin;
    const logoUrl =
        resolveAssetUrl(kcContext.properties.SHADCN_THEME_LOGO_WHITE_URL) ?? "";

    return (
        <div className="bezoom-top-bar absolute inset-x-4 top-4 z-20 flex items-center justify-between gap-3 lg:inset-x-6 lg:top-6">
            <a
                href={homeUrl}
                aria-label="BeZoom — wróć do mapy"
                className="bezoom-mobile-brand inline-flex items-center gap-2 rounded-xl lg:hidden"
            >
                <img src={logoUrl} alt="" aria-hidden="true" className="size-10" />
                <span className="bezoom-wordmark text-white">bezoom</span>
            </a>

            <div className="ml-auto flex items-center gap-2">
                <Button
                    type="button"
                    variant="outline"
                    className="bezoom-home-button h-10 rounded-full px-3.5"
                    asChild
                >
                    <a href={homeUrl} aria-label="Wróć do mapy">
                        <ArrowLeft className="size-3.5" />
                        <span className="lg:hidden">Mapa</span>
                        <span className="hidden lg:inline">Wróć do mapy</span>
                    </a>
                </Button>

                {kcContext.darkMode !== false && <ModeToggle />}

                {enabledLanguages.length > 1 && <Languages />}
            </div>
        </div>
    );
}
