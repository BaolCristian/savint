"use client";

import { signIn, getProviders } from "next-auth/react";
import { useEffect, useState } from "react";
import { withBasePath } from "@/lib/base-path";
import { useTranslations } from "next-intl";
import { Lock, Mail, ArrowRight } from "lucide-react";

export default function LoginPage() {
  const t = useTranslations("login");
  const [email, setEmail] = useState("docente@scuola.it");

  const [googleEnabled, setGoogleEnabled] = useState(false);
  const [devLoginEnabled, setDevLoginEnabled] = useState(false);

  useEffect(() => {
    getProviders()
      .then((providers) => {
        setGoogleEnabled(Boolean(providers?.google));
        // "credentials" = provider Dev Login (installation); registrato solo
        // con DEMO_MODE=true o in sviluppo.
        setDevLoginEnabled(Boolean(providers?.credentials));
      })
      .catch(() => {
        setGoogleEnabled(false);
        setDevLoginEnabled(false);
      });
  }, []);

  return (
    <div className="relative flex min-h-dvh items-center justify-center bg-gradient-to-br from-brand-blue-50 via-background to-brand-magenta-50 p-4 overflow-hidden font-sans select-none">
      
      {/* Soft ambient background glowing circles */}
      <div className="absolute top-1/4 left-1/4 w-[30rem] h-[30rem] rounded-full bg-brand-blue/5 blur-[100px] pointer-events-none -translate-x-1/2 -translate-y-1/2" />
      <div className="absolute bottom-1/4 right-1/4 w-[30rem] h-[30rem] rounded-full bg-brand-magenta/5 blur-[100px] pointer-events-none translate-x-1/2 translate-y-1/2" />

      {/* Floating Game Shapes in the background */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        {/* Triangle ▲ */}
        <span className="absolute text-brand-blue/10 text-9xl font-black top-[15%] left-[10%] select-none animate-float-drift-1">
          ▲
        </span>
        {/* Diamond ◆ */}
        <span className="absolute text-brand-orange/10 text-8xl font-black top-[65%] left-[15%] select-none animate-float-drift-2">
          ◆
        </span>
        {/* Circle ● */}
        <span className="absolute text-brand-magenta/10 text-9xl font-black top-[20%] right-[12%] select-none animate-float-drift-2">
          ●
        </span>
        {/* Square ■ */}
        <span className="absolute text-brand-green/10 text-8xl font-black top-[70%] right-[8%] select-none animate-float-drift-1">
          ■
        </span>
      </div>

      {/* Glassmorphism Card Container (Light Theme) */}
      <div className="relative w-full max-w-md backdrop-blur-xl bg-white/60 border border-white/80 shadow-2xl shadow-slate-200/50 rounded-3xl p-6 sm:p-10 text-center space-y-6 sm:space-y-8 z-10">
        
        {/* Logo and Brand Title */}
        <div className="space-y-3">
          <div className="relative inline-block group">
            {/* Soft glow behind the logo */}
            <div className="absolute inset-0 rounded-full bg-brand-blue/15 blur-xl opacity-75 group-hover:opacity-100 transition-opacity" />
            <img 
              src={withBasePath("/logo_savint.png")} 
              alt="SAVINT" 
              className="relative w-20 h-20 sm:w-24 sm:h-24 mx-auto object-contain transition-transform group-hover:scale-105 duration-300" 
            />
          </div>
          <h1 className="text-3xl font-black tracking-wider bg-gradient-to-r from-brand-blue via-brand-orange to-brand-magenta bg-clip-text text-transparent">
            SAVINT
          </h1>
          <p className="text-slate-500 text-xs sm:text-sm font-medium tracking-wide">
            {t("loginWithSchoolAccount")}
          </p>
        </div>

        {/* Google Sign In Button */}
        {googleEnabled && (
          <button
            onClick={() => signIn("google", { callbackUrl: withBasePath("/dashboard") })}
            className="flex items-center justify-center w-full bg-white hover:bg-slate-50 text-slate-800 border border-slate-200 px-6 py-3 rounded-2xl transition-all font-semibold text-sm sm:text-base shadow-sm hover:shadow-md hover:scale-[1.02] active:scale-[0.98] cursor-pointer"
          >
            {/* Google official SVG 'G' Icon */}
            <svg className="w-5 h-5 mr-3 shrink-0" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
              <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
              <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
              <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z" fill="#FBBC05" />
              <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" fill="#EA4335" />
            </svg>
            {t("loginWithGoogle")}
          </button>
        )}

        {/* Demo Login (Credentials) Button */}
        {devLoginEnabled && (
          <div className="border-t border-slate-200/60 pt-6 space-y-4 text-left">
            <div className="flex items-center gap-2 text-slate-500 justify-center">
              <Lock className="w-3.5 h-3.5" />
              <p className="text-xs sm:text-sm font-semibold tracking-wide uppercase text-center">
                {t("demoLogin")}
              </p>
            </div>
            
            {/* Input field with icon */}
            <div className="relative group">
              <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 group-focus-within:text-brand-blue transition-colors" />
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full bg-white border border-slate-200 rounded-2xl pl-11 pr-4 py-3 text-slate-900 placeholder:text-slate-400 text-sm focus:outline-none focus:border-brand-blue focus:ring-4 focus:ring-brand-blue/20 transition-all font-medium"
                placeholder={t("emailPlaceholder")}
              />
            </div>

            {/* Submit Demo Button */}
            <button
              onClick={() => signIn("credentials", { email, callbackUrl: withBasePath("/dashboard") })}
              className="group/btn flex items-center justify-center w-full bg-gradient-to-r from-brand-orange to-amber-500 hover:from-brand-orange/90 hover:to-amber-500/90 text-slate-955 px-6 py-3 rounded-2xl transition-all font-bold text-sm sm:text-base shadow-md shadow-brand-orange/10 hover:shadow-lg hover:scale-[1.02] active:scale-[0.98] cursor-pointer"
            >
              {t("enterAsTeacher")}
              <ArrowRight className="w-4 h-4 ml-2 transition-transform group-hover/btn:translate-x-1 duration-200" />
            </button>
          </div>
        )}

      </div>
    </div>
  );
}
