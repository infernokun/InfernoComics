import yaml
import json

from util.Logger import get_logger
from util.Globals import get_global_matcher_config
from models.RecognitionConfig import RecognitionConfig
from flask import Blueprint, request, jsonify, abort, current_app
from config.ComicMatcherConfig import ComicMatcherConfig, CONFIG_PATH

logger = get_logger(__name__)

config_bp = Blueprint('config', __name__)

def load_yaml() -> dict:
    config_matcher = get_global_matcher_config()

    try:
        yaml_data = config_matcher.get_config()
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
    new_config = ComicMatcherConfig()

    matcher.config = new_config
    current_app.config['GET_MATCHER_CONFIG'] = new_config

    matcher.print_config_summary()

    return jsonify(True), 200