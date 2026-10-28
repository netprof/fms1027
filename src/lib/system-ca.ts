import tls from "node:tls";

// Behind a TLS-inspecting proxy (company network), also trust the OS
// certificate store so calls to Anthropic and LINE succeed.
// getCACertificates/setDefaultCACertificates are Node 22.19+ APIs, newer
// than the project's @types/node.
export function trustSystemCertificates() {
  const api = tls as unknown as {
    getCACertificates(type: "default" | "system"): string[];
    setDefaultCACertificates(certs: string[]): void;
  };
  api.setDefaultCACertificates([
    ...api.getCACertificates("default"),
    ...api.getCACertificates("system"),
  ]);
}
