/** Version and build metadata injected at build time (see vite.config.ts). */
export const BUILD =
  typeof __HEIRMAP_BUILD__ !== 'undefined'
    ? __HEIRMAP_BUILD__
    : { version: '0.0.0', buildNumber: 'dev', commit: 'local', date: '' };

/** SemVer with build metadata, e.g. `1.0.0+42.abc1234`. */
export const FULL_VERSION = `${BUILD.version}+${BUILD.buildNumber}.${BUILD.commit}`;
