from util.Logger import get_logger
from config.ComicMatcherConfig import ComicMatcherConfig
from models.FeatureMatchingComicMatcher import FeatureMatchingComicMatcher

logger = get_logger(__name__)

def get_global_matcher_config():
    """Get the global matcher config instance from Flask app config"""
    try:
        from flask import current_app
        get_matcher_func = current_app.config.get('GET_MATCHER_CONFIG')
        if get_matcher_func:
            return get_matcher_func()
        else:
            logger.warning("Global matcher config not found, creating new instance")
            return ComicMatcherConfig()
    except Exception as e:
        logger.error(f"Error getting global matcher: {e}")
        return ComicMatcherConfig()

def get_global_matcher():
    """Get the global matcher instance from Flask app config"""
    try:
        from flask import current_app
        get_matcher_func = current_app.config.get('GET_MATCHER')
        if get_matcher_func:
            return get_matcher_func()
        else:
            # Fallback: create a new instance (should not happen in production)
            logger.warning("⚠️ Global matcher not found, creating new instance")
            return FeatureMatchingComicMatcher()
    except Exception as e:
        logger.error(f"Error getting global matcher: {e}")
        # Fallback: create a new instance
        return FeatureMatchingComicMatcher()