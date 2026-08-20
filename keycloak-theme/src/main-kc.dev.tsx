import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { KcPage } from "./kc.gen";
import { getKcContextMock } from "./login/mocks/getKcContextMock";

const kcContext = getKcContextMock({
  pageId: "login.ftl",
  overrides: {
    locale: {
      currentLanguageTag: "pl",
      supported: []
    },
    realm: {
      displayName: "BeZoom",
      displayNameHtml: "<strong>bezoom</strong>"
    },
    client: {
      baseUrl: "http://localhost:3000"
    }
  }
});

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <KcPage kcContext={kcContext} />
  </StrictMode>
);
