/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_UJO_HUB_URL?: string;
  readonly VITE_UJO_GATEWAY?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
