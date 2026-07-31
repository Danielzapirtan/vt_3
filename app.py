import os
import re
import sys
import uuid
import shutil
import platform
import subprocess
from pathlib import Path
from importlib.util import find_spec

from flask import Flask, request, jsonify, send_from_directory, send_file, abort
from werkzeug.utils import secure_filename

APP_ROOT = Path(__file__).resolve().parent
MEDIA_DIR = APP_ROOT / "data" / "media"
CLIP_DIR = APP_ROOT / "data" / "clips"
MEDIA_DIR.mkdir(parents=True, exist_ok=True)
CLIP_DIR.mkdir(parents=True, exist_ok=True)

ALLOWED_UPLOAD_EXT = {".mp4", ".mov", ".mkv", ".webm", ".m4v", ".avi"}
YOUTUBE_URL_RE = re.compile(
    r"^https?://(www\.|m\.)?(youtube\.com/(watch\?v=|shorts/|embed/)|youtu\.be/)[\w\-]+"
)
FASTER_WHISPER_SIZES = ["tiny", "base", "small", "medium", "large-v3"]
MLX_SIZES = ["tiny", "base", "small", "medium", "large-v3"]
LANGUAGES = {"ro": "Romanian", "en": "English", "fr": "French", "de": "German"}

app = Flask(__name__)
app.config["MAX_CONTENT_LENGTH"] = 2 * 1024 * 1024 * 1024  # 2 GB upload cap

# in-memory registries (fine for a single-process dev/personal-use app)
MEDIA_REGISTRY = {}       # id -> {"path": Path, "duration": float}
TRANSCRIPT_REGISTRY = {}  # id -> {"text": str, "segments": list}

_model_cache = {}


def is_apple_silicon() -> bool:
    return sys.platform == "darwin" and platform.machine() in ("arm64", "arm")


def mlx_available() -> bool:
    return is_apple_silicon() and find_spec("mlx_whisper") is not None


def ffmpeg_bin() -> str:
    path = shutil.which("ffmpeg")
    if not path:
        raise RuntimeError("ffmpeg is not installed or not on PATH.")
    return path


def ffprobe_duration(path: Path) -> float:
    probe = shutil.which("ffprobe")
    if not probe:
        raise RuntimeError("ffprobe is not installed or not on PATH.")
    out = subprocess.run(
        [probe, "-v", "error", "-show_entries", "format=duration",
         "-of", "default=noprint_wrappers=1:nokey=1", str(path)],
        capture_output=True, text=True, check=True,
    )
    return float(out.stdout.strip())


def ms_to_ts(ms: int) -> str:
    ms = max(0, int(ms))
    total_s, millis = divmod(ms, 1000)
    h, rem = divmod(total_s, 3600)
    m, s = divmod(rem, 60)
    return f"{h:02d}:{m:02d}:{s:02d}.{millis:03d}"


def ms_to_srt_ts(ms: int) -> str:
    return ms_to_ts(ms).replace(".", ",")


def new_id() -> str:
    return uuid.uuid4().hex


@app.route("/")
def index():
    return send_from_directory(APP_ROOT / "templates", "index.html")


@app.route("/static/<path:filename>")
def static_files(filename):
    return send_from_directory(APP_ROOT / "static", filename)


@app.route("/api/engines")
def api_engines():
    return jsonify({
        "faster_whisper": {"available": True, "sizes": FASTER_WHISPER_SIZES},
        "whisper_mlx": {
            "available": mlx_available(),
            "sizes": MLX_SIZES if mlx_available() else [],
            "reason": None if mlx_available() else
                "Whisper MLX requires an Apple Silicon Mac (macOS, arm64).",
        },
        "languages": LANGUAGES,
    })


@app.route("/api/upload", methods=["POST"])
def api_upload():
    if "file" not in request.files:
        return jsonify({"error": "No file provided."}), 400
    f = request.files["file"]
    if not f.filename:
        return jsonify({"error": "Empty filename."}), 400

    ext = Path(secure_filename(f.filename)).suffix.lower()
    if ext not in ALLOWED_UPLOAD_EXT:
        return jsonify({"error": f"Unsupported file type: {ext}"}), 400

    media_id = new_id()
    dest = MEDIA_DIR / f"{media_id}{ext}"
    f.save(dest)

    try:
        duration = ffprobe_duration(dest)
    except Exception as e:
        dest.unlink(missing_ok=True)
        return jsonify({"error": f"Could not read video: {e}"}), 400

    MEDIA_REGISTRY[media_id] = {"path": dest, "duration": duration}
    return jsonify({"id": media_id, "duration": duration, "url": f"/media/{media_id}"})


@app.route("/api/youtube", methods=["POST"])
def api_youtube():
    data = request.get_json(silent=True) or {}
    url = (data.get("url") or "").strip()
    use_cookies = bool(data.get("use_chrome_cookies"))

    if not YOUTUBE_URL_RE.match(url):
        return jsonify({"error": "Only youtube.com / youtu.be URLs are accepted."}), 400

    try:
        import yt_dlp
    except ImportError:
        return jsonify({"error": "yt-dlp is not installed."}), 500

    media_id = new_id()
    out_template = str(MEDIA_DIR / f"{media_id}.%(ext)s")

    ydl_opts = {
        "outtmpl": out_template,
        "format": "bv*[ext=mp4]+ba[ext=m4a]/b[ext=mp4]/best",
        "merge_output_format": "mp4",
        "noplaylist": True,
        "quiet": True,
        "no_warnings": True,
        "max_filesize": 2 * 1024 * 1024 * 1024,
    }
    if use_cookies:
        # Reads cookies from the local Chrome install on this machine only.
        ydl_opts["cookiesfrombrowser"] = ("chrome",)

    try:
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            ydl.download([url])
    except Exception as e:
        return jsonify({"error": f"Download failed: {e}"}), 400

    dest = MEDIA_DIR / f"{media_id}.mp4"
    if not dest.exists():
        candidates = list(MEDIA_DIR.glob(f"{media_id}.*"))
        if not candidates:
            return jsonify({"error": "Download produced no file."}), 500
        dest = candidates[0]

    try:
        duration = ffprobe_duration(dest)
    except Exception as e:
        dest.unlink(missing_ok=True)
        return jsonify({"error": f"Could not read downloaded video: {e}"}), 400

    MEDIA_REGISTRY[media_id] = {"path": dest, "duration": duration}
    return jsonify({"id": media_id, "duration": duration, "url": f"/media/{media_id}"})


@app.route("/media/<media_id>")
def serve_media(media_id):
    entry = MEDIA_REGISTRY.get(media_id)
    if not entry:
        abort(404)
    path: Path = entry["path"]
    return send_file(path, conditional=True)


def extract_audio_clip(source: Path, start_ms: int, end_ms: int, out_path: Path):
    cmd = [
        ffmpeg_bin(), "-y",
        "-ss", ms_to_ts(start_ms),
        "-to", ms_to_ts(end_ms),
        "-i", str(source),
        "-vn", "-acodec", "pcm_s16le", "-ar", "16000", "-ac", "1",
        str(out_path),
    ]
    subprocess.run(cmd, capture_output=True, check=True)


def get_faster_whisper_model(size: str):
    key = ("faster_whisper", size)
    if key not in _model_cache:
        from faster_whisper import WhisperModel
        _model_cache[key] = WhisperModel(size, device="auto", compute_type="auto")
    return _model_cache[key]


def transcribe_faster_whisper(audio_path: Path, language: str, size: str):
    model = get_faster_whisper_model(size)
    segments, _info = model.transcribe(str(audio_path), language=language, vad_filter=True)
    result_segments = []
    text_parts = []
    for seg in segments:
        result_segments.append({
            "start_ms": int(seg.start * 1000),
            "end_ms": int(seg.end * 1000),
            "text": seg.text.strip(),
        })
        text_parts.append(seg.text.strip())
    return " ".join(text_parts).strip(), result_segments


MLX_REPO_TEMPLATE = "mlx-community/whisper-{size}-mlx"


def transcribe_mlx(audio_path: Path, language: str, size: str):
    import mlx_whisper
    repo = MLX_REPO_TEMPLATE.format(size=size)
    result = mlx_whisper.transcribe(
        str(audio_path), path_or_hf_repo=repo, language=language
    )
    result_segments = [
        {
            "start_ms": int(seg["start"] * 1000),
            "end_ms": int(seg["end"] * 1000),
            "text": seg["text"].strip(),
        }
        for seg in result.get("segments", [])
    ]
    return result.get("text", "").strip(), result_segments


@app.route("/api/transcribe", methods=["POST"])
def api_transcribe():
    data = request.get_json(silent=True) or {}
    media_id = data.get("id")
    engine = data.get("engine")
    language = data.get("language")
    size = data.get("model_size")
    start_ms = data.get("start_ms")
    end_ms = data.get("end_ms")

    entry = MEDIA_REGISTRY.get(media_id)
    if not entry:
        return jsonify({"error": "Unknown media id."}), 404

    if language not in LANGUAGES:
        return jsonify({"error": "Unsupported language."}), 400
    if engine not in ("faster_whisper", "whisper_mlx"):
        return jsonify({"error": "Unsupported engine."}), 400
    if engine == "faster_whisper" and size not in FASTER_WHISPER_SIZES:
        return jsonify({"error": "Unsupported model size."}), 400
    if engine == "whisper_mlx":
        if not mlx_available():
            return jsonify({"error": "Whisper MLX is not available on this machine (Apple Silicon only)."}), 400
        if size not in MLX_SIZES:
            return jsonify({"error": "Unsupported model size."}), 400

    try:
        start_ms = int(start_ms)
        end_ms = int(end_ms)
    except (TypeError, ValueError):
        return jsonify({"error": "Invalid start/end."}), 400

    duration_ms = int(entry["duration"] * 1000)
    start_ms = max(0, min(start_ms, duration_ms))
    end_ms = max(0, min(end_ms, duration_ms))
    if end_ms <= start_ms:
        return jsonify({"error": "End time must be after start time."}), 400

    clip_id = new_id()
    audio_path = CLIP_DIR / f"{clip_id}.wav"
    try:
        extract_audio_clip(entry["path"], start_ms, end_ms, audio_path)
    except subprocess.CalledProcessError as e:
        return jsonify({"error": f"ffmpeg failed: {e.stderr.decode(errors='ignore')[:500]}"}), 500
    except Exception as e:
        return jsonify({"error": str(e)}), 500

    try:
        if engine == "faster_whisper":
            text, segments = transcribe_faster_whisper(audio_path, language, size)
        else:
            text, segments = transcribe_mlx(audio_path, language, size)
    except Exception as e:
        return jsonify({"error": f"Transcription failed: {e}"}), 500
    finally:
        audio_path.unlink(missing_ok=True)

    transcript_id = new_id()
    TRANSCRIPT_REGISTRY[transcript_id] = {
        "text": text,
        "segments": segments,
        "offset_ms": start_ms,
    }

    return jsonify({
        "transcript_id": transcript_id,
        "text": text,
        "segments": segments,
    })


@app.route("/api/download/<transcript_id>")
def api_download(transcript_id):
    fmt = request.args.get("format", "txt")
    entry = TRANSCRIPT_REGISTRY.get(transcript_id)
    if not entry:
        abort(404)

    if fmt == "txt":
        content = entry["text"]
        mimetype = "text/plain"
        filename = f"transcript_{transcript_id}.txt"
    elif fmt == "srt":
        lines = []
        for i, seg in enumerate(entry["segments"], start=1):
            lines.append(str(i))
            lines.append(f"{ms_to_srt_ts(seg['start_ms'])} --> {ms_to_srt_ts(seg['end_ms'])}")
            lines.append(seg["text"])
            lines.append("")
        content = "\n".join(lines)
        mimetype = "application/x-subrip"
        filename = f"transcript_{transcript_id}.srt"
    else:
        return jsonify({"error": "Unsupported format."}), 400

    from io import BytesIO
    buf = BytesIO(content.encode("utf-8"))
    buf.seek(0)
    return send_file(buf, mimetype=mimetype, as_attachment=True, download_name=filename)


if __name__ == "__main__":
    debug = os.environ.get("FLASK_DEBUG", "0") == "1"
    app.run(host="127.0.0.1", port=5020, debug=debug)
