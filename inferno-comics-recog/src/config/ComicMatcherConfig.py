# Simple YAML Configuration for Comic Matcher

import yaml
import os
from util.Logger import get_logger

logger = get_logger(__name__)

DEFAULT_CONFIG = ""

with open('src/config/config.yml') as f:
    DEFAULT_CONFIG = f.read()

# Processing Power Reference (from lowest to highest):
# 1. ORB - Fastest, binary descriptors, minimal CPU
# 2. AKAZE - Medium speed, excellent accuracy/speed ratio  
# 3. KAZE - Slower, non-linear diffusion
# 4. SIFT - Slowest, most CPU intensive, very robust

CONFIG_PATH = os.environ.get('CONFIG_PATH', '/var/tmp/inferno-comics/config.yml')

class ComicMatcherConfig:
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
            
            # Save default config if path provided and create_default is True
            if config_path and create_default:
                self._save_default_config(config_path, default_config)
            
            return default_config
    
    def _save_default_config(self, config_path, config_data):
        """Save default configuration to file"""
        try:
            # Create directory if it doesn't exist
            config_dir = os.path.dirname(config_path)
            if config_dir and not os.path.exists(config_dir):
                os.makedirs(config_dir, exist_ok=True)
                logger.info(f"Created config directory: {config_dir}")
            
            # Save the default config
            with open(config_path, 'w') as f:
                yaml.dump(config_data, f, default_flow_style=False, indent=2)
            logger.info(f"Created default config file: {config_path}")
            logger.debug(f"You can edit this file to customize your settings")
            
        except Exception as e:
            logger.error(f"Could not save default config to {config_path}: {e}")
    
    def _apply_performance_level(self):
        """Apply performance level preset, prioritizing environment variable"""
        # Check environment variable first, then config file, default to balanced
        env_level = os.environ.get('PERFORMANCE_LEVEL', '').lower()
        config_level = self.config.get('performance_level', 'balanced')
        
        # Use environment variable if set, otherwise use config file
        level = env_level if env_level else config_level
        
        if level != 'custom' and level in self.config.get('presets', {}):
            preset = self.config['presets'][level]
            
            # Apply preset values
            self.config['performance_level'] = level
            self.config['image_size'] = preset['image_size']
            self.config['max_workers'] = preset['max_workers']
            self.config['detectors'] = preset['detectors'].copy()
            self.config['options'] = preset['options'].copy()
            
            # Apply feature weights if present in preset
            if 'feature_weights' in preset:
                self.config['feature_weights'] = preset['feature_weights'].copy()
                
            if env_level:
                logger.info(f"Applied '{level}' performance preset from environment variable")
            else:
                logger.info(f"Applied '{level}' performance preset from config")
                
            # Show the weights being applied
            if 'feature_weights' in preset:
                weights_str = ', '.join([f'{k}:{v*100:.0f}%' for k, v in preset['feature_weights'].items() if v > 0])
                logger.info(f"Feature weights: {weights_str}")
        else:
            logger.info(f"Using custom configuration (level: {level})")

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
            # Create directory if needed
            config_dir = os.path.dirname(save_path)
            if config_dir and not os.path.exists(config_dir):
                os.makedirs(config_dir, exist_ok=True)
            
            with open(save_path, 'w') as f:
                yaml.dump(self.config, f, default_flow_style=False, indent=2)
            logger.info(f"Configuration saved to: {save_path}")
            
        except Exception as e:
            logger.error(f"❌ Failed to save configuration: {e}")
            raise
    
    def create_custom_preset(self, preset_name, **kwargs):
        """Create a custom preset with specified parameters"""
        if 'presets' not in self.config:
            self.config['presets'] = {}
        
        # Build preset from kwargs or current config
        preset = {
            'image_size': kwargs.get('image_size', self.config.get('image_size', 800)),
            'max_workers': kwargs.get('max_workers', self.config.get('max_workers', 4)),
            'detectors': kwargs.get('detectors', self.config.get('detectors', {})),
            'feature_weights': kwargs.get('feature_weights', self.config.get('feature_weights', {})),
            'options': kwargs.get('options', self.config.get('options', {}))
        }
        
        self.config['presets'][preset_name] = preset
        logger.info(f"Created custom preset: {preset_name}")
        return preset
    
    def get_result_batch(self):
        result_match = self.get("result_batch")

        if result_match is None:
            return 10

        return result_match

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
                    logger.warning(f"Invalid percentage format for similarity_threshold: {threshold_value}, using default 0.55")
                    return 0.55
            
            try:
                decimal_value = float(threshold_value)
                if decimal_value > 1:
                    return decimal_value / 100.0
                return decimal_value
            except ValueError:
                logger.warning(f"Invalid format for similarity_threshold: {threshold_value}, using default 0.55")
                return 0.55
        
        elif isinstance(threshold_value, (int, float)):
            if threshold_value > 1:
                return threshold_value / 100.0
            return float(threshold_value)
        
        else:
            logger.warning(f"Unexpected type for similarity_threshold: {type(threshold_value)}, using default 0.55")
            return 0.55
