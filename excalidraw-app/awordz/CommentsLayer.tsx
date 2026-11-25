// Marcas de comentario sobre el lienzo, y la capa para elegir dónde comentar.
// Convierte coordenadas del lienzo a pantalla con el scroll y el zoom actuales:
//   pantalla = (lienzo + scroll) * zoom + desplazamiento del lienzo en la página

import React, { useEffect, useState } from "react";

import { useExcalidrawAPI } from "@excalidraw/excalidraw";

import { useAtom, useAtomValue, useSetAtom } from "../app-jotai";

import { getCurrentRoom, getMe, listDrawings } from "./api";
import {
  activeThreadAtom,
  commentsAtom,
  commentsDrawingAtom,
  commentsRefreshAtom,
  fetchComments,
  myUserIdAtom,
  draftPositionAtom,
  placingCommentAtom,
  showResolvedAtom,
} from "./comments";

type View = {
  scrollX: number;
  scrollY: number;
  zoom: number;
  offsetLeft: number;
  offsetTop: number;
};

export const CommentsLayer = () => {
  const excalidrawAPI = useExcalidrawAPI();
  const [comments, setComments] = useAtom(commentsAtom);
  const [drawingId, setDrawingId] = useAtom(commentsDrawingAtom);
  const setMyId = useSetAtom(myUserIdAtom);
  const refreshTick = useAtomValue(commentsRefreshAtom);
  const showResolved = useAtomValue(showResolvedAtom);
  const [activeThread, setActiveThread] = useAtom(activeThreadAtom);
  const [placing, setPlacing] = useAtom(placingCommentAtom);
  const [draft, setDraft] = useAtom(draftPositionAtom);
  const setShowResolved = useSetAtom(showResolvedAtom);
  const [view, setView] = useState<View | null>(null);

  // ¿El dibujo abierto está guardado? Solo los guardados admiten comentarios.
  useEffect(() => {
    getMe()
      .then((me: any) => setMyId(me.id))
      .catch(() => {});
    const room = getCurrentRoom();
    if (!room) {
      setDrawingId(null);
      return;
    }
    listDrawings()
      .then((list) =>
        setDrawingId(
          list.some((d) => d.id === room.roomId) ? room.roomId : null,
        ),
      )
      .catch(() => setDrawingId(null));
  }, [setDrawingId, setMyId]);

  // Carga los comentarios ahora y cada 10 segundos.
  useEffect(() => {
    if (!drawingId) {
      setComments([]);
      return;
    }
    const load = () =>
      fetchComments(drawingId)
        .then(setComments)
        .catch(() => {});
    load();
    const timer = window.setInterval(load, 10000);
    return () => window.clearInterval(timer);
  }, [drawingId, refreshTick, setComments]);

  useEffect(() => {
    if (!excalidrawAPI) {
      return;
    }
    const read = () => {
      const s = excalidrawAPI.getAppState();
      setView({
        scrollX: s.scrollX,
        scrollY: s.scrollY,
        zoom: s.zoom.value,
        offsetLeft: s.offsetLeft,
        offsetTop: s.offsetTop,
      });
    };
    read();
    const offScroll = excalidrawAPI.onScrollChange(read);
    const offChange = excalidrawAPI.onChange(read);
    window.addEventListener("resize", read);
    return () => {
      offScroll();
      offChange();
      window.removeEventListener("resize", read);
    };
  }, [excalidrawAPI]);

  useEffect(() => {
    if (!placing) {
      return;
    }
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setPlacing(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [placing, setPlacing]);

  if (!view || !excalidrawAPI) {
    return null;
  }

  const toScreen = (x: number, y: number) => ({
    left: (x + view.scrollX) * view.zoom + view.offsetLeft,
    top: (y + view.scrollY) * view.zoom + view.offsetTop,
  });

  const openThread = (id: string, resolved: boolean) => {
    if (resolved) {
      setShowResolved(true);
    }
    setActiveThread(id);
    excalidrawAPI.toggleSidebar({
      name: "default",
      tab: "comments",
      force: true,
    });
  };

  const threads = comments.filter(
    (c) => !c.parentId && c.x !== null && (showResolved || !c.resolvedAt),
  );

  return (
    <>
      {threads.map((c) => {
        const replies = comments.filter((r) => r.parentId === c.id).length;
        const pos = toScreen(c.x!, c.y!);
        return (
          <button
            key={c.id}
            type="button"
            className={`awordz-pin${activeThread === c.id ? " is-active" : ""}${
              c.resolvedAt ? " is-resolved" : ""
            }`}
            style={pos}
            title={`${c.authorName}: ${c.text}`}
            onClick={() => openThread(c.id, !!c.resolvedAt)}
          >
            {c.authorName.charAt(0).toUpperCase()}
            {replies > 0 && (
              <span className="awordz-pin__count">{replies + 1}</span>
            )}
          </button>
        );
      })}

      {draft && (
        <div className="awordz-pin is-draft" style={toScreen(draft.x, draft.y)}>
          +
        </div>
      )}

      {placing && (
        <div
          className="awordz-place-layer"
          onClick={(event) => {
            const x =
              (event.clientX - view.offsetLeft) / view.zoom - view.scrollX;
            const y =
              (event.clientY - view.offsetTop) / view.zoom - view.scrollY;
            setDraft({ x, y });
            setPlacing(false);
            setActiveThread(null);
            excalidrawAPI.toggleSidebar({
              name: "default",
              tab: "comments",
              force: true,
            });
          }}
        >
          <div className="awordz-place-layer__hint">
            Haz clic donde quieras comentar · Esc para cancelar
          </div>
        </div>
      )}
    </>
  );
};
