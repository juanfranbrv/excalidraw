import { DefaultSidebar, Sidebar } from "@excalidraw/excalidraw";
import {
  LoadIcon,
  messageCircleIcon,
} from "@excalidraw/excalidraw/components/icons";
import { useUIAppState } from "@excalidraw/excalidraw/context/ui-appState";

import { CommentsPanel } from "../awordz/CommentsPanel";
import { DrawingsPanel } from "../awordz/DrawingsPanel";

// Barra lateral: biblioteca y búsqueda (de Excalidraw) y la pestaña "Dibujos" del equipo.
export const AppSidebar = () => {
  const { openSidebar } = useUIAppState();

  return (
    <DefaultSidebar>
      <DefaultSidebar.TabTriggers>
        <Sidebar.TabTrigger
          tab="drawings"
          title="Dibujos del equipo"
          style={{ opacity: openSidebar?.tab === "drawings" ? 1 : 0.4 }}
        >
          {LoadIcon}
        </Sidebar.TabTrigger>
        <Sidebar.TabTrigger
          tab="comments"
          title="Comentarios"
          style={{ opacity: openSidebar?.tab === "comments" ? 1 : 0.4 }}
        >
          {messageCircleIcon}
        </Sidebar.TabTrigger>
      </DefaultSidebar.TabTriggers>
      <Sidebar.Tab tab="drawings">
        <DrawingsPanel />
      </Sidebar.Tab>
      <Sidebar.Tab tab="comments">
        <CommentsPanel />
      </Sidebar.Tab>
    </DefaultSidebar>
  );
};
