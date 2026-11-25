// Pantalla de entrada: pide la contraseña del equipo y el nombre de la persona.
// Si ya hay sesión, muestra la app directamente.

import React, { useEffect, useState } from "react";

import { getMe, login } from "./api";

import "./awordz.scss";

type Status = "loading" | "login" | "ready";

export const AuthGate = ({ children }: { children: React.ReactNode }) => {
  const [status, setStatus] = useState<Status>("loading");
  const [name, setName] = useState(
    () => window.localStorage.getItem("awordz-name") || "",
  );
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
      const me = await login(password, name);
      window.localStorage.setItem("awordz-name", me.name);
      setStatus("ready");
    } catch (err: any) {
      setError(
        err?.status === 401
          ? "La contraseña no es correcta."
          : err?.status === 400
          ? "Escribe tu nombre."
          : "No se pudo conectar con el servidor.",
      );
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="awordz-login">
      <form className="awordz-login__card" onSubmit={onSubmit}>
        <img src="/android-chrome-192x192.png" alt="" width={64} height={64} />
        <h1>Awordz Draw</h1>
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
        <label>
          Contraseña del equipo
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
            required
          />
        </label>
        {error && <p className="awordz-login__error">{error}</p>}
        <button type="submit" disabled={sending}>
          {sending ? "Entrando…" : "Entrar"}
        </button>
      </form>
    </div>
  );
};
