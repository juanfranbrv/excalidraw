// Cuentas de usuario con Better Auth (email y contraseña).
// Solo pueden crear cuenta los emails permitidos:
//   ALLOWED_DOMAINS: dominios enteros, separados por comas (p. ej. "awordz.com").
//   ALLOWED_EMAILS:  emails sueltos, separados por comas.
// Las cuentas se guardan en DATA_DIR/auth.sqlite.

import path from "node:path";
import { DatabaseSync } from "node:sqlite";

import { betterAuth } from "better-auth";
import { APIError } from "better-auth/api";
import { getMigrations } from "better-auth/db/migration";
import { fromNodeHeaders, toNodeHandler } from "better-auth/node";

const list = (value) =>
  (value || "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);

const ALLOWED_DOMAINS = list(process.env.ALLOWED_DOMAINS);
const ALLOWED_EMAILS = list(process.env.ALLOWED_EMAILS);

export const isEmailAllowed = (email) => {
  const clean = String(email || "").toLowerCase();
  const domain = clean.split("@")[1];
  return ALLOWED_EMAILS.includes(clean) || ALLOWED_DOMAINS.includes(domain);
};

export const createAuth = async (dataDir) => {
  const auth = betterAuth({
    appName: "Awordz Draw",
    baseURL: process.env.BETTER_AUTH_URL,
    secret: process.env.BETTER_AUTH_SECRET,
    basePath: "/api/auth",
    database: new DatabaseSync(path.join(dataDir, "auth.sqlite")),
    emailAndPassword: {
      enabled: true,
      minPasswordLength: 8,
      autoSignIn: true,
    },
    session: {
      expiresIn: 60 * 60 * 24 * 90, // 90 días
      updateAge: 60 * 60 * 24, // renueva la sesión una vez al día
    },
    databaseHooks: {
      user: {
        create: {
          before: async (user) => {
            if (!isEmailAllowed(user.email)) {
              throw new APIError("FORBIDDEN", {
                message: "Este email no tiene permiso para crear cuenta.",
              });
            }
          },
        },
      },
    },
  });

  // Crea o actualiza las tablas de Better Auth al arrancar.
  const { runMigrations } = await getMigrations(auth.options);
  await runMigrations();

  const getUser = async (nodeHeaders) => {
    const session = await auth.api.getSession({
      headers: fromNodeHeaders(nodeHeaders),
    });
    return session?.user ?? null;
  };

  return { auth, handler: toNodeHandler(auth), getUser };
};
