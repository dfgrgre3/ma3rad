interface ImportMetaEnv {
  readonly DEV: boolean;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

declare const __BYPASS_FIRST_RUN_ACTIVATION__: boolean | undefined;
declare const __CERAMISYS_LEGACY_BUILD__: boolean;
