#!/usr/bin/env python3
"""Build our small PDF bridge with immutable Google Skia sources in Docker."""
import concurrent.futures
import hashlib
import json
import pathlib
import runpy
import shutil
import subprocess
import time

ROOT = pathlib.Path("/work")
SKIA = pathlib.Path("/build/skia")
REVISION = "e2def78fa232884d4aedcf3ad92d4a0dd673b898"
IMAGE = "emscripten/emsdk:4.0.10@sha256:90b757eb11fa9a0e3ce4d2d9f76d932a56018e4accc37b5a28b2783751e60eb7"


def run(*args, **kwargs):
    subprocess.run(args, check=True, **kwargs)


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


if not (SKIA / ".git").exists():
    run("git", "clone", "--depth", "1", "--branch", "canvaskit/0.42.0",
        "https://skia.googlesource.com/skia.git", str(SKIA))
head = subprocess.check_output(["git", "rev-parse", "HEAD"], cwd=SKIA, text=True).strip()
if head != REVISION:
    raise RuntimeError("Unexpected Skia revision: " + head)
run("git", "config", "--global", "http.version", "HTTP/1.1")

# Check cached sources before executing any upstream build tooling.
run("git", "restore", "--source", REVISION, "--", "modules/canvaskit/BUILD.gn",
    "modules/canvaskit/compile.sh", cwd=SKIA)
if subprocess.check_output(["git", "diff", "HEAD", "--name-only"], cwd=SKIA, text=True).strip():
    raise RuntimeError("Unexpected modified Google Skia source")

# Use Google's checkout implementation, but fetch only libraries needed by the
# CPU/PDF build and limit parallelism to avoid transient server transport errors.
sync = runpy.run_path(str(SKIA / "tools/git-sync-deps"))
deps = sync["parse_file_to_dict"](str(SKIA / "DEPS"))["deps"]
needed = {"buildtools", "brotli", "freetype", "harfbuzz", "highway", "libjpeg-turbo",
          "libpng", "libwebp", "wuffs", "zlib", "perfetto", "libgrapheme", "expat", "partition_alloc", "icu"}
selected = {path: value for path, value in deps.items()
            if path.split("/")[-1] in needed}
if len(selected) != len(needed):
    raise RuntimeError("Skia dependency list changed")


def checkout(entry):
    path, value = entry
    repo, revision = value.split("@", 1)
    for attempt in range(3):
        try:
            sync["git_checkout_to_directory"]("git", repo, revision,
                str(SKIA / path), True, True)
            actual = subprocess.check_output(["git", "rev-parse", "HEAD"],
                                            cwd=SKIA / path, text=True).strip()
            expected = subprocess.check_output(["git", "rev-parse", revision + "^{}"],
                                               cwd=SKIA / path, text=True).strip()
            if actual != expected:
                raise RuntimeError("Dependency revision mismatch: " + path)
            dirty = subprocess.check_output(["git", "status", "--porcelain", "--untracked-files=no"],
                                            cwd=SKIA / path, text=True).strip()
            if dirty:
                raise RuntimeError("Modified dependency source: " + path)
            return
        except subprocess.CalledProcessError:
            if attempt == 2:
                raise
            time.sleep(2 ** attempt)


with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:
    list(pool.map(checkout, selected.items()))

# Restore exactly the files our overlay modifies, even in a cached build volume.
run("git", "restore", "--source", REVISION, "--", "modules/canvaskit/BUILD.gn",
    "modules/canvaskit/compile.sh", cwd=SKIA)
if subprocess.check_output(["git", "diff", "--name-only"], cwd=SKIA, text=True).strip():
    raise RuntimeError("Unexpected modified Google Skia source")
module = SKIA / "modules/canvaskit"
bridge = ROOT / "deps/canvaskit-pdf/pdf_bindings.cpp"
shutil.copyfile(bridge, module / "pdf_bindings.cpp")
build = (module / "BUILD.gn").read_text()
if build.count('    "canvaskit_bindings.cpp",') != 1:
    raise RuntimeError("CanvasKit build layout changed")
build = build.replace('    "canvaskit_bindings.cpp",',
                      '    "canvaskit_bindings.cpp",\n    "pdf_bindings.cpp",')
(module / "BUILD.gn").write_text(build)
compile_script = (module / "compile.sh").read_text()
for expected in ["skia_enable_pdf=false", '--args="is_debug=', "-k 10"]:
    if compile_script.count(expected) != 1:
        raise RuntimeError("CanvasKit compile script changed")
compile_script = compile_script.replace("skia_enable_pdf=false", "skia_enable_pdf=true")
compile_script = compile_script.replace('--args="is_debug=',
    '--args="skia_emsdk_dir=\\\"/emsdk\\\" is_debug=')
compile_script = compile_script.replace("-k 10", "-k 1 -j 8")
(module / "compile.sh").write_text(compile_script)
run("bash", str(module / "compile.sh"), "cpu", "no_skottie",
    "client_unicode", "no_embedded_font", "no_woff2", "force_tracing", cwd=SKIA)

out = ROOT / ".cache/canvaskit-built"
out.mkdir(parents=True, exist_ok=True)
for filename in ["canvaskit.js", "canvaskit.wasm"]:
    shutil.copyfile(SKIA / "out/canvaskit_wasm" / filename, out / filename)
shutil.copyfile(module / "npm_build/types/index.d.ts", out / "google-types.d.ts")
chromium_license = ROOT / "deps/canvaskit-pdf/CHROMIUM-LICENSE"
chromium_source = json.loads((ROOT / "deps/canvaskit-pdf/chromium-license-source.json").read_text())
if digest(chromium_license) != chromium_source["sha256"]:
    raise RuntimeError("Chromium license checksum mismatch")
notices = []
for library in sorted(needed - {"buildtools"}):
    folder = SKIA / ("buildtools" if library == "buildtools" else "third_party/externals/" + library)
    files = sorted(set(path for pattern in ["LICENSE*", "COPYING*", "NOTICE*", "README.ijg", "docs/FTL.TXT"]
                       for path in folder.glob(pattern) if path.is_file()))
    if library == "partition_alloc":
        notices.append("=== partition_alloc: " + chromium_source["url"] + " ===\n" + chromium_license.read_text())
        continue
    if not files:
        raise RuntimeError("Missing license notice: " + library)
    for path in files:
        notices.append("=== " + str(path.relative_to(SKIA)) + " ===\n" + path.read_text(errors="replace"))
(out / "THIRD_PARTY_LICENSES.txt").write_text("\n\n".join(notices) + "\n")
manifest = {
    "skiaRevision": REVISION,
    "skiaRelease": "canvaskit/0.42.0",
    "source": "https://skia.googlesource.com/skia.git",
    "buildImage": IMAGE,
    "bridgeSha256": digest(bridge),
    "buildScriptSha256": digest(pathlib.Path(__file__)),
    "depsSha256": digest(SKIA / "DEPS"),
    "typeDefinitionsSha256": digest(out / "google-types.d.ts"),
    "licensesSha256": digest(out / "THIRD_PARTY_LICENSES.txt"),
    "dependencies": selected,
    "chromiumLicenseSource": chromium_source,
    "artifacts": {filename: digest(out / filename)
                  for filename in ["canvaskit.js", "canvaskit.wasm"]},
}
(out / "provenance.json").write_text(json.dumps(manifest, indent=2) + "\n")
print("Built CanvasKit PDF from Google Skia " + REVISION, flush=True)
