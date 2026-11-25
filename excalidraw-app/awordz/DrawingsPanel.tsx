// Pestaña "Dibujos" de la barra lateral: la lista de dibujos guardados del equipo.
// Cada dibujo guardado es una sala de colaboración permanente: al abrirlo, todo
// el que lo tenga abierto ve los cambios de los demás en directo, y el servidor
// guarda la escena sola cada pocos segundos.

import React, { useCallback, useEffect, useState } from "react";

import { useExcalidrawAPI } from "@excalidraw/excalidraw";

import { generateCollaborationLinkData } from "../data";
import { useAtomValue } from "../app-jotai";
import { collabAPIAtom } from "../collab/Collab";

import {
  createDrawing,
  deleteDrawing,
  getCurrentRoom,
  getMe,
  listDrawings,
  openDrawing,
  renameDrawing,
  signOut,
} from "./api";

import type { Drawing } from "./api";

const formatDate = (ms: number) =>
  new Date(ms).toLocaleString("es-ES", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });

export const DrawingsPanel = () => {
  const excalidrawAPI = useExcalidrawAPI();
  const collabAPI = useAtomValue(collabAPIAtom);
  const [drawings, setDrawings] = useState<Drawing[] | null>(null);
  const [me, setMe] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const currentRoom = getCurrentRoom();

  const refresh = useCallback(() => {
    listDrawings()
      .then((list) => {
        setDrawings(list);
        setError(null);
      })
      .catch(() => setError("No se pudo cargar la lista."));
  }, []);

  useEffect(() => {
    refresh();
    const timer = window.setInterval(refresh, 30000);
    return () => window.clearInterval(timer);
  }, [refresh]);

  // El nombre de la sesión es el que ven los demás en la colaboración.
  useEffect(() => {
    getMe()
      .then(({ name }) => {
        setMe(name);
        if (collabAPI && collabAPI.getUsername() !== name) {
          collabAPI.setUsername(name);
        }
      })
      .catch(() => {});
  }, [collabAPI]);

  const currentIsSaved =
    !!currentRoom && !!drawings?.some((d) => d.id === currentRoom.roomId);

  const onNew = async () => {
    const title = window.prompt("Nombre del dibujo nuevo:", "Sin título");
    if (title === null) {
      return;
    }
    const { roomId, roomKey } = await generateCollaborationLinkData();
    await createDrawing(roomId, roomKey, title);
    openDrawing({ id: roomId, roomKey });
  };

  const onSaveCurrent = async () => {
    if (!excalidrawAPI || !collabAPI) {
      return;
    }
    const title = window.prompt(
      "Nombre para guardar este dibujo:",
      excalidrawAPI.getName() || "Sin título",
    );
    if (title === null) {
      return;
    }
    let room = getCurrentRoom();
    if (!room) {
      // Convierte la pizarra local en una sala: sube la escena al servidor.
      await collabAPI.startCollaboration(null);
      room = getCurrentRoom();
    }
    if (!room) {
      setError("No se pudo guardar el dibujo.");
      return;
    }
    await createDrawing(room.roomId, room.roomKey, title);
    refresh();
  };

  const onRename = async (drawing: Drawing) => {
    const title = window.prompt("Nuevo nombre:", drawing.title);
    if (!title) {
      return;
    }
    await renameDrawing(drawing.id, title);
    refresh();
  };

  const onDelete = async (drawing: Drawing) => {
    if (
      !window.confirm(
        `¿Borrar "${drawing.title}" para todo el equipo? No se puede deshacer.`,
      )
    ) {
      return;
    }
    await deleteDrawing(drawing.id);
    if (currentRoom?.roomId === drawing.id) {
      window.location.assign("/");
      return;
    }
    refresh();
  };

  const onLogout = async () => {
    await signOut().catch(() => {});
    window.location.assign("/");
  };

  return (
    <div className="awordz-drawings">
      <div className="awordz-drawings__actions">
        <button type="button" onClick={onNew}>
          + Dibujo nuevo
        </button>
        {!currentIsSaved && (
          <button type="button" onClick={onSaveCurrent}>
            Guardar el actual
          </button>
        )}
      </div>

      {error && <p className="awordz-drawings__error">{error}</p>}

      {drawings === null ? (
        <p className="awordz-drawings__empty">Cargando…</p>
      ) : drawings.length === 0 ? (
        <p className="awordz-drawings__empty">Aún no hay dibujos guardados.</p>
      ) : (
        <ul className="awordz-drawings__list">
          {drawings.map((d) => (
            <li
              key={d.id}
              className={
                currentRoom?.roomId === d.id ? "is-current" : undefined
              }
            >
              <button
                type="button"
                className="awordz-drawings__open"
                onClick={() => openDrawing(d)}
                title="Abrir"
              >
                <span className="awordz-drawings__title">{d.title}</span>
                <span className="awordz-drawings__meta">
                  {formatDate(d.updatedAt)} · {d.updatedBy || d.createdBy}
                </span>
              </button>
              <button
                type="button"
                className="awordz-drawings__icon"
                onClick={() => onRename(d)}
                title="Cambiar nombre"
              >
                ✎
              </button>
              <button
                type="button"
                className="awordz-drawings__icon"
                onClick={() => onDelete(d)}
                title="Borrar"
              >
                🗑
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="awordz-drawings__footer">
        {me && <span>Sesión: {me}</span>}
        <button type="button" onClick={onLogout}>
          Salir
        </button>
      </div>
    </div>
  );
};
