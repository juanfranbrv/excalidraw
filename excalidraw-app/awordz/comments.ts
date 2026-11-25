// Estado y llamadas de los comentarios. Lo comparten la pestaña lateral
// (CommentsPanel) y las marcas sobre el lienzo (CommentsLayer).

import { atom } from "../app-jotai";

export type Comment = {
  id: string;
  parentId: string | null;
  x: number | null;
  y: number | null;
  text: string;
  authorId: string;
  authorName: string;
  createdAt: number;
  resolvedAt: number | null;
  resolvedBy: string | null;
};

export type Thread = Comment & { replies: Comment[] };

// Lista de comentarios del dibujo abierto.
export const commentsAtom = atom<Comment[]>([]);
// Hilo seleccionado (marca resaltada en el lienzo).
export const activeThreadAtom = atom<string | null>(null);
// true mientras el usuario elige con un clic dónde poner el comentario.
export const placingCommentAtom = atom(false);
// Posición elegida para el comentario nuevo, aún sin texto.
export const draftPositionAtom = atom<{ x: number; y: number } | null>(null);
// Dibujo guardado abierto: undefined = aún no se sabe, null = no hay.
export const commentsDrawingAtom = atom<string | null | undefined>(undefined);
// Id de la cuenta propia (para saber qué comentarios puedo borrar).
export const myUserIdAtom = atom<string | null>(null);
// Se incrementa para pedir una recarga inmediata de los comentarios.
export const commentsRefreshAtom = atom(0);
// Mostrar también los hilos resueltos.
export const showResolvedAtom = atom(false);

export const toThreads = (comments: Comment[]): Thread[] => {
  const threads = comments
    .filter((c) => !c.parentId)
    .map((c) => ({ ...c, replies: [] as Comment[] }));
  const byId = new Map(threads.map((t) => [t.id, t]));
  for (const c of comments) {
    if (c.parentId) {
      byId.get(c.parentId)?.replies.push(c);
    }
  }
  return threads;
};

const call = async (path: string, options: RequestInit = {}) => {
  const response = await fetch(`/api${path}`, {
    credentials: "same-origin",
    ...options,
    headers: options.body ? { "Content-Type": "application/json" } : {},
  });
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }
  return response.json();
};

export const fetchComments = (drawingId: string): Promise<Comment[]> =>
  call(`/drawings/${drawingId}/comments`);

export const postComment = (
  drawingId: string,
  data: { text: string; parentId?: string; x?: number; y?: number },
) =>
  call(`/drawings/${drawingId}/comments`, {
    method: "POST",
    body: JSON.stringify(data),
  });

export const setResolved = (commentId: string, resolved: boolean) =>
  call(`/comments/${commentId}`, {
    method: "PATCH",
    body: JSON.stringify({ resolved }),
  });

export const removeComment = (commentId: string) =>
  call(`/comments/${commentId}`, { method: "DELETE" });
