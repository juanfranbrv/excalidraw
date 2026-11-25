import { DefaultSidebar, Sidebar } from "@excalidraw/excalidraw";
import { LoadIcon } from "@excalidraw/excalidraw/components/icons";
import { useUIAppState } from "@excalidraw/excalidraw/context/ui-appState";

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
      </DefaultSidebar.TabTriggers>
      <Sidebar.Tab tab="drawings">
        <DrawingsPanel />
      </Sidebar.Tab>
    </DefaultSidebar>
  );
};
