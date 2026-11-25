// Llamadas al servidor propio de Awordz Draw (carpeta server/).

export type Drawing = {
  id: string;
  roomKey: string;
  title: string;
  createdBy: string;
  createdAt: number;
  updatedAt: number;
  updatedBy: string | null;
};

const request = async <T>(
  path: string,
  options: RequestInit = {},
): Promise<T> => {
  const response = await fetch(`/api${path}`, {
    credentials: "same-origin",
    ...options,
    headers: {
      ...(options.body ? { "Content-Type": "application/json" } : {}),
      ...options.headers,
    },
  });
  if (!response.ok) {
    const error = new Error(`HTTP ${response.status}`) as Error & {
      status?: number;
    };
    error.status = response.status;
    throw error;
  }
  return response.json();
};

export const getMe = () => request<{ name: string }>("/me");

export const login = (password: string, name: string) =>
  request<{ name: string }>("/login", {
    method: "POST",
    body: JSON.stringify({ password, name }),
  });

export const logout = () => request("/logout", { method: "POST" });

export const listDrawings = () => request<Drawing[]>("/drawings");

export const createDrawing = (id: string, roomKey: string, title: string) =>
  request("/drawings", {
    method: "POST",
    body: JSON.stringify({ id, roomKey, title }),
  });

export const renameDrawing = (id: string, title: string) =>
  request(`/drawings/${id}`, {
    method: "PATCH",
    body: JSON.stringify({ title }),
  });

export const deleteDrawing = (id: string) =>
  request(`/drawings/${id}`, { method: "DELETE" });

// Sala abierta ahora, leída de la URL (#room=<id>,<clave>).
export const getCurrentRoom = () => {
  const match = window.location.hash.match(
    /^#room=([a-zA-Z0-9_-]+),([a-zA-Z0-9_-]+)$/,
  );
  return match ? { roomId: match[1], roomKey: match[2] } : null;
};

// Abre un dibujo guardado: entra en su sala y recarga la página.
export const openDrawing = (drawing: Pick<Drawing, "id" | "roomKey">) => {
  window.location.assign(`/#room=${drawing.id},${drawing.roomKey}`);
  window.location.reload();
};
