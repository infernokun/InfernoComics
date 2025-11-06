import yaml
import json

from config.ComicMatcherConfig import ComicMatcherConfig, DEFAULT_CONFIG, CONFIG_PATH
from models.RecognitionConfig import RecognitionConfig
from flask import Blueprint, request, jsonify, abort, current_app


config_bp = Blueprint('config', __name__)

def load_yaml() -> dict:
    try:
        yaml_data = yaml.safe_load(DEFAULT_CONFIG) or {}
        if not isinstance(yaml_data, dict):
            yaml_data = {"value": yaml_data}
        return yaml_data
    except yaml.YAMLError as exc:
        current_app.logger.error(f"YAML parsing error: {exc}")
        return {"error": "Invalid configuration YAML"}

@config_bp.route('/config', methods=['GET'])
def get_config():
    config_dict = load_yaml()
    return jsonify(config_dict)

@config_bp.route("/config", methods=["POST"])
def save_config():
    if not request.is_json:
        abort(400, description="Request body must be JSON")

    payload_dict: dict = request.get_json()

    try:
        payload_json = json.dumps(payload_dict)
        cfg = RecognitionConfig.from_json(payload_json)
    except (TypeError, ValueError) as e:
        abort(400, description=f"Invalid payload: {e}")

    with open(CONFIG_PATH, "w") as f:
        f.write(cfg.to_yml())

    matcher = current_app.config['GET_MATCHER']()
    matcher.config = ComicMatcherConfig()
    matcher.print_config_summary()

    return jsonify(True), 200