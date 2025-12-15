import os
import sys
import inspect

from pathlib import Path
from functools import lru_cache
from contextlib import contextmanager
from typing import Optional, Dict, Any, Union

from loguru import logger as _loguru_logger

# Type alias for clarity
LogLevel = Union[str, int]

class _LoggerState:
    _instance: Optional["_LoggerState"] = None
    
    def __new__(cls) -> "_LoggerState":
        if cls._instance is None:
            cls._instance = super().__new__(cls)
            cls._instance._initialized = False
        return cls._instance
    
    def __init__(self):
        if self._initialized:
            return
        
        self.log_file: Optional[str] = None
        self.log_level: str = "INFO"
        self.use_colors: bool = True
        self.format_string: Optional[str] = None
        self.loggers: Dict[str, Any] = {}
        self.project_root: Optional[Path] = None
        self._initialized = True

_state = _LoggerState()

@lru_cache(maxsize=256)
def _get_relative_path(file_path: str) -> str:
    if not file_path:
        return "unknown"
    
    path = Path(file_path)
    
    # Try to make path relative to project root
    if _state.project_root:
        try:
            return str(path.relative_to(_state.project_root))
        except ValueError:
            pass
    
    # Try common project indicators
    for marker in [".git", "pyproject.toml", "setup.py", "requirements.txt"]:
        current = path.parent
        while current != current.parent:
            if (current / marker).exists():
                try:
                    return str(path.relative_to(current))
                except ValueError:
                    pass
            current = current.parent
    
    # Fall back to just the filename
    return path.name

def _detect_color_support() -> bool:
    # Check environment overrides
    force_color = os.getenv("FORCE_COLOR", os.getenv("FORCE_LOG_COLORS", ""))
    if force_color.lower() in ("true", "1", "yes"):
        return True
    
    no_color = os.getenv("NO_COLOR", "")
    if no_color:
        return False
    
    # Check if running in a TTY
    if not hasattr(sys.stdout, "isatty"):
        return False
    
    if not sys.stdout.isatty():
        return False
    
    # Check TERM environment variable
    term = os.getenv("TERM", "")
    if term in ("dumb", ""):
        return False
    
    return True

def _patcher(record: Dict[str, Any]) -> None:
    # Get the caller's frame (skip loguru internals)
    frame = None
    
    for frame_info in inspect.stack():
        # Skip loguru internals and our logger module
        module = frame_info.frame.f_globals.get("__name__", "")
        filename = frame_info.filename
        
        if (
            "loguru" not in module 
            and "Logger" not in filename  # Skip our own module
            and "_pytest" not in module
        ):
            frame = frame_info
            break
    
    if frame:
        # Get just the filename (not full path)
        file_name = Path(frame.filename).name
        line_no = frame.lineno
        
        name = record.get("name", "__main__")
        
        record["extra"]["file_link"] = f"{file_name}:{line_no}"
        record["extra"]["caller_file"] = frame.filename
        record["extra"]["caller_line"] = line_no
        record["extra"]["caller_func"] = frame.function
    else:
        record["extra"]["file_link"] = "unknown:0"
        record["extra"]["caller_file"] = "unknown"
        record["extra"]["caller_line"] = 0
        record["extra"]["caller_func"] = "unknown"

def set_global_log_config(
    log_file: Optional[str] = None,
    level: str = "INFO",
    use_colors: Optional[bool] = None,
    format_string: Optional[str] = None,
    project_root: Optional[str] = None,
) -> None:
    _state.log_file = log_file
    _state.log_level = level.upper()
    _state.use_colors = use_colors if use_colors is not None else _detect_color_support()
    _state.format_string = format_string
    
    if project_root:
        _state.project_root = Path(project_root).resolve()

def initialize_logger(
    name: Optional[str] = None,
    level: Optional[str] = None,
    log_file: Optional[str] = None,
    use_colors: Optional[bool] = None,
    format_string: Optional[str] = None,
) -> Any:
    # Determine logger name
    if name is None:
        frame = inspect.currentframe()
        if frame and frame.f_back:
            name = frame.f_back.f_globals.get("__name__", "__main__")
        else:
            name = "__main__"
    
    # Return cached logger if exists
    if name in _state.loggers:
        return _state.loggers[name]
    
    # Resolve configuration (local overrides global)
    resolved_level = level or _state.log_level
    resolved_log_file = log_file or _state.log_file
    resolved_colors = use_colors if use_colors is not None else _state.use_colors
    resolved_format = format_string or _state.format_string or (
        "<green>{time:HH:mm:ss.SSS}</green> | "
        "<level>{level: <8}</level> | "
        "<cyan>{extra[file_link]: <35}</cyan> | "
        "<level>{message}</level>"
    )
    
    # Create bound logger with name
    logger = _loguru_logger.bind(name=name)
    
    # Remove default handler
    logger.remove()
    
    # Add custom patcher for file links
    logger = logger.patch(_patcher)
    
    # Add console handler
    logger.add(
        sys.stderr,
        format=resolved_format,
        level=resolved_level,
        colorize=resolved_colors,
        enqueue=True,
        backtrace=True,
        diagnose=True,
    )
    
    # Add file handler if configured
    if resolved_log_file:
        log_dir = os.path.dirname(resolved_log_file)
        if log_dir:
            os.makedirs(log_dir, exist_ok=True)
        
        logger.add(
            resolved_log_file,
            format="{time:YYYY-MM-DD HH:mm:ss.SSS} | {level: <8} | {extra[file_link]: <35} | {message}",
            level=resolved_level,
            rotation="10 MB",
            retention="7 days",
            compression="gz",
            encoding="utf-8",
            enqueue=True,
            backtrace=True,
            diagnose=True,
        )
    
    # Cache and return
    _state.loggers[name] = logger
    return logger

def get_logger(name: Optional[str] = None) -> Any:
    if name is None:
        frame = inspect.currentframe()
        if frame and frame.f_back:
            name = frame.f_back.f_globals.get("__name__", "__main__")
        else:
            name = "__main__"
    
    if name in _state.loggers:
        return _state.loggers[name]
    
    return initialize_logger(name=name)
