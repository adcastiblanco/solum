import { ImageResponse } from "next/og";

export const ogSize = { width: 1200, height: 630 } as const;
export const ogAlt = "Solum Health — Document AI";
export const ogContentType = "image/png";

export function renderOpenGraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: 80,
          background:
            "linear-gradient(135deg, #1E3A5F 0%, #2D5380 60%, #1E3A5F 100%)",
          color: "#ffffff",
          fontFamily: "Georgia, 'Times New Roman', serif",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 24,
            fontSize: 36,
            letterSpacing: 1,
            color: "#EAF0F7",
          }}
        >
          <div
            style={{
              width: 72,
              height: 72,
              borderRadius: 18,
              background: "#ffffff",
              color: "#1E3A5F",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontStyle: "italic",
              fontSize: 52,
            }}
          >
            S
          </div>
          <span style={{ fontStyle: "italic" }}>Solum Health</span>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
          <div
            style={{
              fontSize: 92,
              fontStyle: "italic",
              lineHeight: 1.05,
              maxWidth: 1000,
            }}
          >
            Document AI for clinical workflows
          </div>
          <div
            style={{
              fontSize: 34,
              color: "#EAF0F7",
              fontFamily: "system-ui, sans-serif",
              maxWidth: 1000,
            }}
          >
            Extract, ground, and review clinical documents with bounding-box
            traceability.
          </div>
        </div>
      </div>
    ),
    { ...ogSize },
  );
}

export const appleIconSize = { width: 180, height: 180 } as const;
export const appleIconContentType = "image/png";

export function renderAppleIcon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#1E3A5F",
          color: "#fff",
          fontFamily: "Georgia, 'Times New Roman', serif",
          fontStyle: "italic",
          fontSize: 130,
          borderRadius: 40,
        }}
      >
        S
      </div>
    ),
    { ...appleIconSize },
  );
}
