import os
import yaml

from util.Logger import get_logger
from config.EnvironmentConfig import CONFIG_PATH, ENV_LEVEL

logger = get_logger(__name__)

DEFAULT_CONFIG = ""

with open('src/config/default/config.yml') as f:
    DEFAULT_CONFIG = f.read()


class ComicMatcherConfig:
    """Configuration manager for comic matcher with support for both
    embedding-based and feature-based matchers."""

    def __init__(self, config_path=CONFIG_PATH, create_default=True):
        self.config_path = config_path
        self.config = self._load_config(config_path, create_default)
        self._apply_performance_level()

    def _load_config(self, config_path, create_default=True):
        """Load configuration from YAML file or use defaults"""
        if config_path and os.path.exists(config_path):
            logger.info(f"Loading config from: {config_path}")
            with open(config_path, 'r') as f:
                return yaml.safe_load(f)
        else:
            logger.info("Using default configuration")
            default_config = yaml.safe_load(DEFAULT_CONFIG)

            if config_path and create_default:
                self._save_default_config(config_path, default_config)

            return default_config

    def _save_default_config(self, config_path, config_data):
        """Save default configuration to file"""
        try:
            config_dir = os.path.dirname(config_path)
            if config_dir and not os.path.exists(config_dir):
                os.makedirs(config_dir, exist_ok=True)
                logger.info(f"Created config directory: {config_dir}")

            with open(config_path, 'w') as f:
                yaml.dump(config_data, f, default_flow_style=False, indent=2)
            logger.info(f"Created default config file: {config_path}")

        except Exception as e:
            logger.error(f"Could not save default config to {config_path}: {e}")

    def _apply_performance_level(self):
        """Apply performance level preset based on matcher type"""
        env_level = ENV_LEVEL.lower() if ENV_LEVEL else ''
        config_level = self.config.get('performance_level', 'balanced')
        level = env_level if env_level else config_level

        matcher_type = self.get_matcher_type()

        # Select the appropriate presets based on matcher type
        if matcher_type == 'embedding':
            presets = self.config.get('embedding_presets', {})
            preset_source = 'embedding_presets'
        else:
            presets = self.config.get('feature_presets', {})
            # Fallback to legacy 'presets' key for backward compatibility
            if not presets:
                presets = self.config.get('presets', {})
                preset_source = 'presets'
            else:
                preset_source = 'feature_presets'

        if level != 'custom' and level in presets:
            preset = presets[level]

            self.config['performance_level'] = level

            # Apply common settings
            if 'image_size' in preset:
                self.config['image_size'] = preset['image_size']
            if 'max_workers' in preset:
                self.config['max_workers'] = preset['max_workers']
            if 'options' in preset:
                self.config['options'] = preset['options'].copy()

            # Apply matcher-specific settings
            if matcher_type == 'embedding':
                if 'embedding' in preset:
                    self.config['embedding'] = preset['embedding'].copy()
                logger.info(f"Applied '{level}' embedding preset")
                model = self.config.get('embedding', {}).get('model', 'ViT-B-32')
                device = self.config.get('embedding', {}).get('device', 'cpu')
                logger.info(f"Embedding model: {model}, device: {device}")
            else:
                if 'detectors' in preset:
                    self.config['detectors'] = preset['detectors'].copy()
                if 'feature_weights' in preset:
                    self.config['feature_weights'] = preset['feature_weights'].copy()
                logger.info(f"Applied '{level}' feature preset from {preset_source}")
                if 'feature_weights' in preset:
                    weights_str = ', '.join([
                        f'{k}:{v*100:.0f}%'
                        for k, v in preset['feature_weights'].items() if v > 0
                    ])
                    logger.info(f"Feature weights: {weights_str}")
        else:
            logger.info(f"Using custom configuration (level: {level}, type: {matcher_type})")

    def get_matcher_type(self) -> str:
        """Get the configured matcher type ('embedding' or 'feature')"""
        matcher_type = self.config.get('matcher_type', 'embedding')
        if matcher_type not in ('embedding', 'feature'):
            logger.warning(f"Unknown matcher_type '{matcher_type}', defaulting to 'embedding'")
            return 'embedding'
        return matcher_type

    def is_embedding_matcher(self) -> bool:
        """Check if embedding matcher is configured"""
        return self.get_matcher_type() == 'embedding'

    def is_feature_matcher(self) -> bool:
        """Check if feature matcher is configured"""
        return self.get_matcher_type() == 'feature'

    def get_embedding_config(self) -> dict:
        """Get embedding-specific configuration"""
        return self.config.get('embedding', {
            'model': 'ViT-B-32',
            'device': 'cpu'
        })

    def get_feature_config(self) -> dict:
        """Get feature-specific configuration"""
        return {
            'detectors': self.config.get('detectors', {}),
            'feature_weights': self.config.get('feature_weights', {})
        }

    def get_config(self):
        return self._load_config(self.config_path, False)

    def get(self, key, default=None):
        """Get configuration value"""
        return self.config.get(key, default)

    def save(self, output_path=None):
        """Save current configuration to file"""
        save_path = output_path or self.config_path
        if not save_path:
            raise ValueError("No output path specified and no config path available")

        try:
            config_dir = os.path.dirname(save_path)
            if config_dir and not os.path.exists(config_dir):
                os.makedirs(config_dir, exist_ok=True)

            with open(save_path, 'w') as f:
                yaml.dump(self.config, f, default_flow_style=False, indent=2)
            logger.info(f"Configuration saved to: {save_path}")

        except Exception as e:
            logger.error(f"Failed to save configuration: {e}")
            raise

    def get_result_batch(self):
        result_batch = self.get("result_batch")
        if result_batch is None:
            return 10
        return result_batch

    def get_similarity_threshold(self):
        threshold_value = self.get("similarity_threshold")

        if threshold_value is None:
            return 0.55

        if isinstance(threshold_value, str):
            threshold_value = threshold_value.strip()

            if threshold_value.endswith('%'):
                try:
                    percentage = float(threshold_value.rstrip('%').strip())
                    return percentage / 100.0
                except ValueError:
                    logger.warning(f"Invalid percentage format: {threshold_value}, using default 0.55")
                    return 0.55

            try:
                decimal_value = float(threshold_value)
                if decimal_value > 1:
                    return decimal_value / 100.0
                return decimal_value
            except ValueError:
                logger.warning(f"Invalid format: {threshold_value}, using default 0.55")
                return 0.55

        elif isinstance(threshold_value, (int, float)):
            if threshold_value > 1:
                return threshold_value / 100.0
            return float(threshold_value)

        else:
            logger.warning(f"Unexpected type: {type(threshold_value)}, using default 0.55")
            return 0.55

    def get_summary(self) -> dict:
        """Get a summary of the current configuration"""
        matcher_type = self.get_matcher_type()

        summary = {
            'matcher_type': matcher_type,
            'performance_level': self.get('performance_level', 'custom'),
            'image_size': self.get('image_size'),
            'max_workers': self.get('max_workers'),
            'result_batch': self.get_result_batch(),
            'similarity_threshold': self.get_similarity_threshold(),
            'options': self.get('options', {})
        }

        if matcher_type == 'embedding':
            summary['embedding'] = self.get_embedding_config()
        else:
            summary.update(self.get_feature_config())

        return summary
