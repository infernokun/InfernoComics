# Simple YAML Configuration for Comic Matcher

import yaml
import os

DEFAULT_CONFIG = """
# Simple Comic Matcher Configuration

# Hardware Performance Level (overrides individual settings below)
# Options: "minimal", "fast", "balanced", "high_performance"
performance_level: "balanced"

# Basic Settings (only used if performance_level is "custom")
image_size: 800           # Smaller = faster (200-1200)
max_workers: 4            # Number of parallel processes (1-8)

# Feature Detectors (true/false to enable, number sets max features)
detectors:
  sift: 500              # 0 to disable, or number of features (100-3000)
  orb: 500               # 0 to disable, or number of features (100-3000) 
  akaze: 300             # 0 to disable, or number of features (100-2000)
  kaze: 200              # 0 to disable, or number of features (100-2000)

# Simple Options
options:
  use_comic_detection: true     # Try to find comic panels (slower but more accurate)
  use_advanced_matching: true   # Better matching quality (slower)
  cache_only: false            # Only use cached results (very fast)

# Performance Presets (you can copy these values to custom settings above)
presets:
  minimal:      # For very slow hardware
    image_size: 300
    max_workers: 1
    detectors:
      sift: 200
      orb: 300
      akaze: 0
      kaze: 0
    options:
      use_comic_detection: false
      use_advanced_matching: false
      cache_only: true

  fast:         # For decent hardware, good speed
    image_size: 400
    max_workers: 2
    detectors:
      sift: 500
      orb: 400
      akaze: 0
      kaze: 0
    options:
      use_comic_detection: false
      use_advanced_matching: false

  balanced:     # Default - good balance
    image_size: 800
    max_workers: 4
    detectors:
      sift: 500
      orb: 500
      akaze: 300
      kaze: 200
    options:
      use_comic_detection: true
      use_advanced_matching: true

  high_performance:  # For fast hardware, best quality
    image_size: 1200
    max_workers: 8
    detectors:
      sift: 2500
      orb: 2000
      akaze: 1000
      kaze: 800
    options:
      use_comic_detection: true
      use_advanced_matching: true
"""

class ComicMatcherConfig:
    def __init__(self, config_path=None):
        self.config = self._load_config(config_path)
        self._apply_performance_level()
        
    def _load_config(self, config_path):
        """Load configuration from YAML file or use defaults"""
        if config_path and os.path.exists(config_path):
            with open(config_path, 'r') as f:
                return yaml.safe_load(f)
        else:
            return yaml.safe_load(DEFAULT_CONFIG)
    
    def _apply_performance_level(self):
        """Apply performance level preset if specified"""
        level = self.config.get('performance_level', 'balanced')
        
        if level != 'custom' and level in self.config.get('presets', {}):
            preset = self.config['presets'][level]
            
            # Apply preset values
            self.config['image_size'] = preset['image_size']
            self.config['max_workers'] = preset['max_workers']
            self.config['detectors'] = preset['detectors'].copy()
            self.config['options'] = preset['options'].copy()
            
            print(f" Applied '{level}' performance preset")
    
    def get(self, key, default=None):
        """Get configuration value"""
        return self.config.get(key, default)
    
    def save(self, output_path):
        """Save current configuration"""
        with open(output_path, 'w') as f:
            yaml.dump(self.config, f, default_flow_style=False, indent=2)
