#!/usr/bin/env python3
"""
Console utility for recognizing Russian vehicle plates.

Supports:
  - Standard plates: A123BC 77
  - Trailer plates:  AB1234 77

Usage:
  python plate_reader.py <image_path>
"""

import os
import re
import sys
import time

import cv2
import numpy as np

try:
    from rapidocr import EngineType, LangDet, LangRec, ModelType, OCRVersion, RapidOCR
except ImportError:
    print(
        "Error: install RapidOCR first: pip install rapidocr onnxruntime",
        file=sys.stderr,
    )
    sys.exit(1)


VALID_LETTERS_CYR = "АВЕКМНОРСТУХ"
VALID_LETTERS_LAT = "ABEKMHOPCTYX"
LAT_TO_CYR = dict(zip(VALID_LETTERS_LAT, VALID_LETTERS_CYR))

EXTRA_LAT_TO_CYR = {
    "U": "У",
    "Y": "У",
}

DIGIT_TO_LETTER = {
    "0": "О",
    "8": "В",
    "6": "В",
}

LETTER_TO_DIGIT = {
    "О": "0",
    "O": "0",
    "В": "8",
    "B": "8",
    "З": "3",
    "Э": "3",
    "Ч": "4",
    "Z": "7",
    "I": "1",
    "L": "1",
    "S": "5",
    "G": "6",
    "D": "0",
}

STANDARD_RE = re.compile(r"[АВЕКМНОРСТУХ]\d{3}[АВЕКМНОРСТУХ]{2}\d{2,3}")
TRAILER_RE = re.compile(r"[АВЕКМНОРСТУХ]{2}\d{4}\d{2,3}")

ENGINE_ALIASES = {
    "": "auto",
    "auto": "auto",
    "onnxruntime": "onnxruntime",
    "ort": "onnxruntime",
    "cpu": "onnxruntime",
    "openvino": "openvino",
    "ov": "openvino",
}


def normalize_text(text):
    text = text.upper().strip()
    text = re.sub(r"[^A-ZА-ЯЁ0-9]", "", text)
    result = []
    for char in text:
        if char in LAT_TO_CYR:
            result.append(LAT_TO_CYR[char])
        elif char in EXTRA_LAT_TO_CYR:
            result.append(EXTRA_LAT_TO_CYR[char])
        elif char == "Ё":
            result.append("Е")
        else:
            result.append(char)
    return "".join(result)


def strict_position_fix_standard(text):
    if len(text) < 8:
        return text

    result = list(text)

    if result[0] in DIGIT_TO_LETTER:
        result[0] = DIGIT_TO_LETTER[result[0]]
    elif result[0].isdigit():
        result[0] = "О"

    for pos in [1, 2, 3]:
        if pos < len(result) and result[pos] in LETTER_TO_DIGIT:
            result[pos] = LETTER_TO_DIGIT[result[pos]]

    for pos in [4, 5]:
        if pos < len(result) and result[pos] in DIGIT_TO_LETTER:
            result[pos] = DIGIT_TO_LETTER[result[pos]]

    for pos in range(6, len(result)):
        if result[pos] in LETTER_TO_DIGIT:
            result[pos] = LETTER_TO_DIGIT[result[pos]]

    return "".join(result)


def strict_position_fix_trailer(text):
    if len(text) < 8:
        return text

    result = list(text)

    for pos in [0, 1]:
        if result[pos] in DIGIT_TO_LETTER:
            result[pos] = DIGIT_TO_LETTER[result[pos]]
        elif result[pos].isdigit():
            result[pos] = "О"

    for pos in [2, 3, 4, 5]:
        if pos < len(result) and result[pos] in LETTER_TO_DIGIT:
            result[pos] = LETTER_TO_DIGIT[result[pos]]

    for pos in range(6, len(result)):
        if result[pos] in LETTER_TO_DIGIT:
            result[pos] = LETTER_TO_DIGIT[result[pos]]

    return "".join(result)


def format_plate(text, plate_type="standard"):
    if plate_type == "trailer" and len(text) >= 8:
        return f"{text[:2]}{text[2:6]} {text[6:]}"
    if len(text) >= 8:
        return f"{text[:6]} {text[6:]}"
    return text


def try_extract_standard(text):
    candidates = []

    match = STANDARD_RE.search(text)
    if match:
        candidates.append(match.group())

    fixed = strict_position_fix_standard(text)
    match = STANDARD_RE.search(fixed)
    if match and match.group() not in candidates:
        candidates.append(match.group())

    if text and text[0] == "0" and len(text) >= 4 and text[1].isdigit():
        fixed = strict_position_fix_standard("О" + text[1:])
        match = STANDARD_RE.search(fixed)
        if match and match.group() not in candidates:
            candidates.append(match.group())

    if text and text[0].isdigit():
        fixed = strict_position_fix_standard("О" + text)
        match = STANDARD_RE.search(fixed)
        if match and match.group() not in candidates:
            candidates.append(match.group())

    return candidates


def try_extract_trailer(text):
    candidates = []

    match = TRAILER_RE.search(text)
    if match:
        candidates.append(match.group())

    fixed = strict_position_fix_trailer(text)
    match = TRAILER_RE.search(fixed)
    if match and match.group() not in candidates:
        candidates.append(match.group())

    if text and len(text) >= 2:
        prefix = list(text[:2])
        changed = False
        for index in range(2):
            if prefix[index] in DIGIT_TO_LETTER:
                prefix[index] = DIGIT_TO_LETTER[prefix[index]]
                changed = True
        if changed:
            fixed = strict_position_fix_trailer("".join(prefix) + text[2:])
            match = TRAILER_RE.search(fixed)
            if match and match.group() not in candidates:
                candidates.append(match.group())

    return candidates


def try_extract_all(text):
    candidates = []
    for plate in try_extract_standard(text):
        candidates.append((plate, "standard"))
    for plate in try_extract_trailer(text):
        candidates.append((plate, "trailer"))
    return candidates


def try_build_plate(texts):
    candidates = []
    max_texts = min(len(texts), 6)

    for i in range(max_texts):
        for j in range(max_texts):
            if i == j:
                continue

            combined = texts[i][0] + texts[j][0]
            for plate, plate_type in try_extract_all(combined):
                avg_conf = (texts[i][1] + texts[j][1]) / 2.0
                candidates.append((plate, plate_type, avg_conf))

            if len(texts[i][0]) < 6 and len(texts[j][0]) < 6:
                for k in range(max_texts):
                    if k in (i, j):
                        continue
                    combined = texts[i][0] + texts[j][0] + texts[k][0]
                    for plate, plate_type in try_extract_all(combined):
                        avg_conf = (texts[i][1] + texts[j][1] + texts[k][1]) / 3.0
                        candidates.append((plate, plate_type, avg_conf))

    return candidates


def has_openvino():
    try:
        import openvino  # noqa: F401
        return True
    except Exception:
        return False


def resolve_engine_name():
    raw_engine = os.getenv("PLATE_READER_ENGINE", "auto").strip().lower()
    normalized = ENGINE_ALIASES.get(raw_engine)
    if normalized is None:
        print(
            f"Unknown PLATE_READER_ENGINE={raw_engine!r}; using auto",
            file=sys.stderr,
        )
        normalized = "auto"

    if normalized == "openvino":
        if has_openvino():
            return EngineType.OPENVINO, "forced-openvino"
        print(
            "OpenVINO requested but module is not installed; falling back to ONNXRUNTIME",
            file=sys.stderr,
        )
        return EngineType.ONNXRUNTIME, "fallback-onnxruntime"

    if normalized == "onnxruntime":
        return EngineType.ONNXRUNTIME, "forced-onnxruntime"

    if has_openvino():
        return EngineType.OPENVINO, "auto-openvino"

    return EngineType.ONNXRUNTIME, "auto-onnxruntime"


def build_reader_params(engine_type):
    return {
        "Det.engine_type": engine_type,
        "Det.lang_type": LangDet.CH,
        "Det.model_type": ModelType.MOBILE,
        "Det.ocr_version": OCRVersion.PPOCRV5,
        "Rec.engine_type": engine_type,
        "Rec.lang_type": LangRec.CYRILLIC,
        "Rec.model_type": ModelType.MOBILE,
        "Rec.ocr_version": OCRVersion.PPOCRV5,
    }


def build_reader():
    engine_type, reason = resolve_engine_name()
    params = build_reader_params(engine_type)
    try:
        return RapidOCR(params=params), engine_type, reason
    except ImportError as error:
        if engine_type == EngineType.OPENVINO:
            print(
                f"OpenVINO initialization failed ({error}); falling back to ONNXRUNTIME",
                file=sys.stderr,
            )
            return (
                RapidOCR(params=build_reader_params(EngineType.ONNXRUNTIME)),
                EngineType.ONNXRUNTIME,
                "fallback-onnxruntime",
            )
        raise


def read_text_fast(reader, image):
    output = reader(image)
    if output is None:
        return []

    texts = list(getattr(output, "txts", ()) or ())
    scores = list(getattr(output, "scores", ()) or ())
    return list(zip(texts, scores))


def extract_unique_texts(results):
    all_texts = []
    seen = set()
    for text, conf in results:
        normalized = normalize_text(text)
        if normalized and len(normalized) >= 2 and normalized not in seen:
            seen.add(normalized)
            all_texts.append((normalized, float(conf)))
    return all_texts


def build_plate_candidates(all_texts):
    candidates = []

    for text, conf in all_texts:
        for plate, plate_type in try_extract_all(text):
            candidates.append((plate, plate_type, conf + 1.0))

    combined = "".join(text for text, _ in all_texts)
    for plate, plate_type in try_extract_all(combined):
        candidates.append((plate, plate_type, 2.0))

    short_texts = [text for text in all_texts if len(text[0]) < 8]
    if short_texts:
        combined_short = "".join(text for text, _ in short_texts)
        for plate, plate_type in try_extract_all(combined_short):
            candidates.append((plate, plate_type, 1.5))

    candidates.extend(try_build_plate(all_texts))
    return candidates


def recognize_plate(image_path):
    image = cv2.imread(image_path)
    if image is None:
        print(f"Error: failed to load image {image_path}", file=sys.stderr)
        return None

    height, width = image.shape[:2]
    longest_side = max(height, width)
    work_image = image

    if longest_side > 1280:
        scale = 1280.0 / longest_side
        work_image = cv2.resize(image, None, fx=scale, fy=scale, interpolation=cv2.INTER_AREA)
        print(
            f"Image downscaled to {work_image.shape[1]}x{work_image.shape[0]}",
            file=sys.stderr,
        )
    elif longest_side < 600:
        scale = 800.0 / longest_side
        work_image = cv2.resize(image, None, fx=scale, fy=scale, interpolation=cv2.INTER_CUBIC)
        print(
            f"Image upscaled to {work_image.shape[1]}x{work_image.shape[0]}",
            file=sys.stderr,
        )

    start = time.time()
    print("Loading RapidOCR...", file=sys.stderr)
    reader, engine_type, engine_reason = build_reader()
    print(f"OCR engine: {engine_type.value} ({engine_reason})", file=sys.stderr)
    print(f"RapidOCR loaded in {time.time() - start:.1f}s", file=sys.stderr)

    start = time.time()
    print("Running primary OCR...", file=sys.stderr)
    primary_results = read_text_fast(reader, work_image)
    print(f"Primary OCR finished in {time.time() - start:.1f}s", file=sys.stderr)

    all_texts = extract_unique_texts(primary_results)
    candidates = build_plate_candidates(all_texts) if all_texts else []

    if not candidates:
        kernel = np.array([[-1, -1, -1], [-1, 9, -1], [-1, -1, -1]])
        sharpened = cv2.filter2D(work_image, -1, kernel)
        start = time.time()
        print("Running sharpen fallback OCR...", file=sys.stderr)
        fallback_results = read_text_fast(reader, sharpened)
        print(f"Fallback OCR finished in {time.time() - start:.1f}s", file=sys.stderr)
        all_texts = extract_unique_texts(primary_results + fallback_results)
        candidates = build_plate_candidates(all_texts) if all_texts else []

    if not all_texts:
        print("No OCR fragments found", file=sys.stderr)
        return None

    print(f"Fragments: {[text for text, _ in all_texts]}", file=sys.stderr)

    if not candidates:
        return None

    unique = {}
    for plate, plate_type, conf in candidates:
        type_bonus = 0.5 if plate_type == "standard" else 0.0
        score = conf + type_bonus
        if plate not in unique or unique[plate][1] < score:
            unique[plate] = (plate_type, score)

    best_plate, (best_type, _) = sorted(unique.items(), key=lambda item: item[1][1], reverse=True)[0]
    return format_plate(best_plate, best_type)


def main():
    if len(sys.argv) < 2:
        print("Usage: python plate_reader.py <image_path>")
        sys.exit(1)

    image_path = sys.argv[1]
    print(f"Processing: {image_path}")

    started_at = time.time()
    plate_number = recognize_plate(image_path)
    elapsed = time.time() - started_at

    if plate_number:
        print(f"Plate: {plate_number}")
    else:
        print("Plate not recognized")

    print(f"Elapsed: {elapsed:.1f}s", file=sys.stderr)


if __name__ == "__main__":
    main()
