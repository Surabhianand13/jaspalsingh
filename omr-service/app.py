"""
app.py - OMR Test Checker detection microservice.

Stateless Flask service called internally by the jaspalsingh.in Node backend
(backend/services/omrDetectorClient.js). Takes a Cloudinary image URL plus a
template's calibration data and returns detected bubble-sheet answers - it
never touches the database itself.
"""

import os
from flask import Flask, request, jsonify

from detector.pipeline import run_detect, run_calibration_preview

app = Flask(__name__)

SHARED_SECRET = os.environ.get("OMR_SERVICE_SECRET", "")


def is_authorized():
    # If no secret is configured (e.g. local dev), allow all requests -
    # production deployments must always set OMR_SERVICE_SECRET.
    if not SHARED_SECRET:
        return True
    return request.headers.get("X-Internal-Secret") == SHARED_SECRET


@app.route("/health")
def health():
    return jsonify({"status": "ok"})


@app.route("/detect", methods=["POST"])
def detect():
    if not is_authorized():
        return jsonify({"success": False, "error": "unauthorized"}), 401

    body = request.get_json(force=True, silent=True) or {}
    image_url = body.get("image_url")
    template = body.get("template")
    total_questions = body.get("total_questions")

    if not image_url or not template or not total_questions:
        return jsonify({
            "success": False,
            "error": "bad_request",
            "message": "image_url, template and total_questions are required.",
        }), 400

    try:
        result = run_detect(image_url, template, int(total_questions))
        return jsonify(result), 200 if result.get("success") else 422
    except Exception as e:
        return jsonify({"success": False, "error": "internal_error", "message": str(e)}), 500


@app.route("/calibrate-preview", methods=["POST"])
def calibrate_preview():
    if not is_authorized():
        return jsonify({"success": False, "error": "unauthorized"}), 401

    body = request.get_json(force=True, silent=True) or {}
    image_url = body.get("image_url")
    corner_points = body.get("corner_points") or []
    question_blocks = body.get("question_blocks") or []

    if not image_url:
        return jsonify({"success": False, "error": "bad_request", "message": "image_url is required."}), 400

    try:
        preview_b64 = run_calibration_preview(image_url, corner_points, question_blocks)
        return jsonify({"success": True, "preview_image_base64": preview_b64})
    except Exception as e:
        return jsonify({"success": False, "error": "internal_error", "message": str(e)}), 500


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=int(os.environ.get("PORT", 5001)))
