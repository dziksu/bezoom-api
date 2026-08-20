/**
 * This file has been claimed for ownership from @oussemasahbeni/keycloakify-login-shadcn version 250004.0.24.
 * To relinquish ownership and restore this file to its original content, run the following command:
 *
 * $ npx keycloakify own --path "login/components/Template/TemplateContent.tsx" --revert
 */

import { cn } from "@/components/lib/utils";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
    Tooltip,
    TooltipContent,
    TooltipProvider,
    TooltipTrigger
} from "@/components/ui/tooltip";
import { kcSanitize } from "@keycloakify/login-ui/kcSanitize";
import { useKcClsx } from "@keycloakify/login-ui/useKcClsx";
import { LockKeyhole, MapPinned, RotateCcw, User } from "lucide-react";
import { type ReactNode } from "react";
import { useI18n } from "../../i18n";
import { useKcContext } from "../../KcContext";
import type { TemplateProps } from "./Template";

type TemplateContentProps = TemplateProps & {
    logoWhiteUrl: string;
    logoDarkUrl: string;
    cardClassName?: string;
    brandingVisibilityClassName?: string;
};

export function TemplateContent(props: TemplateContentProps) {
    const {
        displayInfo = false,
        displayMessage = true,
        displayRequiredFields = false,
        headerNode,
        socialProvidersNode = null,
        infoNode = null,
        children,
        cardClassName
    } = props;

    const { kcContext } = useKcContext();
    const { auth, url, message, isAppInitiatedAction } = kcContext;
    const { msg, msgStr } = useI18n();
    const { kcClsx } = useKcClsx();
    const isLoginPage = kcContext.pageId === "login.ftl";

    const titleNode: ReactNode = !(
        auth !== undefined &&
        auth.showUsername &&
        !auth.showResetCredentials
    ) ? (
        <>
            {isLoginPage && (
                <span className="bezoom-login-icon mb-5 grid size-13 place-items-center rounded-[1.1rem]">
                    <MapPinned className="size-5" />
                </span>
            )}
            <h1 className="bezoom-auth-title">
                {isLoginPage ? "Miło Cię widzieć." : headerNode}
            </h1>
            {isLoginPage && (
                <p className="bezoom-auth-description mt-3 text-sm leading-6 text-muted-foreground">
                    Zaloguj się, aby dołączać do wydarzeń, komentować i zapisywać
                    najlepsze plany.
                </p>
            )}
        </>
    ) : (
        <div id="kc-username" className="flex items-center justify-between gap-2">
            <div className="flex gap-4 items-center">
                <User className="text-muted-foreground size-6" />

                <div className="flex flex-col gap-0.5">
                    <span className="text-xs font-normal text-muted-foreground">
                        {msgStr("attemptedUsernameLoggingInAs")}
                    </span>
                    <span className="font-semibold text-lg" id="kc-attempted-username">
                        {auth.attemptedUsername}
                    </span>
                </div>
            </div>

            <TooltipProvider>
                <Tooltip>
                    <TooltipTrigger asChild>
                        <Button variant="outline" size="icon" asChild>
                            <a
                                id="reset-login"
                                href={url.loginRestartFlowUrl}
                                aria-label={msgStr("restartLoginTooltip")}
                            >
                                <RotateCcw className="size-4" />
                            </a>
                        </Button>
                    </TooltipTrigger>
                    <TooltipContent>
                        <p>{msg("restartLoginTooltip")}</p>
                    </TooltipContent>
                </Tooltip>
            </TooltipProvider>
        </div>
    );

    return (
        <Card className={cn("bezoom-auth-card", cardClassName)}>
            <CardHeader>
                <CardTitle>
                    {displayRequiredFields ? (
                        <div className="flex items-center justify-between gap-2">
                            <div>{titleNode}</div>
                            <div>
                                <span className="subtitle">
                                    <span className="text-red-500" aria-hidden="true">
                                        *
                                    </span>
                                    {msg("requiredFields")}
                                </span>
                            </div>
                        </div>
                    ) : (
                        titleNode
                    )}
                </CardTitle>
            </CardHeader>

            <CardContent>
                <div id="kc-content" className="flex flex-col gap-4">
                    {displayMessage &&
                        message !== undefined &&
                        (message.type !== "warning" || !isAppInitiatedAction) && (
                            <Alert variant={message.type}>
                                <AlertDescription>
                                    <span
                                        dangerouslySetInnerHTML={{
                                            __html: kcSanitize(message.summary)
                                        }}
                                    />
                                </AlertDescription>
                            </Alert>
                        )}

                    {socialProvidersNode}
                    {children}

                    {isLoginPage && (
                        <div className="bezoom-security-note flex items-start gap-3 rounded-[1rem] px-4 py-3.5">
                            <LockKeyhole className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                            <p className="text-[10px] leading-4 text-muted-foreground">
                                Logując się, potwierdzasz, że akceptujesz zasady
                                korzystania z BeZoom. Twoje dane logowania nie są
                                udostępniane innym użytkownikom.
                            </p>
                        </div>
                    )}

                    {auth !== undefined && auth.showTryAnotherWayLink && (
                        <form
                            id="kc-select-try-another-way-form"
                            action={url.loginAction}
                            method="post"
                        >
                            <div className={kcClsx("kcFormGroupClass")}>
                                <input type="hidden" name="tryAnotherWay" value="on" />
                                <Button
                                    type="button"
                                    className="w-full"
                                    variant="outline"
                                    asChild
                                >
                                    <a
                                        href="#"
                                        id="try-another-way"
                                        onClick={event => {
                                            document.forms[
                                                "kc-select-try-another-way-form" as never
                                            ].submit();
                                            event.preventDefault();
                                            return false;
                                        }}
                                    >
                                        {msg("doTryAnotherWay")}
                                    </a>
                                </Button>
                            </div>
                        </form>
                    )}

                    {displayInfo && <div className="text-center text-sm">{infoNode}</div>}
                </div>
            </CardContent>
        </Card>
    );
}
