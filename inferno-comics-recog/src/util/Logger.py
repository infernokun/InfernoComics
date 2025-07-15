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
    
    RESET = "\033[0m"  # Reset color
    
    def __init__(self, fmt: str = None, datefmt: str = "%H:%M:%S", use_colors: bool = True):
        if fmt is None:
            fmt = "%(asctime)s - %(name)s - %(levelname)s - %(message)s"
        super().__init__(fmt, datefmt)
        self.use_colors = use_colors and self._supports_color()
    
    def _supports_color(self) -> bool:
        """Check if the terminal supports colors"""
        return (
            hasattr(sys.stdout, "isatty") and 
            sys.stdout.isatty() and 
            os.environ.get("TERM") != "dumb"
        )
    
    def format(self, record: logging.LogRecord) -> str:
        if self.use_colors:
            # Add color to the level name
            levelname = record.levelname
            if levelname in self.COLORS:
                colored_levelname = f"{self.COLORS[levelname]}{levelname}{self.RESET}"
                record.levelname = colored_levelname
        
        # Format the message
        formatted = super().format(record)
        
        # Reset levelname back to original (in case the record is used elsewhere)
        if self.use_colors:
            record.levelname = levelname
            
        return formatted


def custom_record_factory(*args, **kwargs) -> logging.LogRecord:
    """Custom record factory to add SUCCESS level support"""
    record = logging.LogRecord(*args, **kwargs)
    return record


def initialize_logger(name: Optional[str] = None, level: int = logging.INFO, log_file: Optional[str] = None, 
                      use_colors: bool = True, format_string: Optional[str] = None) -> logging.Logger:
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
    # Add SUCCESS level to logging module
    if not hasattr(logging, 'SUCCESS'):
        logging.SUCCESS = 25  # Between INFO (20) and WARNING (30)
        logging.addLevelName(logging.SUCCESS, 'SUCCESS')
        
        # Add success method to Logger class
        def success(self, message, *args, **kwargs):
            if self.isEnabledFor(logging.SUCCESS):
                self._log(logging.SUCCESS, message, args, **kwargs)
        
        logging.Logger.success = success
    
    # Set custom record factory
    logging.setLogRecordFactory(custom_record_factory)
    
    # Create logger
    logger_name = name or __name__
    logger = logging.getLogger(logger_name)
    logger.setLevel(level)
    
    # Remove existing handlers to avoid duplicates
    for handler in logger.handlers[:]:
        logger.removeHandler(handler)
    
    # Default format
    if format_string is None:
        format_string = "%(asctime)s - %(name)s - %(levelname)s - %(message)s"
    
    # Console handler with colors
    console_handler = logging.StreamHandler(sys.stdout)
    console_handler.setLevel(level)
    console_formatter = ColorFormatter(fmt=format_string, use_colors=use_colors)
    console_handler.setFormatter(console_formatter)
    logger.addHandler(console_handler)
    
    # File handler (without colors)
    if log_file:
        # Create log directory if it doesn't exist
        log_dir = os.path.dirname(log_file)
        if log_dir and not os.path.exists(log_dir):
            os.makedirs(log_dir)
        
        file_handler = logging.FileHandler(log_file)
        file_handler.setLevel(level)
        file_formatter = logging.Formatter(fmt=format_string, datefmt="%Y-%m-%d %H:%M:%S")
        file_handler.setFormatter(file_formatter)
        logger.addHandler(file_handler)
    
    # Prevent logging messages from being handled by the root logger
    logger.propagate = False
    
    return logger


def get_logger(name: Optional[str] = None) -> logging.Logger:
    """
    Get a logger instance. If not already configured, initialize with default settings.
    
    Args:
        name: Logger name
        
    Returns:
        Logger instance
    """
    logger_name = name or __name__
    logger = logging.getLogger(logger_name)
    
    # If logger has no handlers, initialize it
    if not logger.handlers:
        logger = initialize_logger(name=logger_name)
    
    return logger
