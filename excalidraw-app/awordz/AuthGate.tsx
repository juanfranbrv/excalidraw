// Pantalla de entrada: solo con la cuenta de Google.
// Si ya hay sesión, muestra la app directamente.

import React, { useEffect, useState } from "react";

import { getMe, signInWithGoogle } from "./api";

import "./awordz.scss";

type Status = "loading" | "login" | "ready";

// Lee y quita de la URL el error que deja Better Auth al volver de Google.
const takeLoginError = () => {
  const url = new URL(window.location.href);
  const failed =
    url.searchParams.has("login_error") || url.searchParams.has("error");
  if (failed) {
    url.searchParams.delete("login_error");
    url.searchParams.delete("error");
    window.history.replaceState({}, "", url.toString());
  }
  return failed;
};

export const AuthGate = ({ children }: { children: React.ReactNode }) => {
  const [status, setStatus] = useState<Status>("loading");
  const [error, setError] = useState<string | null>(() =>
    takeLoginError()
      ? "No se pudo entrar. Puede que tu cuenta de Google no tenga permiso. Habla con Juanfran."
      : null,
  );
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

  const onGoogle = async () => {
    setError(null);
    setSending(true);
    try {
      await signInWithGoogle();
    } catch {
      setError("No se pudo conectar con el servidor. Inténtalo otra vez.");
      setSending(false);
    }
  };

  return (
    <div className="awordz-login">
      <div className="awordz-login__card">
        <img src="/android-chrome-192x192.png" alt="" width={64} height={64} />
        <h1>Awordz Draw</h1>
        <button
          type="button"
          className="awordz-login__google"
          onClick={onGoogle}
          disabled={sending}
        >
          <svg viewBox="0 0 48 48" width="20" height="20" aria-hidden="true">
            <path
              fill="#FFC107"
              d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z"
            />
            <path
              fill="#FF3D00"
              d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"
            />
            <path
              fill="#4CAF50"
              d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-7.9l-6.5 5C9.5 39.6 16.2 44 24 44z"
            />
            <path
              fill="#1976D2"
              d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C36.9 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z"
            />
          </svg>
          {sending ? "Abriendo Google…" : "Entrar con Google"}
        </button>
        {error && <p className="awordz-login__error">{error}</p>}
      </div>
    </div>
  );
};
