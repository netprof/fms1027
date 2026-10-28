// An attachment response. The Chinese filename goes in filename* (RFC 5987)
// with an ASCII fallback for older clients.
export function download(file: { filename: string; body: Buffer; type: string }) {
  return new Response(new Uint8Array(file.body), {
    headers: {
      "Content-Type": file.type,
      "Content-Disposition": `attachment; filename="report.xlsx"; filename*=UTF-8''${encodeURIComponent(file.filename)}`,
      "Cache-Control": "no-store",
    },
  });
}
