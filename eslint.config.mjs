// Flat config (ESLint v9 + Next 16). Next 16 ya provee el preset en formato
// flat, así que lo importamos directo (reemplaza el viejo .eslintrc.json con
// extends: ["next/core-web-vitals"]). No hace falta FlatCompat.
import nextCoreWebVitals from "eslint-config-next/core-web-vitals";

const eslintConfig = [
  {
    // Assets vendoreados del design handoff (bundles de terceros), no código
    // fuente del proyecto: no se lintean.
    ignores: ["docs/**"],
  },
  ...nextCoreWebVitals,
];

export default eslintConfig;
