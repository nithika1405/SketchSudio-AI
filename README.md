# SketchStudio AI

SketchStudio AI is a full-stack application that transforms hand-drawn sketches into polished, photorealistic or stylized images using **Stable Diffusion** with **ControlNet (Canny)**.

It consists of two main components:
- **Backend**: A FastAPI server (`backend/main.py`) powered by PyTorch, Diffusers, and OpenCV.
- **Frontend**: A modern React application (`frontend/`) built with Vite and Lucide icons.

---

## Project Structure

```text
sketch-to-image-2/
├── backend/
│   ├── .venv/            # Python virtual environment
│   └── main.py           # FastAPI application & ML pipeline
└── frontend/
    ├── src/              # React source code
    ├── public/           # Static assets
    ├── package.json      # Frontend dependencies & scripts
    └── vite.config.js    # Vite configuration
```

---

## Getting Started

### Prerequisites

- **Python** 3.10+
- **Node.js** 18+ and npm
- **CUDA-compatible GPU** (Recommended: PyTorch with CUDA support for fast image generation)

---

### 1. Backend Setup

1. Navigate to the backend directory:
   ```bash
   cd backend
   ```
2. Create and activate a Python virtual environment:
   ```bash
   python -m venv .venv
   # On Windows:
   .venv\Scripts\activate
   # On Unix/macOS:
   source .venv/bin/activate
   ```
3. Install dependencies:
   ```bash
   pip install fastapi uvicorn torch torchvision diffusers transformers accelerate opencv-python pillow
   ```
4. Run the FastAPI server:
   ```bash
   uvicorn main:app --reload --host 127.0.0.1 --port 8000
   ```

---

### 2. Frontend Setup

1. Navigate to the frontend directory:
   ```bash
   cd frontend
   ```
2. Install dependencies:
   ```bash
   npm install
   ```
3. Run the development server:
   ```bash
   npm run dev
   ```
4. Open your browser and navigate to `http://localhost:5173`.

---

## Features

- **Interactive Canvas / Upload**: Draw sketches directly or upload existing sketch images.
- **Style Presets**: Choose from multiple styles like Photorealistic, Cyberpunk, Watercolor, Anime, and Minimalist.
- **Adjustable Parameters**: Fine-tune prompt weights, guidance scale, and step counts.
- **ControlNet Canny Integration**: Preserves sketch outlines precisely during AI generation.
