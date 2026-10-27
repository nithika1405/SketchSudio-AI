
import { useEffect, useRef, useState } from "react";
import {
  Upload,
  Image as ImageIcon,
  Sparkles,
  Download,
  RefreshCw,
  WandSparkles,
  Palette,
  ArrowRight,
  CheckCircle2,
  X,
} from "lucide-react";
import "./index.css";

const API_URL = "http://127.0.0.1:8000";

const STYLES = [
  "Photorealistic",
  "Cinematic",
  "Architectural",
  "Fantasy",
  "Natural Landscape",
];

export default function App() {
  const fileInput = useRef(null);

  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState("");
  const [style, setStyle] = useState("Photorealistic");
  const [description, setDescription] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState("");
  const [error, setError] = useState("");
  const [backendStatus, setBackendStatus] = useState("checking");

  useEffect(() => {
    let active = true;

    async function checkBackend() {
      try {
        const response = await fetch(`${API_URL}/health`);
        if (!response.ok) throw new Error("Backend unavailable");

        if (active) setBackendStatus("online");
      } catch {
        if (active) setBackendStatus("offline");
      }
    }

    checkBackend();

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    return () => {
      if (preview) URL.revokeObjectURL(preview);
    };
  }, [preview]);

  useEffect(() => {
    return () => {
      if (result) URL.revokeObjectURL(result);
    };
  }, [result]);

  function handleFile(selected) {
    if (!selected) return;

    const allowedTypes = [
      "image/png",
      "image/jpeg",
      "image/webp",
    ];

    if (!allowedTypes.includes(selected.type)) {
      setError("Please upload a PNG, JPG, or WEBP image.");
      return;
    }

    if (selected.size > 10 * 1024 * 1024) {
      setError("Your image must be smaller than 10 MB.");
      return;
    }

    const newPreview = URL.createObjectURL(selected);

    setFile(selected);
    setPreview(newPreview);
    setResult("");
    setError("");
  }

  async function generateImage() {
    if (!file) {
      setError("Upload a sketch before generating an image.");
      return;
    }

    setLoading(true);
    setError("");

    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("style", style);
      formData.append("prompt", description);

      const response = await fetch(`${API_URL}/generate`, {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        let message = "Image generation failed.";

        try {
          const data = await response.json();
          if (data.detail) message = data.detail;
        } catch {
          // Keep the fallback error message.
        }

        throw new Error(message);
      }

      const blob = await response.blob();

      if (!blob.type.startsWith("image/")) {
        throw new Error("The backend did not return an image.");
      }

      const newResult = URL.createObjectURL(blob);
      setResult(newResult);
    } catch (err) {
      setError(
        err.message === "Failed to fetch"
          ? "Cannot connect to the AI backend. Make sure FastAPI is running on port 8000."
          : err.message
      );
    } finally {
      setLoading(false);
    }
  }

  function downloadResult() {
    if (!result) return;

    const link = document.createElement("a");
    link.href = result;
    link.download = "sketchstudio-result.png";
    document.body.appendChild(link);
    link.click();
    link.remove();
  }

  function resetProject() {
    setFile(null);
    setPreview("");
    setResult("");
    setDescription("");
    setError("");

    if (fileInput.current) {
      fileInput.current.value = "";
    }
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <a className="brand" href="#">
          <div className="brand-icon">
            <WandSparkles size={22} />
          </div>
          <span>
            Sketch<span className="brand-accent">Studio</span>
          </span>
        </a>

        <div className="side-label">WORKSPACE</div>

        <div className="nav-item active">
          <ImageIcon size={18} />
          Image Generator
        </div>

        <div className="side-note">
          <Sparkles size={18} />
          <p>
            Turn simple sketches into inspiring visual creations
            with AI-guided image generation.
          </p>
        </div>

        <div className="sidebar-bottom">
          <span
            className={`status-dot ${
              backendStatus === "offline" ? "offline-dot" : ""
            }`}
          />
          {backendStatus === "online"
            ? "Backend connected"
            : backendStatus === "offline"
              ? "Backend offline"
              : "Checking backend"}
          <span className="local-tag">LOCAL</span>
        </div>
      </aside>

      <main className="main-content">
        <header className="topbar">
          <div>
            <div className="eyebrow">
              CREATIVE WORKSPACE / GENERATOR
            </div>
            <h1>
              Sketch to reality<span className="heading-dot">.</span>
            </h1>
          </div>

          <div className="top-pill">
            <span
              className={`status-dot ${
                backendStatus === "offline" ? "offline-dot" : ""
              }`}
            />
            {backendStatus === "online"
              ? "AI Studio connected"
              : backendStatus === "offline"
                ? "API disconnected"
                : "Connecting..."}
          </div>
        </header>

        <section className="intro">
          <div>
            <h2>Your imagination, brought to life.</h2>
            <p>
              Upload a pencil sketch and transform your ideas
              into colorful, realistic imagery.
            </p>
          </div>
          <div className="intro-art">
            <Sparkles size={28} />
          </div>
        </section>

        <section className="workspace">
          <div className="panel upload-panel">
            <div className="panel-heading">
              <div className="step-number">01</div>
              <div>
                <h3>Upload your sketch</h3>
                <p>Start with a drawing or pencil sketch.</p>
              </div>
            </div>

            {!file && (
              <div className="sample-banner">
                <button
                  type="button"
                  className="sample-btn"
                  onClick={async () => {
                    try {
                      const res = await fetch("/samples/architectural-sketch.png");
                      const blob = await res.blob();
                      const sampleFile = new File([blob], "architectural-sketch.png", { type: "image/png" });
                      setStyle("Architectural");
                      setDescription("A modern villa, white walls, warm sunlight, green garden");
                      handleFile(sampleFile);
                    } catch (e) {
                      setError("Could not load sample sketch.");
                    }
                  }}
                >
                  <Sparkles size={14} /> Try architectural sketch preset
                </button>
              </div>
            )}

            <div
              className={`dropzone ${preview ? "has-image" : ""}`}
              onDragOver={(event) => event.preventDefault()}
              onDrop={(event) => {
                event.preventDefault();
                handleFile(event.dataTransfer.files[0]);
              }}
              onClick={() => fileInput.current?.click()}
              role="button"
              tabIndex={0}
              onKeyDown={(event) => {
                if (
                  event.key === "Enter" ||
                  event.key === " "
                ) {
                  event.preventDefault();
                  fileInput.current?.click();
                }
              }}
            >
              {preview ? (
                <img
                  className="sketch-preview"
                  src={preview}
                  alt="Uploaded pencil sketch"
                />
              ) : (
                <>
                  <div className="upload-icon">
                    <Upload size={25} />
                  </div>
                  <h4>Drop your sketch here</h4>
                  <p>
                    or <span className="browse-text">browse files</span>
                  </p>
                  <span className="file-hint">
                    PNG, JPG, WEBP · Max 10 MB
                  </span>
                </>
              )}

              <input
                ref={fileInput}
                type="file"
                accept="image/png,image/jpeg,image/webp"
                hidden
                onChange={(event) =>
                  handleFile(event.target.files[0])
                }
              />
            </div>

            {file && (
              <div className="file-info">
                <div className="file-icon">
                  <ImageIcon size={18} />
                </div>

                <div className="file-details">
                  <strong>{file.name}</strong>
                  <span>
                    {(file.size / 1024).toFixed(0)} KB · Uploaded
                  </span>
                </div>

                <CheckCircle2 className="file-check" size={19} />

                <button
                  className="icon-button"
                  type="button"
                  aria-label="Remove uploaded sketch"
                  onClick={(event) => {
                    event.stopPropagation();
                    resetProject();
                  }}
                >
                  <X size={16} />
                </button>
              </div>
            )}

            <div className="settings-heading">
              <Palette size={17} />
              Generation settings
            </div>

            <label className="field-label" htmlFor="description">
              Describe your desired image
            </label>

            <textarea
              id="description"
              className="description-input"
              value={description}
              onChange={(event) =>
                setDescription(event.target.value)
              }
              maxLength={400}
              placeholder="e.g. A modern villa, white walls, warm sunlight, green garden..."
              rows={3}
            />

            <label className="field-label" htmlFor="style">
              Visual style
            </label>

            <select
              id="style"
              value={style}
              onChange={(event) => setStyle(event.target.value)}
            >
              {STYLES.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>

            <button
              className="generate-button"
              onClick={generateImage}
              disabled={loading || !file}
            >
              {loading ? (
                <>
                  <RefreshCw className="spin" size={18} />
                  Generating image...
                </>
              ) : (
                <>
                  <Sparkles size={18} />
                  Generate image
                  <ArrowRight size={18} />
                </>
              )}
            </button>

            <p className="privacy-note">
              Images are processed by your local backend.
            </p>

            {error && (
              <div className="error-message" role="alert">
                {error}
              </div>
            )}
          </div>

          <div className="panel result-panel">
            <div className="panel-heading result-heading">
              <div className="step-number">02</div>
              <div>
                <h3>Your creation</h3>
                <p>
                  {result
                    ? "Your generated image is ready."
                    : "Your generated image will appear here."}
                </p>
              </div>

              {result && (
                <button
                  className="download-button"
                  onClick={downloadResult}
                >
                  <Download size={16} />
                  Download
                </button>
              )}
            </div>

            <div
              className={`result-canvas ${
                result ? "result-ready" : ""
              }`}
            >
              {result ? (
                <img
                  className="result-image"
                  src={result}
                  alt="AI-generated image based on the sketch"
                />
              ) : (
                <div className="empty-result">
                  <div className="result-center">
                    <WandSparkles size={34} />
                  </div>
                  <h3>Something amazing starts here</h3>
                  <p>
                    Your transformed image will appear in this space.
                  </p>

                  <div className="empty-chips">
                    <span>
                      <Palette size={13} /> Full color
                    </span>
                    <span>
                      <Sparkles size={13} /> AI enhanced
                    </span>
                  </div>
                </div>
              )}
            </div>

            <div className="result-footer">
              <span>
                <span
                  className={`status-dot ${
                    loading ? "loading-dot" : ""
                  }`}
                />
                {loading
                  ? "Generating your image"
                  : result
                    ? "Generation complete"
                    : "Awaiting generation"}
              </span>
              <span>SketchStudio AI</span>
            </div>

            {loading && (
              <p className="generation-hint">
                The first request downloads and loads the AI model.
                It may take several minutes.
              </p>
            )}
          </div>
        </section>

        <footer className="page-footer">
          <span>SKETCHSTUDIO © 2026</span>
          <span>Designed for creative possibilities.</span>
        </footer>
      </main>
    </div>
  );
}
