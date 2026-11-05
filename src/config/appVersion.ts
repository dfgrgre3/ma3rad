declare const __APP_VERSION__: string | undefined;

export const APP_VERSION = typeof __APP_VERSION__ === 'string'
  ? __APP_VERSION__
  : process.env.npm_package_version || '1.1.4';
