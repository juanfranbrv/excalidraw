// Pantalla de entrada con cuentas de Better Auth.
// "Entrar": email y contraseña. "Crear cuenta": nombre, email y contraseña
// (solo para emails que el servidor permite). Si ya hay sesión, muestra la app.

import React, { useEffect, useState } from "react";

import { getMe, signIn, signUp } from "./api";

import "./awordz.scss";

type Status = "loading" | "login" | "ready";
type Mode = "signIn" | "signUp";

const errorText = (err: any, mode: Mode) => {
  if (err?.code === "INVALID_EMAIL_OR_PASSWORD") {
    return "El email o la contraseña no son correctos.";
  }
  if (err?.code === "USER_ALREADY_EXISTS" || err?.code?.includes("ALREADY")) {
    return "Ya existe una cuenta con ese email. Usa «Entrar».";
  }
  if (err?.code === "PASSWORD_TOO_SHORT") {
    return "La contraseña necesita al menos 8 caracteres.";
  }
  if (err?.status === 403) {
    return err.message;
  }
  if (err?.status === 429) {
    return "Demasiados intentos. Espera un minuto.";
  }
  return mode === "signIn"
    ? "No se pudo entrar. Inténtalo otra vez."
    : "No se pudo crear la cuenta. Inténtalo otra vez.";
};

export const AuthGate = ({ children }: { children: React.ReactNode }) => {
  const [status, setStatus] = useState<Status>("loading");
  const [mode, setMode] = useState<Mode>("signIn");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);

  useEffect(() => {
    getMe()
      .then(() => setStatus("ready"))
      .catch(() => setStatus("login"));
  }, []);

  if (status === "ready") {
    return <>{children}</>;
  }

  if (status === "loading") {
    return <div className="awordz-login" />;
  }

  const onSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    setSending(true);
    try {
      if (mode === "signIn") {
        await signIn(email.trim(), password);
      } else {
        await signUp(name.trim(), email.trim(), password);
      }
      setStatus("ready");
    } catch (err: any) {
      setError(errorText(err, mode));
    } finally {
      setSending(false);
    }
  };

  const switchMode = () => {
    setMode(mode === "signIn" ? "signUp" : "signIn");
    setError(null);
  };

  return (
    <div className="awordz-login">
      <form className="awordz-login__card" onSubmit={onSubmit}>
        <img src="/android-chrome-192x192.png" alt="" width={64} height={64} />
        <h1>Awordz Draw</h1>
        {mode === "signUp" && (
          <label>
            Tu nombre
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoComplete="name"
              maxLength={40}
              required
            />
          </label>
        )}
        <label>
          Email
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
            required
          />
        </label>
        <label>
          Contraseña
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete={
              mode === "signIn" ? "current-password" : "new-password"
            }
            minLength={8}
            required
          />
        </label>
        {error && <p className="awordz-login__error">{error}</p>}
        <button type="submit" disabled={sending}>
          {sending
            ? "Un momento…"
            : mode === "signIn"
            ? "Entrar"
            : "Crear cuenta"}
        </button>
        <button
          type="button"
          className="awordz-login__switch"
          onClick={switchMode}
        >
          {mode === "signIn"
            ? "¿No tienes cuenta? Crear cuenta"
            : "¿Ya tienes cuenta? Entrar"}
        </button>
      </form>
    </div>
  );
};
