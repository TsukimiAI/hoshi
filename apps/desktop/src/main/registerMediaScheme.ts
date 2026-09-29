import { protocol } from "electron";

protocol.registerSchemesAsPrivileged([
  {
    scheme: "hoshi-media",
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      stream: true,
      corsEnabled: true,
      bypassCSP: true
    }
  }
]);
