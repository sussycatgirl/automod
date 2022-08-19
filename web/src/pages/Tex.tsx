import { FunctionComponent, useMemo } from "react";
import katex from "katex";
import { useLocation } from "react-router-dom";
import "katex/dist/katex.min.css";

const TexPage: FunctionComponent = () => {
    const tex = new URLSearchParams(useLocation().search).get("tex");
    const html = useMemo(() => katex.renderToString(tex ?? ""), [tex]);

    return tex ? (
        <div
            style={{
                display: "flex",
                justifyContent: "center",
                flexDirection: "row",
                marginTop: "32px",
                fontSize: "24px",
            }}
        >
            <div
                style={{ color: "var(--foreground)" }}
                dangerouslySetInnerHTML={{ __html: html }}
            />
        </div>
    ) : (
        <h3 style={{ color: "var(--foreground)" }}>No input TeX provided</h3>
    );
};

export default TexPage;
