import { ImageResponse } from "next/og";

export const alt = "The Complete New Homeowner System";

export const size = {
  width: 1200,
  height: 630,
};

export const contentType = "image/png";

export default function OpenGraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          alignItems: "center",
          background: "#f4ebdd",
          color: "#292a29",
          display: "flex",
          flexDirection: "column",
          height: "100%",
          justifyContent: "center",
          padding: "80px",
          width: "100%",
        }}
      >
        <div style={{ color: "#66705b", fontSize: 34, fontWeight: 600 }}>
          The Complete New Homeowner System
        </div>
        <div
          style={{
            fontFamily: "serif",
            fontSize: 72,
            fontWeight: 600,
            marginTop: 32,
            textAlign: "center",
          }}
        >
          Your home did not come with an owner’s manual. This is it.
        </div>
      </div>
    ),
    size,
  );
}
