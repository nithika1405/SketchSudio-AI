
from io import BytesIO
from threading import Lock

import cv2
import numpy as np
import torch
from PIL import Image, ImageOps, UnidentifiedImageError, ImageFilter

from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response

from diffusers import (
    ControlNetModel,
    StableDiffusionControlNetPipeline,
    DPMSolverMultistepScheduler,
)

app = FastAPI(title="SketchStudio AI API", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173",
    ],
    allow_credentials=False,
    allow_methods=["GET", "POST"],
    allow_headers=["*"],
)

DEVICE = "cuda" if torch.cuda.is_available() else "cpu"
DTYPE = torch.float16 if DEVICE == "cuda" else torch.float32

# Models are downloaded from Hugging Face on first use.
BASE_MODEL_ID = "stable-diffusion-v1-5/stable-diffusion-v1-5"
CONTROLNET_ID = "lllyasviel/sd-controlnet-canny"

pipe = None
model_lock = Lock()
generation_lock = Lock()

MAX_FILE_SIZE = 10 * 1024 * 1024
IMAGE_SIZE = 512

STYLE_PROMPTS = {
    "Photorealistic": (
        "DSLR camera photo, true-to-life color palette, authentic natural colors, "
        "realistic materials, professional photography, sharp focus, natural daytime lighting"
    ),
    "Cinematic": (
        "cinematic film photograph, true-to-life color palette, natural color grading, "
        "realistic lighting, authentic film still, detailed textures"
    ),
    "Architectural": (
        "real estate photography, DSLR camera capture, true-to-life color palette, "
        "authentic building materials, bright natural daylight, accurate natural color grading, "
        "professional architectural photography"
    ),
    "Fantasy": (
        "beautiful fantasy environment, true-to-life color palette, rich natural colors, "
        "atmospheric lighting, intricate details, polished concept art"
    ),
    "Natural Landscape": (
        "authentic outdoor landscape photography taken with a DSLR camera, "
        "strictly natural existing environment colors only, true forest greens, "
        "earthy brown soil and natural rock tones, realistic natural blue sky, "
        "sunlit daylight, zero artificial colors, zero surreal tints, 100% natural organic colors"
    ),
}


def load_model():
    """Load the pretrained ControlNet pipeline once, when first needed."""
    global pipe

    if pipe is not None:
        return pipe

    with model_lock:
        if pipe is not None:
            return pipe

        controlnet = ControlNetModel.from_pretrained(
            CONTROLNET_ID,
            torch_dtype=DTYPE,
            use_safetensors=True,
        )

        candidate = StableDiffusionControlNetPipeline.from_pretrained(
            BASE_MODEL_ID,
            controlnet=controlnet,
            torch_dtype=DTYPE,
            use_safetensors=True,
        )

        candidate.scheduler = DPMSolverMultistepScheduler.from_config(
            candidate.scheduler.config,
            use_karras_sigmas=True
        )

        if DEVICE == "cuda":
            # Keeps model components offloaded until they are needed.
            candidate.enable_model_cpu_offload()
        else:
            candidate.to("cpu")

        pipe = candidate
        return pipe


def prepare_control_image(image: Image.Image) -> Image.Image:
    """
    Convert a sketch into a robust, clean Canny edge map with proper edge detection.
    Keep the aspect ratio and fit the image inside a white 512x512 canvas.
    """
    image = ImageOps.exif_transpose(image).convert("RGB")
    image = ImageOps.contain(image, (IMAGE_SIZE, IMAGE_SIZE))

    canvas = Image.new("RGB", (IMAGE_SIZE, IMAGE_SIZE), "white")
    x_offset = (IMAGE_SIZE - image.width) // 2
    y_offset = (IMAGE_SIZE - image.height) // 2
    canvas.paste(image, (x_offset, y_offset))

    rgb = np.array(canvas)
    gray = cv2.cvtColor(rgb, cv2.COLOR_RGB2GRAY)

    # Remove background noise while preserving crisp line boundaries using bilateral filtering
    filtered = cv2.bilateralFilter(gray, 9, 75, 75)

    # Automatically compute optimal Canny thresholds based on median pixel intensity
    med = np.median(filtered)
    lower = int(max(0, 0.66 * med))
    upper = int(min(255, 1.33 * med))
    if upper - lower < 40:
        lower = 50
        upper = 150

    edges = cv2.Canny(filtered, lower, upper)
    
    # Dilate slightly to ensure continuous, unbroken edge lines
    kernel = np.ones((2, 2), np.uint8)
    edges = cv2.dilate(edges, kernel, iterations=1)

    edges_rgb = np.repeat(edges[:, :, None], 3, axis=2)
    return Image.fromarray(edges_rgb)


@app.get("/")
def home():
    return {
        "message": "SketchStudio API is running",
        "device": DEVICE,
        "gpu": (
            torch.cuda.get_device_name(0)
            if torch.cuda.is_available()
            else "CPU"
        ),
        "model_loaded": pipe is not None,
        "available_styles": list(STYLE_PROMPTS.keys()),
    }


@app.get("/health")
def health():
    return {
        "status": "ok",
        "cuda_available": torch.cuda.is_available(),
        "device": DEVICE,
    }


@app.post("/generate")
async def generate_image(
    file: UploadFile = File(...),
    style: str = Form("Photorealistic"),
    prompt: str = Form(""),
    seed: int = Form(-1),
    steps: int = Form(45),
    guidance_scale: float = Form(8.5),
    controlnet_scale: float = Form(1.15),
):
    if file.content_type not in {
        "image/png",
        "image/jpeg",
        "image/webp",
    }:
        raise HTTPException(
            status_code=400,
            detail="Upload a PNG, JPG, or WEBP image.",
        )

    contents = await file.read()

    if not contents:
        raise HTTPException(
            status_code=400,
            detail="The uploaded file is empty.",
        )

    if len(contents) > MAX_FILE_SIZE:
        raise HTTPException(
            status_code=413,
            detail="Image must be smaller than 10 MB.",
        )

    try:
        with Image.open(BytesIO(contents)) as uploaded:
            uploaded.verify()

        with Image.open(BytesIO(contents)) as uploaded:
            original = ImageOps.exif_transpose(uploaded).convert("RGB")
    except (UnidentifiedImageError, OSError, ValueError):
        raise HTTPException(
            status_code=400,
            detail="The uploaded file is not a valid image.",
        )

    if original.width < 32 or original.height < 32:
        raise HTTPException(
            status_code=400,
            detail="Image dimensions must be at least 32 by 32 pixels.",
        )

    if style not in STYLE_PROMPTS:
        raise HTTPException(
            status_code=400,
            detail="Unsupported style. Select a style from the dropdown.",
        )

    description = prompt.strip()[:400]
    style_description = STYLE_PROMPTS[style]

    full_prompt = (
        f"{description + ', ' if description else ''}"
        f"{style_description}, authentic DSLR photo, true-to-life color palette, "
        "real camera capture, razor-sharp focus, crisp edge alignment, highly detailed textures, masterpiece, "
        "natural daylight, professional studio lighting"
    )

    negative_prompt = (
        "grayscale, monochrome, black and white, pencil drawing, sketch, "
        "line art, blurry, low quality, washed out, distorted geometry, "
        "malformed objects, duplicate objects, text, watermark, "
        "oversaturated, artificial colors, cartoon, 3D render, CGI, plastic, painting, illustration"
    )

    try:
        control_image = prepare_control_image(original)
    except Exception as exc:
        raise HTTPException(
            status_code=400,
            detail=f"Sketch preprocessing failed: {exc}",
        ) from exc

    try:
        with generation_lock:
            model = load_model()

            if seed >= 0:
                actual_seed = seed
            else:
                actual_seed = int(
                    torch.randint(0, 2**31 - 1, (1,)).item()
                )

            generator_device = DEVICE
            generator = torch.Generator(
                device=generator_device
            ).manual_seed(actual_seed)

            # Clamp parameters safely
            num_steps = max(10, min(50, int(steps)))
            cfg_scale = max(1.0, min(20.0, float(guidance_scale)))
            cn_scale = max(0.1, min(2.0, float(controlnet_scale)))

            with torch.inference_mode():
                generated = model(
                    prompt=full_prompt,
                    negative_prompt=negative_prompt,
                    image=control_image,
                    num_inference_steps=num_steps,
                    guidance_scale=cfg_scale,
                    controlnet_conditioning_scale=cn_scale,
                    height=IMAGE_SIZE,
                    width=IMAGE_SIZE,
                    generator=generator,
                ).images[0]

            # Apply advanced Unsharp Mask and bilateral smoothing for absolute crystal clarity, zero smudge, and zero noise
            generated = generated.filter(
                ImageFilter.UnsharpMask(radius=1.5, percent=180, threshold=1)
            )
            # Convert to numpy and apply bilateral filter to remove high-frequency generation noise without blurring edges
            gen_np = np.array(generated)
            gen_np = cv2.bilateralFilter(gen_np, 5, 50, 50)
            generated = Image.fromarray(gen_np)

            output = BytesIO()
            generated.save(output, format="PNG")
            image_bytes = output.getvalue()

            if DEVICE == "cuda":
                torch.cuda.empty_cache()

        return Response(
            content=image_bytes,
            media_type="image/png",
            headers={
                "Content-Disposition": (
                    'inline; filename="sketchstudio-result.png"'
                ),
                "Cache-Control": "no-store",
            },
        )

    except torch.cuda.OutOfMemoryError as exc:
        if DEVICE == "cuda":
            torch.cuda.empty_cache()

        raise HTTPException(
            status_code=503,
            detail=(
                "GPU memory is insufficient for this generation. "
                "Close GPU-intensive applications and try again."
            ),
        ) from exc

    except Exception as exc:
        raise HTTPException(
            status_code=500,
            detail=(
                f"Generation failed: {type(exc).__name__}: {exc}"
            ),
        ) from exc
