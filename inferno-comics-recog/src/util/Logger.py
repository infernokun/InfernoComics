import os
import sys
import logging
from typing import Optional

class ColorFormatter(logging.Formatter):
    """Custom formatter that adds colors to log messages based on log level"""
    
    # ANSI color codes
    COLORS = {
        "DEBUG": "\033[95m",      # Purple
        "INFO": "\033[94m",       # Blue
        "WARNING": "\033[93m",    # Yellow/Orange
        "SUCCESS": "\033[92m",    # Green
        "ERROR": "\033[91m",      # Red
        "CRITICAL": "\033[1;91m", # Bold Red
    }

    
    
    # Module name color (cyan)
    MODULE_COLOR = "\033[96m"
    
    RESET = "\033[0m"  # Reset color
    
    # Find the longest level name for alignment
    MAX_LEVEL_WIDTH = max(len(level) for level in [x for x in COLORS.keys()])
    
    def __init__(self, fmt: str = None, datefmt: str = "%H:%M:%S", use_colors: bool = True):
        if fmt is None:
            fmt = "%(asctime)s %(levelname)s [%(name)s] - %(message)s"
        super().__init__(fmt, datefmt)
        self.use_colors = use_colors and self._supports_color()
    
    def _supports_color(self) -> bool:
        """Check if colors should be used"""
        # Force colors if explicitly requested via environment variable
        force_colors = os.getenv('FORCE_LOG_COLORS', '').lower() in ('true', '1', 'yes')
        if force_colors:
            return True
            
        # Check if we're in a Docker container
        if os.path.exists('/.dockerenv'):
            # In Docker, enable colors by default
            return True
            
        # Standard terminal color support check
        return (
            hasattr(sys.stdout, "isatty") and 
            sys.stdout.isatty() and 
            os.environ.get("TERM") != "dumb"
        )
    
    def _shorten_name(self, name: str) -> str:
        """Shorten logger name but keep __main__ unchanged"""
        if name == "__main__" or "." not in name:
            return name
        # Extract just the last part after the last dot
        return name.split(".")[-1]
    
    def format(self, record: logging.LogRecord) -> str:
        # Store original values
        original_levelname = record.levelname
        original_name = record.name
        
        # Shorten the logger name
        shortened_name = self._shorten_name(original_name)
        
        if self.use_colors:
            # Add color to the module name
            record.name = f"{self.MODULE_COLOR}{shortened_name}{self.RESET}"
            
            # Add color and padding to the level name
            if original_levelname in self.COLORS:
                # Pad the levelname to MAX_LEVEL_WIDTH, then add color
                padded_levelname = original_levelname.ljust(self.MAX_LEVEL_WIDTH)
                colored_levelname = f"{self.COLORS[original_levelname]}{padded_levelname}{self.RESET}"
                record.levelname = colored_levelname
            else:
                # Just pad if no color available
                record.levelname = original_levelname.ljust(self.MAX_LEVEL_WIDTH)
        else:
            # No colors, just use shortened name and pad levelname
            record.name = shortened_name
            record.levelname = original_levelname.ljust(self.MAX_LEVEL_WIDTH)
        
        # Format the message
        formatted = super().format(record)
        
        # Reset values back to original (in case the record is used elsewhere)
        record.levelname = original_levelname
        record.name = original_name
            
        return formatted

# Global registry to track initialized loggers and shared configuration
_initialized_loggers = {}
_shared_log_file = None
_shared_log_level = logging.INFO

def set_global_log_config(log_file: str, level: int = logging.INFO):
    """
    Set global logging configuration that all loggers will use
    
    Args:
        log_file: Path to the shared log file
        level: Global logging level
    """
    global _shared_log_file, _shared_log_level
    _shared_log_file = log_file
    _shared_log_level = level

def initialize_logger(name: Optional[str] = None, level: int = logging.INFO,
                    log_file: Optional[str] = None, use_colors: bool = True,
                    format_string: Optional[str] = None) -> logging.Logger:
    """
    Initialize and configure a colorful logger
    
    Args:
        name: Logger name (defaults to calling module name)
        level: Logging level (default: INFO)
        log_file: Optional file to write logs to
        use_colors: Whether to use colors in console output
        format_string: Custom format string
    
    Returns:
        Configured logger instance
    """
    # Add SUCCESS level to logging module (only once)
    if not hasattr(logging, 'SUCCESS'):
        logging.SUCCESS = 25  # Between INFO (20) and WARNING (30)
        logging.addLevelName(logging.SUCCESS, 'SUCCESS')
        
        # Add success method to Logger class
        def success(self, message, *args, **kwargs):
            if self.isEnabledFor(logging.SUCCESS):
                self._log(logging.SUCCESS, message, args, **kwargs)
        
        logging.Logger.success = success
    
    # Create logger name
    logger_name = name or __name__
    
    # Check if logger already initialized
    if logger_name in _initialized_loggers:
        return _initialized_loggers[logger_name]
    
    # Create logger
    logger = logging.getLogger(logger_name)
    logger.setLevel(level)
    
    # Remove existing handlers to avoid duplicates
    for handler in logger.handlers[:]:
        logger.removeHandler(handler)
    
    # Default format with proper spacing
    if format_string is None:
        format_string = "%(asctime)s %(levelname)s [%(name)s] - %(message)s"
    
    # Console handler with colors
    console_handler = logging.StreamHandler(sys.stdout)
    console_handler.setLevel(level)
    console_formatter = ColorFormatter(fmt=format_string, use_colors=use_colors)
    console_handler.setFormatter(console_formatter)
    logger.addHandler(console_handler)
    
    # File handler (without colors)
    if log_file:
        try:
            # Create log directory if it doesn't exist
            log_dir = os.path.dirname(log_file)
            if log_dir and not os.path.exists(log_dir):
                os.makedirs(log_dir, exist_ok=True)
            
            file_handler = logging.FileHandler(log_file, mode='a', encoding='utf-8')
            file_handler.setLevel(level)
            file_formatter = logging.Formatter(fmt=format_string, datefmt="%Y-%m-%d %H:%M:%S")
            file_handler.setFormatter(file_formatter)
            logger.addHandler(file_handler)
            
            logger.info(f"📁 Log file initialized: {log_file}")
            
        except Exception as e:
            logger.error(f"❌ Failed to initialize log file {log_file}: {e}")
    
    # Prevent logging messages from being handled by the root logger
    logger.propagate = False
    
    # Store in registry
    _initialized_loggers[logger_name] = logger
    
    return logger


def get_logger(name: Optional[str] = None) -> logging.Logger:
    """
    Get a logger instance. If not already configured, initialize with shared settings.
    
    Args:
        name: Logger name (defaults to calling module name)
        
    Returns:
        Logger instance
    """
    logger_name = name or __name__
    
    # Return existing logger if already initialized
    if logger_name in _initialized_loggers:
        return _initialized_loggers[logger_name]
    
    # Initialize with shared configuration if available
    return initialize_logger(
        name=logger_name,
        level=_shared_log_level,
        log_file=_shared_log_file,
        use_colors=True
    )