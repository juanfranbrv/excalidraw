// Pestaña "Comentarios" de la barra lateral.
// Muestra los hilos del dibujo guardado que está abierto, con sus respuestas.
// Se actualiza cada 10 segundos y después de cada acción propia.

import React, { useState } from "react";

import { useExcalidrawAPI } from "@excalidraw/excalidraw";

import { useAtom, useAtomValue, useSetAtom } from "../app-jotai";

import {
  activeThreadAtom,
  commentsAtom,
  commentsDrawingAtom,
  commentsRefreshAtom,
  draftPositionAtom,
  myUserIdAtom,
  placingCommentAtom,
  postComment,
  removeComment,
  setResolved,
  showResolvedAtom,
  toThreads,
} from "./comments";

import type { Comment } from "./comments";

const formatDate = (ms: number) =>
  new Date(ms).toLocaleString("es-ES", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });

const CommentBody = ({
  comment,
  myId,
  onDelete,
}: {
  comment: Comment;
  myId: string | null;
  onDelete: (c: Comment) => void;
}) => (
  <div className="awordz-comment">
    <div className="awordz-comment__head">
      <strong>{comment.authorName}</strong>
      <span>{formatDate(comment.createdAt)}</span>
      {comment.authorId === myId && (
        <button
          type="button"
          className="awordz-comment__delete"
          title="Borrar"
          onClick={() => onDelete(comment)}
        >
          ×
        </button>
      )}
    </div>
    <div className="awordz-comment__text">{comment.text}</div>
  </div>
);

export const CommentsPanel = () => {
  const excalidrawAPI = useExcalidrawAPI();
  const comments = useAtomValue(commentsAtom);
  const [activeThread, setActiveThread] = useAtom(activeThreadAtom);
  const [draft, setDraft] = useAtom(draftPositionAtom);
  const [showResolved, setShowResolved] = useAtom(showResolvedAtom);
  const setPlacing = useSetAtom(placingCommentAtom);
  const drawingId = useAtomValue(commentsDrawingAtom);
  const myId = useAtomValue(myUserIdAtom);
  const setRefresh = useSetAtom(commentsRefreshAtom);
  const [draftText, setDraftText] = useState("");
  const [replyText, setReplyText] = useState("");
  const [busy, setBusy] = useState(false);

  const refresh = () => setRefresh((n) => n + 1);

  const run = async (action: () => Promise<unknown>) => {
    setBusy(true);
    try {
      await action();
      refresh();
    } catch {
      window.alert("No se pudo guardar el cambio. Inténtalo otra vez.");
    } finally {
      setBusy(false);
    }
  };

  const goTo = (c: Comment) => {
    if (!excalidrawAPI || c.x === null || c.y === null) {
      return;
    }
    const s = excalidrawAPI.getAppState();
    excalidrawAPI.updateScene({
      appState: {
        scrollX: s.width / 2 / s.zoom.value - c.x,
        scrollY: s.height / 2 / s.zoom.value - c.y,
      },
    });
  };

  if (drawingId === undefined) {
    return <div className="awordz-comments">Cargando…</div>;
  }

  if (drawingId === null) {
    return (
      <div className="awordz-comments">
        <p className="awordz-comments__empty">
          Los comentarios solo funcionan en dibujos guardados. Guarda este
          dibujo en «Dibujos del equipo» para comentar.
        </p>
      </div>
    );
  }

  const threads = toThreads(comments)
    .filter((t) => showResolved || !t.resolvedAt)
    .sort((a, b) => b.createdAt - a.createdAt);

  const onDelete = (c: Comment) => {
    const isThread = !c.parentId;
    if (
      window.confirm(
        isThread
          ? "¿Borrar este comentario y todas sus respuestas?"
          : "¿Borrar esta respuesta?",
      )
    ) {
      run(() => removeComment(c.id));
    }
  };

  return (
    <div className="awordz-comments">
      <div className="awordz-comments__actions">
        <button
          type="button"
          onClick={() => {
            setDraft(null);
            setPlacing(true);
          }}
        >
          + Comentar
        </button>
        <label>
          <input
            type="checkbox"
            checked={showResolved}
            onChange={(e) => setShowResolved(e.target.checked)}
          />
          Ver resueltos
        </label>
      </div>

      {draft && (
        <form
          className="awordz-comments__new"
          onSubmit={(e) => {
            e.preventDefault();
            if (!draftText.trim()) {
              return;
            }
            run(async () => {
              await postComment(drawingId, { text: draftText, ...draft });
              setDraft(null);
              setDraftText("");
            });
          }}
        >
          <textarea
            autoFocus
            placeholder="Escribe tu comentario…"
            value={draftText}
            onChange={(e) => setDraftText(e.target.value)}
          />
          <div>
            <button type="submit" disabled={busy || !draftText.trim()}>
              Publicar
            </button>
            <button
              type="button"
              className="is-secondary"
              onClick={() => {
                setDraft(null);
                setDraftText("");
              }}
            >
              Cancelar
            </button>
          </div>
        </form>
      )}

      {threads.length === 0 && !draft && (
        <p className="awordz-comments__empty">
          No hay comentarios abiertos. Pulsa «+ Comentar» y haz clic en el dibujo.
        </p>
      )}

      <ul className="awordz-comments__list">
        {threads.map((t) => (
          <li
            key={t.id}
            className={`${activeThread === t.id ? "is-active" : ""}${
              t.resolvedAt ? " is-resolved" : ""
            }`}
            onClick={() => {
              if (activeThread !== t.id) {
                setActiveThread(t.id);
                setReplyText("");
                goTo(t);
              }
            }}
          >
            <CommentBody comment={t} myId={myId} onDelete={onDelete} />
            {t.replies.map((r) => (
              <div key={r.id} className="awordz-comments__reply">
                <CommentBody comment={r} myId={myId} onDelete={onDelete} />
              </div>
            ))}
            {t.resolvedAt && (
              <p className="awordz-comments__resolved">
                Resuelto por {t.resolvedBy} · {formatDate(t.resolvedAt)}
              </p>
            )}
            {activeThread === t.id && (
              <div
                className="awordz-comments__thread-actions"
                onClick={(e) => e.stopPropagation()}
              >
                {!t.resolvedAt && (
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      if (!replyText.trim()) {
                        return;
                      }
                      run(async () => {
                        await postComment(drawingId, {
                          text: replyText,
                          parentId: t.id,
                        });
                        setReplyText("");
                      });
                    }}
                  >
                    <textarea
                      placeholder="Responder…"
                      value={replyText}
                      onChange={(e) => setReplyText(e.target.value)}
                    />
                    <button type="submit" disabled={busy || !replyText.trim()}>
                      Responder
                    </button>
                  </form>
                )}
                <button
                  type="button"
                  className="is-secondary"
                  disabled={busy}
                  onClick={() => run(() => setResolved(t.id, !t.resolvedAt))}
                >
                  {t.resolvedAt ? "Reabrir" : "Marcar como resuelto"}
                </button>
              </div>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
};
