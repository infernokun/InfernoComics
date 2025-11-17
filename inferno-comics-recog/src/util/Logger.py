import os
import sys
import loguru
from typing import Optional, Dict
from loguru import logger as _loguru_logger

_shared_log_file: Optional[str] = None
_shared_log_level: int = _loguru_logger.level("INFO").no
_initialized_loggers: Dict[str, "loguru.Logger"] = {}

def _ensure_success_level() -> None:
    """Add a SUCCESS level (numeric value 25) to Loguru if it does not exist."""
    if "SUCCESS" not in _loguru_logger._core.levels:
        _loguru_logger.level("SUCCESS", no=25, color="<green>", icon="✅")

_ensure_success_level()

def set_global_log_config(log_file: str, level: int = _loguru_logger.level("INFO").no) -> None:
    """
    Store a global log file path and log level.
    All subsequently created loggers will inherit these settings.
    """
    global _shared_log_file, _shared_log_level
    _shared_log_file = log_file
    _shared_log_level = level
    
def _build_sink(use_colors: bool, fmt: str) -> callable:
    """
    Return a sink function that Loguru will call for each record.
    It injects a shortened logger name (``__main__`` stays unchanged) and
    optionally forces colour output.
    """
    def sink(message):
        record = message.record
        # Shorten the logger name but keep "__main__" unchanged
        name = record["name"]
        if name != "__main__" and "." in name:
            name = name.split(".")[-1]
        record["name"] = name

        # If colours are forced via env var, override Loguru's detection
        if os.getenv("FORCE_LOG_COLORS", "").lower() in ("true", "1", "yes"):
            record["colorize"] = True

        # Apply the format string (Loguru does the heavy lifting)
        sys.stdout.write(message.format(fmt))
    return sink

def initialize_logger(
    name: Optional[str] = None,
    level: int = _loguru_logger.level("INFO").no,
    log_file: Optional[str] = None,
    use_colors: bool = True,
    format_string: Optional[str] = None,
) -> "loguru.Logger":
    
    # Resolve the logical name
    logger_name = name or sys._getframe(1).f_globals.get("__name__", "__main__")

    # Return cached instance if we already built it
    if logger_name in _initialized_loggers:
        return _initialized_loggers[logger_name]
    
    logger = _loguru_logger.bind(__logger_name=logger_name)

    logger.remove()

    fmt = format_string or "{time:HH:mm:ss} {level:<8} [{name}] - {message}\n"
    console_sink = _build_sink(use_colors, fmt)
    logger.add(
        console_sink,
        level=level,
        colorize=use_colors,
        enqueue=True,
        backtrace=False,
        diagnose=False,
    )

    if log_file:
        log_dir = os.path.dirname(log_file)
        if log_dir and not os.path.isdir(log_dir):
            os.makedirs(log_dir, exist_ok=True)

        logger.add(
            log_file,
            level=level,
            format=fmt,
            encoding="utf-8",
            enqueue=True,
            backtrace=False,
            diagnose=False,
        )

    # Store in the registry for future ``get_logger`` calls
    _initialized_loggers[logger_name] = logger
    return logger

def get_logger(name: Optional[str] = None) -> "loguru.Logger":
    """
    Retrieve a logger, creating it on-the-fly with the *global* configuration
    (if any) when it does not yet exist.
    """
    logger_name = name or sys._getframe(1).f_globals.get("__name__", "__main__")
    if logger_name in _initialized_loggers:
        return _initialized_loggers[logger_name]

    # Use the shared configuration that may have been set via ``set_global_log_config``
    return initialize_logger(
        name=logger_name,
        level=_shared_log_level,
        log_file=_shared_log_file,
        use_colors=True,
    )