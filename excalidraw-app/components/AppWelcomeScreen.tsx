import { useI18n } from "@excalidraw/excalidraw/i18n";
import { WelcomeScreen } from "@excalidraw/excalidraw/index";
import React from "react";

// Logo propio de Awordz Draw (sustituye al de Excalidraw).
const AwordzLogo = () => (
  <div style={{ display: "flex", alignItems: "center", gap: "0.9rem" }}>
    <img
      src="/android-chrome-192x192.png"
      alt=""
      width={72}
      height={72}
      style={{ display: "block" }}
    />
    <span
      className="awordz-logo-text"
      style={{ fontSize: "3rem", lineHeight: 1 }}
    >
      Awordz Draw
    </span>
  </div>
);

export const AppWelcomeScreen: React.FC<{
  onCollabDialogOpen: () => any;
  isCollabEnabled: boolean;
}> = React.memo((props) => {
  const { t } = useI18n();

  return (
    <WelcomeScreen>
      <WelcomeScreen.Hints.MenuHint>
        {t("welcomeScreen.app.menuHint")}
      </WelcomeScreen.Hints.MenuHint>
      <WelcomeScreen.Hints.ToolbarHint />
      <WelcomeScreen.Hints.HelpHint />
      <WelcomeScreen.Center>
        <WelcomeScreen.Center.Logo>
          <AwordzLogo />
        </WelcomeScreen.Center.Logo>
        <WelcomeScreen.Center.Heading>
          Los dibujos del equipo están en el menú → «Dibujos del equipo».
          <br />
          Lo que dibujes fuera de un dibujo guardado se queda solo en este
          navegador.
        </WelcomeScreen.Center.Heading>
        <WelcomeScreen.Center.Menu>
          <WelcomeScreen.Center.MenuItemLoadScene />
          <WelcomeScreen.Center.MenuItemHelp />
          {props.isCollabEnabled && (
            <WelcomeScreen.Center.MenuItemLiveCollaborationTrigger
              onSelect={() => props.onCollabDialogOpen()}
            />
          )}
        </WelcomeScreen.Center.Menu>
      </WelcomeScreen.Center>
    </WelcomeScreen>
  );
});
