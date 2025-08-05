# Simple YAML Configuration for Comic Matcher

import yaml
import os

DEFAULT_CONFIG = """
# Comic Matcher Configuration - Optimized for AKAZE Performance
# Hardware Performance Level (overrides individual settings below)
# Options: "minimal", "fast", "balanced", "high_performance"
performance_level: "balanced"

# Basic Settings (only used if performance_level is "custom")
image_size: 800
max_workers: 4

# Feature Detectors (0 to disable, number sets max features)
detectors:
  sift: 500       # High processing power, excellent quality
  orb: 500        # Low processing power, good speed
  akaze: 300      # Medium processing power, excellent accuracy
  kaze: 200       # High processing power, good quality

# Feature Weights (how much each detector contributes to final score)
# Should add up to 1.0, but will be normalized automatically
feature_weights:
  sift: 0.25      # SIFT contribution (25%)
  orb: 0.25       # ORB contribution (25%)
  akaze: 0.40     # AKAZE contribution (40% - most accurate)
  kaze: 0.10      # KAZE contribution (10%)

# Advanced Options
options:
  use_comic_detection: true      # Try to find comic panels
  use_advanced_matching: true    # Better matching quality
  cache_only: false              # Only use cached results

# Performance Presets - Optimized for Processing Power vs Accuracy
presets:
  minimal:  # For very slow hardware - ORB only for speed
    image_size: 300
    max_workers: 1
    detectors:
      sift: 0        # Disable - too slow
      orb: 500       # Fast and reasonable
      akaze: 0       # Disable - save processing
      kaze: 0        # Disable - too slow
    feature_weights:
      sift: 0.0
      orb: 1.0       # 100% ORB for speed
      akaze: 0.0
      kaze: 0.0
    options:
      use_comic_detection: false
      use_advanced_matching: false
      cache_only: true
      
  fast:  # For decent hardware - ORB + AKAZE combo
    image_size: 400
    max_workers: 2
    detectors:
      sift: 0        # Skip SIFT for speed
      orb: 800       # More ORB features
      akaze: 400     # Keep AKAZE for accuracy
      kaze: 0        # Skip KAZE for speed
    feature_weights:
      sift: 0.0
      orb: 0.40      # 40% ORB for speed
      akaze: 0.60    # 60% AKAZE for accuracy
      kaze: 0.0
    options:
      use_comic_detection: false
      use_advanced_matching: false
      
  balanced:  # AKAZE-focused with SIFT/ORB support
    image_size: 1000
    max_workers: 4
    detectors:
      sift: 1500     # Moderate SIFT
      orb: 1500      # Good ORB count
      akaze: 800     # High AKAZE - our star performer
      kaze: 400      # Moderate KAZE
    feature_weights:
      sift: 0.20     # 20% SIFT
      orb: 0.20      # 20% ORB  
      akaze: 0.50    # 50% AKAZE - most accurate
      kaze: 0.10     # 10% KAZE
    options:
      use_comic_detection: true
      use_advanced_matching: true
      
  high_performance:  # Maximum accuracy - all detectors optimized
    image_size: 1200
    max_workers: 8
    detectors:
      sift: 2500     # Maximum SIFT
      orb: 2000      # High ORB
      akaze: 1200    # Maximum AKAZE features
      kaze: 800      # High KAZE
    feature_weights:
      sift: 0.25     # 25% SIFT
      orb: 0.20      # 20% ORB
      akaze: 0.45    # 45% AKAZE - still dominant
      kaze: 0.10     # 10% KAZE
    options:
      use_comic_detection: true
      use_advanced_matching: true
      
  akaze_focused:  # Custom preset - AKAZE-dominant for maximum accuracy
    image_size: 800
    max_workers: 4
    detectors:
      sift: 800
      orb: 800
      akaze: 1000    # Maximize AKAZE
      kaze: 200
    feature_weights:
      sift: 0.15     # 15% SIFT
      orb: 0.15      # 15% ORB
      akaze: 0.65    # 65% AKAZE - maximum accuracy
      kaze: 0.05     # 5% KAZE
    options:
      use_comic_detection: true
      use_advanced_matching: true
"""

# Processing Power Reference (from lowest to highest):
# 1. ORB - Fastest, binary descriptors, minimal CPU
# 2. AKAZE - Medium speed, excellent accuracy/speed ratio  
# 3. KAZE - Slower, non-linear diffusion
# 4. SIFT - Slowest, most CPU intensive, very robust

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
        """Apply performance level preset, prioritizing environment variable"""
        # Check environment variable first, then config file
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
                print(f"⚡ Applied '{level}' performance preset from environment variable")
            else:
                print(f"⚡ Applied '{level}' performance preset from config")
                
            # Show the weights being applied
            if 'feature_weights' in preset:
                weights_str = ', '.join([f'{k}:{v:.1%}' for k, v in preset['feature_weights'].items() if v > 0])
                print(f"⚖️ Feature weights: {weights_str}")
        else:
            print(f"🔧 Using custom configuration (level: {level})")
           
    def get(self, key, default=None):
        """Get configuration value"""
        return self.config.get(key, default)
    
    def save(self, output_path):
        """Save current configuration"""
        with open(output_path, 'w') as f:
            yaml.dump(self.config, f, default_flow_style=False, indent=2)