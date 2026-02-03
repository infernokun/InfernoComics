from util.Logger import get_logger
from config.ComicMatcherConfig import ComicMatcherConfig
from config.EnvironmentConfig import CACHE_DIR, DB_PATH

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


def _create_matcher_from_config(config: ComicMatcherConfig):
    """Create the appropriate matcher based on config's matcher_type"""
    matcher_type = config.get_matcher_type()

    try:
        if matcher_type == 'embedding':
            from models.EmbeddingComicMatcher import EmbeddingComicMatcher
            return EmbeddingComicMatcher(config, cache_dir=CACHE_DIR, db_path=DB_PATH)
        else:
            from models.FeatureMatchingComicMatcher import FeatureMatchingComicMatcher
            return FeatureMatchingComicMatcher(config, cache_dir=CACHE_DIR, db_path=DB_PATH)

    except ImportError as e:
        logger.error(f"Failed to import {matcher_type} matcher: {e}")
        if matcher_type == 'embedding':
            logger.warning("Falling back to FeatureMatchingComicMatcher")
            logger.info("To use EmbeddingComicMatcher, install: pip install torch open-clip-torch")
            from models.FeatureMatchingComicMatcher import FeatureMatchingComicMatcher
            return FeatureMatchingComicMatcher(config, cache_dir=CACHE_DIR, db_path=DB_PATH)
        raise


def get_global_matcher():
    """Get the global matcher instance from Flask app config"""
    try:
        from flask import current_app
        get_matcher_func = current_app.config.get('GET_MATCHER')
        if get_matcher_func:
            return get_matcher_func()
        else:
            # Fallback: create a new instance based on config (should not happen in production)
            logger.warning("Global matcher not found, creating new instance")
            config = get_global_matcher_config()
            return _create_matcher_from_config(config)
    except Exception as e:
        logger.error(f"Error getting global matcher: {e}")
        # Fallback: create a new instance based on config
        config = ComicMatcherConfig()
        return _create_matcher_from_config(config)
