import os
import re
import cv2
import requests

from PIL import Image
from pyzbar.pyzbar import decode
from flask import Blueprint, jsonify, current_app
from util.Logger import get_logger
from util.FileOperations import ensure_images_directory

logger = get_logger(__name__)

barcode_bp = Blueprint('barcode', __name__)


# ---------------------------------------------------------------------------
# Barcode scanning helpers
# ---------------------------------------------------------------------------

def _normalize_barcode(code: str) -> str:
    code = re.sub(r"\D", "", code)
    if len(code) == 13 and code.startswith("0"):
        return code[1:]
    return code


def _rotate_image(img, angle):
    if angle == 90:
        return cv2.rotate(img, cv2.ROTATE_90_CLOCKWISE)
    if angle == 180:
        return cv2.rotate(img, cv2.ROTATE_180)
    if angle == 270:
        return cv2.rotate(img, cv2.ROTATE_90_COUNTERCLOCKWISE)
    return img


def _try_decode(image):
    if len(image.shape) == 2:
        pil_img = Image.fromarray(image)
    else:
        pil_img = Image.fromarray(cv2.cvtColor(image, cv2.COLOR_BGR2RGB))

    for d in decode(pil_img):
        raw = d.data.decode(errors="ignore")
        if raw:
            return raw, _normalize_barcode(raw), d.type
    return None


def _decode_image(img):
    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    variants = [
        img,
        gray,
        cv2.threshold(gray, 180, 255, cv2.THRESH_BINARY)[1],
        cv2.threshold(gray, 140, 255, cv2.THRESH_BINARY)[1],
        cv2.threshold(gray, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)[1],
    ]
    for variant in variants:
        result = _try_decode(variant)
        if result:
            return result
    return None


def _decode_all_rotations(img):
    for angle in [0, 90, 180, 270]:
        result = _decode_image(_rotate_image(img, angle))
        if result:
            return result
    return None


def _corner_crops(img):
    h, w = img.shape[:2]
    fractions = [0.5, 0.35, 0.25]
    corners = [
        lambda f: (int(h * (1 - f)), h, int(w * (1 - f)), w),
        lambda f: (int(h * (1 - f)), h, 0, int(w * f)),
        lambda f: (0, int(h * f), int(w * (1 - f)), w),
        lambda f: (0, int(h * f), 0, int(w * f)),
    ]
    for fraction in fractions:
        for corner_fn in corners:
            r1, r2, c1, c2 = corner_fn(fraction)
            yield img[r1:r2, c1:c2]


def scan_barcode(path: str) -> str | None:
    """Scan a single image file for a barcode. Returns normalized barcode or None."""
    img = cv2.imread(path)
    if img is None:
        logger.warning(f"Failed to load image: {path}")
        return None

    result = _decode_all_rotations(img)
    if result:
        logger.debug(f"Barcode found on full image: {result[1]}")
        return result[1]

    for crop in _corner_crops(img):
        result = _decode_all_rotations(crop)
        if result:
            logger.debug(f"Barcode found in corner crop: {result[1]}")
            return result[1]

    h, w = img.shape[:2]
    upscaled = cv2.resize(img, (w * 2, h * 2), interpolation=cv2.INTER_CUBIC)
    result = _decode_all_rotations(upscaled)
    if result:
        logger.debug(f"Barcode found on upscaled image: {result[1]}")
        return result[1]

    return None


# ---------------------------------------------------------------------------
# Route
# ---------------------------------------------------------------------------

@barcode_bp.route('/barcode/process', methods=['POST'])
def process_barcodes():
    """
    For each series, iterate through its issues until a barcode is found.
    When found, PATCH the barcode onto the series and move on.

    uploadedImageUrl is stored as "{session_id}/{filename}" in the DB,
    mapping directly to stored_images/{session_id}/{filename} on disk.
    """
    rest_api = current_app.config.get('REST_API')
    images_dir = ensure_images_directory()

    try:
        resp = requests.get(f"{rest_api}/series", timeout=30)
        resp.raise_for_status()
        series_list = resp.json().get('data', [])
    except Exception as e:
        logger.error(f"Failed to fetch series list: {e}")
        return jsonify({"status": "error", "message": str(e)}), 500

    results = {"series_processed": 0, "barcodes_found": 0, "barcodes_not_found": 0, "errors": 0}

    for series in series_list:
        series_id = series.get('id')
        series_name = series.get('name', f"id={series_id}")

        try:
            resp = requests.get(f"{rest_api}/issues/series/{series_id}", timeout=15)
            resp.raise_for_status()
            issues = resp.json().get('data', [])
        except Exception as e:
            logger.error(f"Failed to fetch issues for series {series_id}: {e}")
            results["errors"] += 1
            continue

        results["series_processed"] += 1
        barcode_found = None

        for issue in issues:
            uploaded_image_url = issue.get('uploadedImageUrl')
            if not uploaded_image_url:
                continue

            local_path = os.path.join(images_dir, uploaded_image_url)
            if not os.path.isfile(local_path):
                continue

            barcode = scan_barcode(local_path)
            if barcode:
                barcode_found = barcode
                break

        if barcode_found:
            try:
                patch_resp = requests.patch(
                    f"{rest_api}/series/{series_id}/barcode",
                    params={"barcode": barcode_found},
                    timeout=10
                )
                patch_resp.raise_for_status()
                logger.info(f"Series '{series_name}' ({series_id}): barcode={barcode_found}")
                results["barcodes_found"] += 1
            except Exception as e:
                logger.error(f"Failed to update barcode for series {series_id}: {e}")
                results["errors"] += 1
        else:
            logger.debug(f"Series '{series_name}' ({series_id}): no barcode found")
            results["barcodes_not_found"] += 1

    logger.info(f"Barcode processing complete: {results}")
    return jsonify({"status": "ok", "results": results})
