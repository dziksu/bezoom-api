/**
 * This file has been claimed for ownership from @oussemasahbeni/keycloakify-login-shadcn version 250004.0.24.
 * To relinquish ownership and restore this file to its original content, run the following command:
 *
 * $ npx keycloakify own --path "login/components/Template/layouts/TwoColumnLayout.tsx" --revert
 */

import { useKcContext } from "@/login/KcContext";
import { redirectUrlOrigin } from "@/login/shared/redirectUrlOrigin";
import { Check, Sparkles } from "lucide-react";
import type { ReactNode } from "react";
import { TemplateTopBar } from "../TemplateTopBar";

export function TwoColumnLayout(props: { content: ReactNode; logoUrl: string }) {
    const { content, logoUrl } = props;

    const { kcContext } = useKcContext();
    const homeUrl = kcContext.client?.baseUrl ?? redirectUrlOrigin;
    const isLoginPage = kcContext.pageId === "login.ftl";

    return (
        <div className="bezoom-auth-shell grid min-h-svh lg:grid-cols-[1.1fr_0.9fr]">
            <section className="bezoom-auth-hero relative hidden overflow-hidden p-12 text-white lg:flex lg:flex-col lg:justify-between">
                <div className="relative z-10 flex items-center justify-between">
                    <a
                        href={homeUrl}
                        aria-label="BeZoom — wróć do mapy"
                        className="bezoom-brand inline-flex items-center gap-3 rounded-xl"
                    >
                        <img
                            src={logoUrl}
                            alt=""
                            aria-hidden="true"
                            className="size-11"
                        />
                        <span className="bezoom-wordmark text-lg">bezoom</span>
                    </a>

                    <a
                        href={homeUrl}
                        className="bezoom-hero-back inline-flex items-center gap-2 rounded-full px-4 py-2 text-xs font-bold"
                    >
                        Wróć do mapy
                    </a>
                </div>

                <div className="relative z-10 max-w-3xl">
                    <span className="bezoom-kicker inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-[10px] font-bold tracking-[0.08em] uppercase">
                        <Sparkles className="size-3.5" />
                        Dzieje się bliżej, niż myślisz
                    </span>
                    <h1 className="bezoom-hero-title mt-6 font-black">
                        Wyjdź.
                        <br />
                        Zobacz.
                        <br />
                        Bądź tam.
                    </h1>
                    <p className="mt-7 max-w-xl text-base leading-7 text-white/60">
                        Wydarzenia, ludzie i wspomnienia z Twojego miasta — na jednej
                        żywej mapie.
                    </p>
                </div>

                <div className="relative z-10 flex gap-5 text-[11px] font-semibold text-white/55">
                    <span className="flex items-center gap-1.5">
                        <Check className="bezoom-check size-3.5" /> Szybkie logowanie
                    </span>
                    <span className="flex items-center gap-1.5">
                        <Check className="bezoom-check size-3.5" /> Bezpieczne konto
                    </span>
                </div>
            </section>

            <section className="bezoom-auth-form-panel relative flex min-h-svh flex-col overflow-hidden px-4 py-5 sm:px-8 lg:items-center lg:justify-center lg:py-24">
                <TemplateTopBar />

                {isLoginPage && (
                    <div className="bezoom-mobile-pitch relative z-10 mx-auto my-10 w-full max-w-md text-white sm:my-14 lg:hidden">
                        <span className="bezoom-kicker inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-[9px] font-bold tracking-[0.08em] uppercase">
                            <Sparkles className="size-3.5" />
                            Dzieje się bliżej, niż myślisz
                        </span>
                        <h1 className="mt-5 text-[clamp(3.25rem,15vw,5rem)] leading-[0.86] font-black tracking-[-0.075em]">
                            Wyjdź.
                            <br />
                            Zobacz.
                            <br />
                            <span className="bezoom-lime">Bądź tam.</span>
                        </h1>
                        <p className="mt-5 max-w-sm text-sm leading-6 text-white/65">
                            Wydarzenia, ludzie i wspomnienia z Twojego miasta — na
                            jednej żywej mapie.
                        </p>
                    </div>
                )}

                <main className="relative z-10 mx-auto flex w-full max-w-md flex-1 flex-col justify-center lg:flex-none">
                    {content}
                </main>
            </section>
        </div>
    );
}
